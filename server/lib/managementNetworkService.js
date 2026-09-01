const crypto = require('crypto');
const os = require('os');
const { query, withTransaction } = require('../db/mysql');
const { cidrOverlaps, normalizeCidr } = require('./ipv4Cidr');
const mgmtNet = require('./mgmtNet');

function prefixFromNetmask(mask) {
  const parts = String(mask || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  const bits = parts.map(n => n.toString(2).padStart(8, '0')).join('');
  if (!/^1*0*$/.test(bits)) return null;
  return bits.indexOf('0') === -1 ? 32 : bits.indexOf('0');
}

function localInterfaceCidrs(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, addresses] of Object.entries(interfaces || {})) {
    for (const address of addresses || []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      const prefix = address.cidr?.split('/')[1] || prefixFromNetmask(address.netmask);
      const cidr = normalizeCidr(prefix == null ? '' : `${address.address}/${prefix}`, { allowHost: false });
      if (cidr) out.push({ source: 'HOST', name, cidr });
    }
  }
  return out;
}

function nodeCidrs(rows) {
  const out = [];
  for (const row of rows || []) {
    let values = [];
    try { values = Array.isArray(row.lan_subnets) ? row.lan_subnets : JSON.parse(row.lan_subnets || '[]'); }
    catch (_) { values = []; }
    if (row.segmento_lan) values.push(row.segmento_lan);
    for (const value of values) {
      const cidr = normalizeCidr(value, { allowHost: false });
      if (cidr) out.push({ source: 'SITE', name: row.nombre_nodo || row.ppp_user || 'sitio', cidr });
    }
  }
  return out;
}

async function previewManagementSupernet(cidr, options = {}) {
  const queryFn = options.queryFn || query;
  const interfaces = options.interfaces;
  const plan = mgmtNet.deriveSupernet(cidr);
  if (!plan) {
    return { valid: false, canSave: false, locked: false, blockers: ['Usa una red privada 10.x.x.0/22 alineada.'], overlaps: [], plan: null };
  }
  const [settings, nodeRows] = await Promise.all([
    queryFn("SELECT `key`, value FROM app_settings WHERE `key` IN ('management_supernet','core_provisioned_at')"),
    queryFn('SELECT ppp_user, nombre_nodo, segmento_lan, lan_subnets FROM nodes'),
  ]);
  const values = Object.fromEntries((settings || []).map(row => [row.key, row.value]));
  const locked = Boolean(values.core_provisioned_at || (nodeRows || []).length > 0);
  const sameValue = values.management_supernet === plan.net;
  const managedVpsAddress = `${plan.vpsBase}60/32`;
  const candidates = [
    // La propia wg0 del VPS forma parte del bloque que estamos validando. No es
    // un conflicto externo cuando conserva exactamente la IP administrada.
    ...localInterfaceCidrs(interfaces).filter(item => !(item.name === 'wg0' && item.cidr === managedVpsAddress)),
    ...nodeCidrs(nodeRows),
    { source: 'RESERVED', name: 'Nodos WireGuard', cidr: mgmtNet.nodes.wgNet },
    { source: 'RESERVED', name: 'Nodos SSTP', cidr: mgmtNet.nodes.sstpNet },
  ];
  const overlaps = candidates.filter(item => cidrOverlaps(plan.net, item.cidr));
  const blockers = [];
  if (locked && !sameValue) blockers.push('El bloque quedó fijado porque el Core ya fue preparado o existen nodos.');
  if (overlaps.length && !sameValue) blockers.push('El bloque se solapa con redes existentes del host, sitios o planos reservados.');
  return {
    valid: true,
    canSave: blockers.length === 0,
    locked,
    sameValue,
    blockers,
    overlaps,
    plan,
  };
}

async function saveManagementSupernet({ cidr, actorUserId, requestIp }, options = {}) {
  const transaction = options.transaction || withTransaction;
  const interfaces = options.interfaces;
  const preview = await previewManagementSupernet(cidr, { queryFn: options.queryFn, interfaces });
  if (!preview.valid) throw Object.assign(new Error(preview.blockers[0]), { code: 'MGMT_SUPERNET_INVALID', status: 422, preview });
  if (!preview.canSave) {
    const code = preview.locked && !preview.sameValue ? 'MGMT_SUPERNET_LOCKED' : 'MGMT_SUPERNET_OVERLAP';
    throw Object.assign(new Error(preview.blockers[0]), { code, status: 409, preview });
  }
  const plan = preview.plan;
  if (preview.locked && preview.sameValue) {
    mgmtNet.configureSupernet(plan.net);
    return { plan, migratedScanAssignments: 0, unchanged: true };
  }
  const result = await transaction(async tx => {
    const settings = await tx.query(
      "SELECT `key`, value FROM app_settings WHERE `key` IN ('management_supernet','core_provisioned_at') FOR UPDATE",
    );
    const values = Object.fromEntries(settings.map(row => [row.key, row.value]));
    const nodes = await tx.query('SELECT id FROM nodes LIMIT 1 FOR UPDATE');
    if ((values.core_provisioned_at || nodes.length > 0) && values.management_supernet !== plan.net) {
      throw Object.assign(new Error('El bloque de gestión quedó fijado al preparar el servidor por primera vez.'), { code: 'MGMT_SUPERNET_LOCKED', status: 409 });
    }
    const assignments = await tx.query('SELECT workspace_id, scan_ip FROM workspace_scan_ip FOR UPDATE');
    const now = Date.now();
    for (const row of assignments) {
      const host = Number(String(row.scan_ip || '').split('.').pop());
      if (!Number.isInteger(host) || host < 2 || host > 254) {
        throw Object.assign(new Error('Hay una asignación de escaneo inválida.'), { code: 'SCAN_ASSIGNMENT_INVALID', status: 409 });
      }
      await tx.query('UPDATE workspace_scan_ip SET scan_ip = ?, updated_at = ? WHERE workspace_id = ?', [
        `${plan.scanBase}${host}`, now, row.workspace_id,
      ]);
    }
    await tx.query(
      'INSERT INTO app_settings (`key`, value, updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)',
      ['management_supernet', plan.net, now],
    );
    await tx.query(`INSERT INTO platform_security_audit
      (id,actor_user_id,action,target,jail,category,reason,outcome,detail,request_ip,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
      crypto.randomUUID(), actorUserId, 'MGMT_SUPERNET_SET', plan.net, null,
      'NETWORK_CONFIG', 'Configuración inicial del plano de gestión', 'SUCCESS',
      JSON.stringify({ plan, migratedScanAssignments: assignments.length }), requestIp || null, now,
    ]);
    return { plan, migratedScanAssignments: assignments.length };
  });
  mgmtNet.configureSupernet(plan.net);
  return result;
}

module.exports = {
  prefixFromNetmask,
  localInterfaceCidrs,
  nodeCidrs,
  previewManagementSupernet,
  saveManagementSupernet,
};
