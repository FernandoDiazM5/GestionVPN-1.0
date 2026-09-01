const { connectToMikrotik, safeWrite, writeIdempotent, parseHandshakeSecs } = require('../routeros.service');
const { getAppSetting, setAppSetting, decryptPass } = require('../db.service');
const { normalizeCidr } = require('./ipv4Cidr');
const mgmtNet = require('./mgmtNet');

const MANAGED_PEER_COMMENT = 'GVPN:VPS';
const LOCKDOWN_COMMENT = 'GVPN:BLOCK-PUBLIC-MGMT';
const LOCAL_LIST = 'LIST-LOCAL-AUTHORIZED';
const MANAGEMENT_SERVICES = new Set(['api', 'api-ssl', 'winbox', 'ssh', 'www', 'www-ssl']);

function parseLocalNetworks(raw) {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const normalized = values.map(value => normalizeCidr(String(value).trim(), { allowHost: false })).filter(Boolean);
  return [...new Set(normalized)];
}

async function loadContext(localNetworksInput) {
  const [publicEndpoint, user, passData, supernet, savedNetworks] = await Promise.all([
    getAppSetting('server_public_ip'), getAppSetting('MT_USER'), getAppSetting('MT_PASS'),
    getAppSetting('management_supernet'), getAppSetting('core_local_networks'),
  ]);
  const plan = mgmtNet.configureSupernet(supernet);
  const localNetworks = parseLocalNetworks(localNetworksInput?.length ? localNetworksInput : savedNetworks);
  return {
    publicEndpoint: String(publicEndpoint || '').trim(), user: String(user || '').trim(),
    pass: passData ? decryptPass(passData) : '', localNetworks,
    tunnelHost: plan ? `${plan.vpsBase}1` : '',
  };
}

async function inspectThroughTunnel(context) {
  if (!context.user || !context.pass || !context.tunnelHost) return { connected: false, blockers: ['Faltan credenciales o red de gestión.'] };
  let api;
  try {
    api = await connectToMikrotik(context.tunnelHost, context.user, context.pass);
    const interfaces = await safeWrite(api, ['/interface/wireguard/print']);
    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
    const services = await safeWrite(api, ['/ip/service/print']);
    const interfaceLists = await safeWrite(api, ['/interface/list/print']);
    const interfaceListMembers = await safeWrite(api, ['/interface/list/member/print']);
    const iface = interfaces.find(item => item.name === mgmtNet.vps.iface);
    const peer = peers.find(item => item.interface === mgmtNet.vps.iface && item.comment === MANAGED_PEER_COMMENT);
    return { connected: true, api, iface, peer, services, interfaceLists, interfaceListMembers };
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* noop */ }
    return { connected: false, blockers: [`No se pudo administrar el Core por el túnel ${context.tunnelHost}: ${error.message}`] };
  }
}

async function previewCoreFirewallLockdown(localNetworksInput) {
  const context = await loadContext(localNetworksInput);
  const blockers = [];
  if (!context.publicEndpoint) blockers.push('Falta guardar la IP pública del MikroTik.');
  if (!context.localNetworks.length) blockers.push('Agrega al menos una red local autorizada.');
  const inspection = await inspectThroughTunnel(context);
  if (!inspection.connected) blockers.push(...inspection.blockers);
  else {
    if (!inspection.iface) blockers.push(`No existe ${mgmtNet.vps.iface} en el Core.`);
    if (!inspection.peer) blockers.push(`No existe el peer administrado ${MANAGED_PEER_COMMENT}.`);
    else if (parseHandshakeSecs(inspection.peer['last-handshake']) > 120) blockers.push('El peer VPS no tiene un handshake reciente (máximo 120 segundos).');
    if (!inspection.interfaceLists.some(item => item.name === 'LIST-WAN')) blockers.push('No existe LIST-WAN en el Core.');
    else if (!inspection.interfaceListMembers.some(item => item.list === 'LIST-WAN')) blockers.push('LIST-WAN no tiene una interfaz asociada.');
    try { await inspection.api.close(); } catch (_) { /* noop */ }
  }
  const allowedNetworks = [...new Set([...context.localNetworks, mgmtNet.vps.net, mgmtNet.clients.net, mgmtNet.admin.net])];
  return {
    valid: blockers.length === 0, canApply: blockers.length === 0, blockers,
    publicEndpoint: context.publicEndpoint, tunnelHost: context.tunnelHost,
    localNetworks: context.localNetworks, allowedNetworks,
    preserves: ['NAT y redirecciones', 'IP/ruta WAN', 'DNS', 'redes LAN autorizadas'],
    actions: [
      'Restringir Winbox, API, SSH y web a redes locales autorizadas y redes VPN.',
      'Bloquear esos servicios cuando el tráfico ingrese por LIST-WAN.',
      `Cambiar la conexión administrativa de Joinpoint a ${context.tunnelHost}.`,
      'Volver a conectar por el túnel y confirmar la administración.',
    ],
  };
}

async function applyCoreFirewallLockdown(localNetworksInput) {
  const preview = await previewCoreFirewallLockdown(localNetworksInput);
  if (!preview.canApply) throw Object.assign(new Error(preview.blockers.join(' ')), { code: 'CORE_LOCKDOWN_BLOCKED', preview });
  const context = await loadContext(preview.localNetworks);
  const inspection = await inspectThroughTunnel(context);
  if (!inspection.connected) throw Object.assign(new Error(inspection.blockers.join(' ')), { code: 'CORE_TUNNEL_UNREACHABLE' });
  const api = inspection.api;
  try {
    const addressList = await safeWrite(api, ['/ip/firewall/address-list/print']).catch(() => []);
    for (const network of preview.localNetworks) {
      if (!addressList.some(item => item.list === LOCAL_LIST && item.address === network)) {
        await writeIdempotent(api, ['/ip/firewall/address-list/add', `=list=${LOCAL_LIST}`, `=address=${network}`, '=comment=GVPN:LOCAL-AUTHORIZED']);
      }
    }
    for (const service of inspection.services.filter(item => MANAGEMENT_SERVICES.has(item.name) && item['.id'])) {
      await safeWrite(api, ['/ip/service/set', `=.id=${service['.id']}`, `=address=${preview.allowedNetworks.join(',')}`]);
    }
    const filters = await safeWrite(api, ['/ip/firewall/filter/print']).catch(() => []);
    if (!filters.some(item => item.comment === LOCKDOWN_COMMENT)) {
      const inputDrop = filters.find(item => item.chain === 'input' && item.action === 'drop' && item['.id'])?.['.id'];
      const command = ['/ip/firewall/filter/add', '=chain=input', '=action=drop', '=protocol=tcp',
        '=dst-port=22,80,443,8291,8728,8729', '=in-interface-list=LIST-WAN', `=comment=${LOCKDOWN_COMMENT}`];
      if (inputDrop) command.push(`=place-before=${inputDrop}`);
      await writeIdempotent(api, command);
    }
  } finally {
    try { await api.close(); } catch (_) { /* noop */ }
  }
  const verification = await inspectThroughTunnel(context);
  if (!verification.connected) throw Object.assign(new Error('El firewall se aplicó, pero falló la reconexión administrativa por el túnel.'), { code: 'CORE_LOCKDOWN_VERIFY_FAILED' });
  try { await verification.api.close(); } catch (_) { /* noop */ }
  await Promise.all([
    setAppSetting('MT_IP', context.tunnelHost),
    setAppSetting('core_local_networks', preview.localNetworks.join(',')),
    setAppSetting('core_firewall_locked_at', String(Date.now())),
  ]);
  return { applied: true, tunnelHost: context.tunnelHost, allowedNetworks: preview.allowedNetworks, preserves: preview.preserves };
}

module.exports = { parseLocalNetworks, previewCoreFirewallLockdown, applyCoreFirewallLockdown };
