const { connectToMikrotik, safeWrite, writeIdempotent } = require('../routeros.service');
const { getAppSetting } = require('../db.service');
const { loadCoreCredentials, vpsPeerAllowedAddresses, sameAddressSet } = require('./coreServerService');
const scanIpRepo = require('../db/repos/scanIpRepo');
const mgmtNet = require('./mgmtNet');

async function loadDesired() {
  const raw = await getAppSetting('vps_wireguard_desired').catch(() => '');
  try { return JSON.parse(raw || '{}'); } catch (_) { return {}; }
}

async function previewCoreVpsPeer(options = {}) {
  const desired = options.desired || await loadDesired();
  const vpsPublicKey = options.vpsPublicKey || null;
  const creds = options.creds || await loadCoreCredentials();
  if (!creds) return { valid: false, canSync: false, blockers: ['Configura las credenciales del Core.'], actions: [] };
  const hasVpsPublicKey = /^[A-Za-z0-9+/]{43}=$/.test(String(vpsPublicKey || ''));
  let api;
  try {
    const suppliedInventory = options.interfaces && options.peers;
    api = suppliedInventory ? null : (options.api || await connectToMikrotik(creds.ip, creds.user, creds.pass));
    let interfaces; let peers;
    if (suppliedInventory) { interfaces = options.interfaces; peers = options.peers; }
    else {
      interfaces = await safeWrite(api, ['/interface/wireguard/print']);
      peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
    }
    const iface = interfaces.find(item => item.name === mgmtNet.vps.iface);
    const blockers = [];
    if (!iface) blockers.push(`No existe ${mgmtNet.vps.iface} en el Core.`);
    if (!hasVpsPublicKey) blockers.push('El VPS todavía no publica una clave WireGuard válida.');
    if (iface && desired.corePublicKey && iface['public-key'] !== desired.corePublicKey) {
      blockers.push('La clave pública indicada no coincide con la interfaz WireGuard del Core.');
    }
    if (iface && Number(iface['listen-port']) !== Number(desired.coreEndpointPort)) {
      blockers.push(`El Core escucha en ${iface['listen-port'] || 'un puerto desconocido'}, no en ${desired.coreEndpointPort}.`);
    }
    const expectedAllowed = vpsPeerAllowedAddresses(scanIpRepo.poolSubnet() || mgmtNet.scan.net);
    const peer = peers.find(item => item.interface === mgmtNet.vps.iface
      && (item.comment === 'GVPN:VPS' || (hasVpsPublicKey && item['public-key'] === vpsPublicKey)));
    const changes = [];
    if (!peer) changes.push({ field: 'peer', action: 'CREATE' });
    else {
      if (peer['public-key'] !== vpsPublicKey) changes.push({ field: 'public-key', action: 'UPDATE' });
      if (!sameAddressSet(peer['allowed-address'], expectedAllowed)) changes.push({ field: 'allowed-address', action: 'UPDATE' });
    }
    return {
      valid: blockers.length === 0, canSync: blockers.length === 0, blockers, changes,
      interface: mgmtNet.vps.iface, corePublicKey: iface?.['public-key'] || null,
      listenPort: iface?.['listen-port'] ? Number(iface['listen-port']) : null,
      expectedAllowed, peerPresent: Boolean(peer), peerHandshake: peer?.['last-handshake'] || null,
      actions: ['Crear o actualizar únicamente el peer GVPN:VPS.', 'Conservar todos los demás peers.', 'Verificar handshake y Allowed Address después del cambio.'],
    };
  } finally {
    if (!options.api && api) try { await api.close(); } catch (_) { /* noop */ }
  }
}

async function syncCoreVpsPeer(vpsPublicKey) {
  const preview = await previewCoreVpsPeer({ vpsPublicKey });
  if (!preview.canSync) throw Object.assign(new Error(preview.blockers.join(' ')), { code: 'CORE_VPS_PEER_BLOCKED', preview });
  const creds = await loadCoreCredentials();
  let api;
  try {
    api = await connectToMikrotik(creds.ip, creds.user, creds.pass);
    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
    const peer = peers.find(item => item.interface === preview.interface && (item.comment === 'GVPN:VPS' || item['public-key'] === vpsPublicKey));
    if (!peer) {
      await writeIdempotent(api, ['/interface/wireguard/peers/add', `=interface=${preview.interface}`,
        `=public-key=${vpsPublicKey}`, `=allowed-address=${preview.expectedAllowed.join(',')}`,
        '=persistent-keepalive=25s', '=comment=GVPN:VPS']);
    } else {
      const command = ['/interface/wireguard/peers/set', `=.id=${peer['.id']}`];
      if (peer['public-key'] !== vpsPublicKey) command.push(`=public-key=${vpsPublicKey}`);
      if (!sameAddressSet(peer['allowed-address'], preview.expectedAllowed)) command.push(`=allowed-address=${preview.expectedAllowed.join(',')}`);
      if (command.length > 2) await safeWrite(api, command);
    }
    return { changed: preview.changes.length > 0, interface: preview.interface, allowedAddresses: preview.expectedAllowed };
  } finally {
    if (api) try { await api.close(); } catch (_) { /* noop */ }
  }
}

module.exports = { previewCoreVpsPeer, syncCoreVpsPeer, loadDesired };
