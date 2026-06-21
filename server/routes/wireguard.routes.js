// ============================================================
//  wireguard.routes.js — peers de gestión WireGuard del router core.
//  Fase F5.A: shape uniforme (sendOk/AppError) + validación Zod.
// ============================================================
const express = require('express');
const router = express.Router();

const { connectToMikrotik, safeWrite, getErrorMessage, writeIdempotent, parseHandshakeSecs } = require('../routeros.service');
const { getDb } = require('../db.service');
const { reqWorkspace } = require('../lib/tenantScope');
const { sendOk, AppError, asyncHandler } = require('../lib/apiResponse');
const { mikrotikAppError } = require('../lib/mikrotikError');
const { requireMikrotik } = require('../lib/routeGuards');
const {
  PeerAddRequestSchema, PeerEditRequestSchema,
  PeerColorRequestSchema, PeerAliasRequestSchema,
} = require('@gestionvpn/contracts');
const mgmtNet = require('../lib/mgmtNet');
const { lowestFreeOctet } = require('../lib/ipAlloc');
const log = require('../lib/logger').child({ scope: 'wireguard' });

// ─────────────────────────────────────────────────────────────
//  POST /wireguard/peers — listar peers de gestión visibles
// ─────────────────────────────────────────────────────────────
router.post('/wireguard/peers', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    // SECUENCIAL — RouterOS no soporta comandos paralelos en la misma conexión
    const peers  = await safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => []);
    const ifaces = await safeWrite(api, ['/interface/wireguard/print']).catch(() => []);
    const cloud  = await safeWrite(api, ['/ip/cloud/print']).catch(() => []);
    await api.close();
    // El servidor que se reporta para construir .conf de nuevos peers admin
    // es la interfaz ADMIN; el listado muestra peers de usuario (CLIENTES + ADMIN).
    const mgmtIface = ifaces.find(i => i.name === mgmtNet.admin.iface);
    const publicIP = cloud?.[0]?.['public-address'] || '';
    let result = peers
      .filter(p => mgmtNet.userIfaces.includes(p.interface))
      .map(p => {
        const secs = parseHandshakeSecs(p['last-handshake'] || '');
        return {
          id: p['.id'],
          name: p.comment || p.name || `Peer ${p['.id']}`,
          allowedAddress: (p['allowed-address'] || '').split('/')[0],
          publicKey: p['public-key'] || '',
          lastHandshakeSecs: isFinite(secs) ? secs : null,
          active: secs < 300,
        };
      });

    // Aislamiento multi-tenant: cada moderador solo ve sus peers de gestión.
    // Admin (ws === null) ve todos. Peers sin dueño → solo admin.
    const ws = reqWorkspace(req);
    const db = await getDb();
    if (ws !== null) {
      const owners = await db.all('SELECT public_key, workspace_id FROM mgmt_peer_owners');
      const ownerMap = {};
      owners.forEach(o => { ownerMap[o.public_key] = o.workspace_id; });
      result = result.filter(p => ownerMap[p.publicKey] === ws);
    }

    // Enriquecer cada peer con el email del usuario dueño cuando exista
    // mapeo en member_wireguard (peer del MEMBER) o en user_mgmt_ips
    // (asignación de IP de gestión). Si no hay match → email queda
    // undefined y la UI muestra "—".
    if (result.length > 0) {
      const mwRows = await db.all(
        `SELECT mw.public_key, u.email
           FROM member_wireguard mw
           JOIN users u ON u.id = mw.user_id`
      );
      const umiRows = await db.all(
        `SELECT umi.public_key, umi.mgmt_ip, u.email
           FROM user_mgmt_ips umi
           JOIN users u ON u.id = umi.user_id`
      );
      const emailByPk = {};
      const emailByIp = {};
      mwRows.forEach(r => { if (r.public_key && r.email) emailByPk[r.public_key] = r.email; });
      umiRows.forEach(r => {
        if (r.public_key && r.email) emailByPk[r.public_key] = emailByPk[r.public_key] || r.email;
        if (r.mgmt_ip   && r.email) emailByIp[r.mgmt_ip]   = emailByIp[r.mgmt_ip]   || r.email;
      });
      result = result.map(p => ({
        ...p,
        email: emailByPk[p.publicKey] || emailByIp[p.allowedAddress] || undefined,
      }));
    }

    // Alias humano del peer (anotación libre del moderador: "PC casa",
    // "Celular Personal", etc). Vive en BD del panel — el comment del
    // peer en MikroTik queda intacto para preservar la trazabilidad.
    // Aislado por workspace; admin (ws null) ve todos los alias.
    if (result.length > 0) {
      const aliasRows = ws !== null
        ? await db.all('SELECT peer_address, alias FROM peer_aliases WHERE workspace_id = ?', [ws])
        : await db.all('SELECT peer_address, alias FROM peer_aliases');
      const aliasByIp = {};
      aliasRows.forEach(r => { if (r.peer_address && r.alias) aliasByIp[r.peer_address] = r.alias; });
      result = result.map(p => ({ ...p, alias: aliasByIp[p.allowedAddress] || undefined }));
    }

    return sendOk(res, {
      peers: result,
      serverPublicKey: mgmtIface?.['public-key'] || '',
      serverListenPort: parseInt(mgmtIface?.['listen-port'] || '0') || 0,
      serverPublicIP: publicIP,
    });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    log.error({ ip, errno: error?.errno, code: error?.code, err: error?.message }, 'WG-PEERS fallo');
    throw mikrotikAppError(error, ip, user);
  }
}));

// ─────────────────────────────────────────────────────────────
//  POST /wireguard/peer/add
// ─────────────────────────────────────────────────────────────
router.post('/wireguard/peer/add', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { name, publicKey } = PeerAddRequestSchema.parse(req.body);

  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
    const mgmtPeers = peers.filter(p => p.interface === mgmtNet.admin.iface);
    const usedIPs = mgmtPeers
      .map(p => (p['allowed-address'] || '').split('/')[0])
      .filter(a => a.startsWith(mgmtNet.admin.base))
      .map(a => parseInt(a.split('.')[3]))
      .filter(n => !isNaN(n));
    const nextIP = `${mgmtNet.admin.base}${lowestFreeOctet(usedIPs, mgmtNet.admin.start)}`;
    await writeIdempotent(api, [
      '/interface/wireguard/peers/add',
      `=interface=${mgmtNet.admin.iface}`,
      `=public-key=${publicKey}`,
      `=allowed-address=${nextIP}/32`,
      `=comment=${name || 'Admin'}`,
    ]);
    await api.close();

    // Atribuir el peer al workspace del moderador que lo creó (aislamiento)
    try {
      const db = await getDb();
      await db.run(
        `INSERT INTO mgmt_peer_owners (public_key, workspace_id, allowed_address, comment, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(public_key) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           allowed_address = excluded.allowed_address,
           comment = excluded.comment`,
        [publicKey, reqWorkspace(req), `${nextIP}/32`, name || 'Admin', Date.now()]
      );
    } catch (e) { log.warn({ err: e.message }, 'WG-PEER-ADD: no se pudo registrar dueño'); }

    return sendOk(res, { assignedIP: nextIP, message: `Administrador creado con IP ${nextIP}` });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw mikrotikAppError(error, ip, user);
  }
}));

// ─────────────────────────────────────────────────────────────
//  POST /wireguard/peer/edit — renombrar peer (sólo comment)
// ─────────────────────────────────────────────────────────────
router.post('/wireguard/peer/edit', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { peerId, newName } = PeerEditRequestSchema.parse(req.body);

  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);

    // Aislamiento: un moderador solo puede editar peers de su workspace
    const ws = reqWorkspace(req);
    if (ws !== null) {
      const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
      const target = peers.find(p => p['.id'] === peerId);
      const db = await getDb();
      const owner = target ? await db.get('SELECT workspace_id FROM mgmt_peer_owners WHERE public_key = ?', [target['public-key']]) : null;
      if (!target || !owner || owner.workspace_id !== ws) {
        await api.close();
        throw new AppError('Peer no encontrado', 404, 'NOT_FOUND');
      }
    }

    await safeWrite(api, ['/interface/wireguard/peers/set', `=.id=${peerId}`, `=comment=${newName}`]);
    await api.close();
    return sendOk(res);
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw mikrotikAppError(error, ip, user);
  }
}));

// ─────────────────────────────────────────────────────────────
//  POST /wireguard/peer/color/save — UI only (no MikroTik)
// ─────────────────────────────────────────────────────────────
router.post('/wireguard/peer/color/save', asyncHandler(async (req, res) => {
  const { peerAddress, color } = PeerColorRequestSchema.parse(req.body);
  const db = await getDb();
  await db.run(
    'INSERT INTO peer_colors (peer_address, color) VALUES (?, ?) ON CONFLICT(peer_address) DO UPDATE SET color = excluded.color',
    [peerAddress, color]
  );
  return sendOk(res);
}));

router.get('/wireguard/peer/colors', asyncHandler(async (_req, res) => {
  const db = await getDb();
  const rows = await db.all('SELECT peer_address, color FROM peer_colors');
  const colors = {};
  rows.forEach(r => { colors[r.peer_address] = r.color; });
  return sendOk(res, { colors });
}));

// ─────────────────────────────────────────────────────────────
//  POST /wireguard/peer/alias/save — alias humano por workspace
//   - alias '' o undefined → borra la entrada.
//   - Aislado por workspace. Admin (ws null) escribe sobre workspace_id = ''.
// ─────────────────────────────────────────────────────────────
router.post('/wireguard/peer/alias/save', asyncHandler(async (req, res) => {
  const { peerAddress, alias } = PeerAliasRequestSchema.parse(req.body || {});
  const trimmed = (alias || '').trim();
  const ws = reqWorkspace(req) ?? '';
  const db = await getDb();
  if (!trimmed) {
    await db.run('DELETE FROM peer_aliases WHERE workspace_id = ? AND peer_address = ?', [ws, peerAddress]);
  } else {
    await db.run(
      `INSERT INTO peer_aliases (workspace_id, peer_address, alias, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(workspace_id, peer_address) DO UPDATE SET
         alias = excluded.alias,
         updated_at = excluded.updated_at`,
      [ws, peerAddress, trimmed, Date.now()]
    );
  }
  return sendOk(res, { alias: trimmed || null });
}));

module.exports = router;
