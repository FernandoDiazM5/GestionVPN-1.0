const { connectToMikrotik, safeWrite, writeIdempotent, classifyError } = require('../routeros.service');
const { getAppSetting, setAppSetting, decryptPass } = require('../db.service');
const mgmtNet = require('./mgmtNet');
const scanIpRepo = require('../db/repos/scanIpRepo');
const { cidrOverlaps, normalizeCidr } = require('./ipv4Cidr');
const { readWireguardAgentResult } = require('./vpsWireguardIntent');
const log = require('./logger').child({ scope: 'core-server' });

const OWNED = 'GVPN:';
const NODE_NAME_RE = /^(WG-ND|VPN-SSTP-ND|VRF-ND)/i;

function managementAddressListNetworks(scanNet) {
  const networks = [...new Set([
    mgmtNet.vps.net,
    mgmtNet.clients.net,
    mgmtNet.admin.net,
    scanNet,
  ].filter(Boolean))];
  return { trusted: networks, active: networks };
}

function vpsPeerAllowedAddresses(scanNet) {
  return [...new Set([`${mgmtNet.vps.ip}/32`, scanNet].filter(Boolean))];
}

function sameAddressSet(current, expected) {
  const actual = String(current || '').split(',').map(value => value.trim()).filter(Boolean).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((value, index) => value === wanted[index]);
}

async function loadCoreCredentials() {
  const [ip, user, passData] = await Promise.all([
    getAppSetting('MT_IP'), getAppSetting('MT_USER'), getAppSetting('MT_PASS'),
  ]);
  if (!ip || !user || !passData) return null;
  return { ip: String(ip).trim(), user: String(user).trim(), pass: decryptPass(passData) };
}

function first(rows) { return Array.isArray(rows) ? (rows[0] || {}) : (rows || {}); }
function isEnabled(row) { return row && row.disabled !== 'true' && row.disabled !== true; }

function deriveWanInterface(defaultRoutes, dhcpClients = []) {
  const active = (defaultRoutes || []).find(r => isEnabled(r) && r.active !== 'false') || (defaultRoutes || [])[0];
  const immediate = String(active?.['immediate-gw'] || active?.gateway || '');
  if (immediate.includes('%')) return immediate.split('%').pop();
  const dhcp = (dhcpClients || []).find(isEnabled);
  return dhcp?.interface || '';
}

async function readInventory(api) {
  // RouterOS no tolera bien comandos simultáneos sobre una misma sesión.
  const identity = first(await safeWrite(api, ['/system/identity/print']));
  const resource = first(await safeWrite(api, ['/system/resource/print']));
  const routes = await safeWrite(api, ['/ip/route/print', '?dst-address=0.0.0.0/0']).catch(() => []);
  const dhcpClients = await safeWrite(api, ['/ip/dhcp-client/print']).catch(() => []);
  const interfaces = await safeWrite(api, ['/interface/print']).catch(() => []);
  const wireguard = await safeWrite(api, ['/interface/wireguard/print']).catch(() => []);
  const peers = await safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => []);
  const sstpServer = first(await safeWrite(api, ['/interface/sstp-server/server/print']).catch(() => []));
  const sstpInterfaces = await safeWrite(api, ['/interface/sstp-server/print']).catch(() => []);
  const pppSecrets = await safeWrite(api, ['/ppp/secret/print']).catch(() => []);
  const vrfs = await safeWrite(api, ['/ip/vrf/print']).catch(() => []);
  const filters = await safeWrite(api, ['/ip/firewall/filter/print']).catch(() => []);
  const services = await safeWrite(api, ['/ip/service/print']).catch(() => []);
  const ipAddresses = await safeWrite(api, ['/ip/address/print']).catch(() => []);
  return {
    identity, resource, routes, dhcpClients, interfaces, wireguard, peers,
    sstpServer, sstpInterfaces, pppSecrets, vrfs, filters, services, ipAddresses,
    wanInterface: deriveWanInterface(routes, dhcpClients),
  };
}

function summarizeInventory(inv) {
  const defaultRoute = (inv.routes || []).find(r => isEnabled(r) && r.active !== 'false');
  const vpsPeer = (inv.peers || []).find(p => p.interface === mgmtNet.vps.iface || p.comment === 'VPS');
  const mgmtIfaces = (inv.wireguard || []).filter(i => mgmtNet.ifaces.includes(i.name));
  const ownedCount = [
    ...(inv.wireguard || []), ...(inv.peers || []), ...(inv.filters || []),
  ].filter(r => String(r.comment || '').startsWith(OWNED)).length;
  const operationalObjects = [
    ...(inv.interfaces || []).filter(i => NODE_NAME_RE.test(i.name || '')),
    ...(inv.vrfs || []).filter(v => NODE_NAME_RE.test(v.name || '')),
    ...(inv.sstpInterfaces || []).filter(i => NODE_NAME_RE.test(i.name || '')),
    ...(inv.pppSecrets || []),
  ];
  const vpnReady = mgmtIfaces.length === 3 && (isEnabled(inv.sstpServer) || (inv.wireguard || []).length > 0);
  return {
    identity: inv.identity?.name || 'MikroTik',
    version: inv.resource?.version || '',
    model: inv.resource?.['board-name'] || inv.resource?.platform || '',
    architecture: inv.resource?.['architecture-name'] || '',
    uptime: inv.resource?.uptime || '',
    cpuLoad: Number(inv.resource?.['cpu-load'] || 0),
    freeMemory: Number(inv.resource?.['free-memory'] || 0),
    wanInterface: inv.wanInterface || '',
    internetOk: !!defaultRoute,
    apiOk: true,
    wireguard: { total: (inv.wireguard || []).length, management: mgmtIfaces.length },
    sstp: { enabled: isEnabled(inv.sstpServer), port: Number(inv.sstpServer?.port || 0) || null },
    vpsPeer: vpsPeer ? { present: true, lastHandshake: vpsPeer['last-handshake'] || null } : { present: false, lastHandshake: null },
    firewallRules: (inv.filters || []).length,
    managedObjects: ownedCount,
    operationalObjects: operationalObjects.length,
    vpnReady,
    status: defaultRoute && vpnReady ? 'HEALTHY' : 'DEGRADED',
  };
}

async function inspectCore() {
  const creds = await loadCoreCredentials();
  if (!creds) return { configured: false, status: 'NOT_CONFIGURED', apiOk: false };
  let api;
  try {
    api = await connectToMikrotik(creds.ip, creds.user, creds.pass);
    const inv = await readInventory(api);
    return { configured: true, host: creds.ip, ...summarizeInventory(inv) };
  } catch (error) {
    const type = classifyError(error);
    return {
      configured: true,
      host: creds.ip,
      apiOk: false,
      status: type === 'login' ? 'INVALID_CREDENTIALS' : 'UNREACHABLE',
      errorCode: type,
    };
  } finally {
    if (api) try { await api.close(); } catch (_) { /* noop */ }
  }
}

function unexpectedManagementOverlaps(ipAddresses, networkPlan) {
  const expectedManagement = new Map([
    [mgmtNet.vps.iface, networkPlan.vpsNet],
    [mgmtNet.clients.iface, networkPlan.clientsNet],
    [mgmtNet.admin.iface, networkPlan.adminNet],
  ]);
  return (ipAddresses || [])
    .map(row => ({ interface: row.interface || '', cidr: normalizeCidr(row.address, { allowHost: false }) }))
    .filter(row => row.cidr && cidrOverlaps(networkPlan.net, row.cidr))
    .filter(row => expectedManagement.get(row.interface) !== row.cidr);
}

async function previewProvision() {
  const creds = await loadCoreCredentials();
  if (!creds) return { canProvision: false, blockers: ['Configura IP, usuario y contraseña del MikroTik.'], actions: [] };
  let api;
  try {
    api = await connectToMikrotik(creds.ip, creds.user, creds.pass);
    const inv = await readInventory(api);
    const summary = summarizeInventory(inv);
    const [wanOverride, savedVpsPublicKey, sstpPort, managementSupernet, agentResult] = await Promise.all([
      getAppSetting('core_wan_interface'), getAppSetting('core_vps_public_key'), getAppSetting('sstp_port'),
      getAppSetting('management_supernet'), readWireguardAgentResult(),
    ]);
    const vpsPublicKey = savedVpsPublicKey || agentResult?.publicKey || '';
    const wanInterface = String(wanOverride || inv.wanInterface || '').trim();
    const blockers = [];
    if (summary.operationalObjects > 0) blockers.push('El equipo contiene nodos, PPP secrets o VRF operativos. El aprovisionamiento desde cero no migra ni modifica esos objetos.');
    if (!summary.internetOk) blockers.push('No se detectó una ruta default activa a Internet.');
    if (!wanInterface) blockers.push('No se pudo detectar la interfaz WAN; configúrala manualmente.');
    if (!/^[A-Za-z0-9+/]{43}=$/.test(String(vpsPublicKey || '').trim())) blockers.push('Falta una clave pública WireGuard válida del VPS.');
    const networkPlan = mgmtNet.deriveSupernet(managementSupernet);
    if (!networkPlan) blockers.push('Define y guarda el bloque privado /22 de gestión antes de preparar el servidor.');
    else {
      const coreOverlaps = unexpectedManagementOverlaps(inv.ipAddresses, networkPlan);
      if (coreOverlaps.length) {
        blockers.push(`El /22 se solapa con direcciones existentes del Core: ${coreOverlaps.map(row => `${row.interface} ${row.cidr}`).join(', ')}.`);
      }
      mgmtNet.configureSupernet(networkPlan.net);
    }
    const actions = [
      'Crear listas LIST-WAN/LIST-VPN-TOWERS/LIST-VPN-WG/LIST-VPN-SSTP si faltan',
      `Asociar ${wanInterface || 'WAN pendiente'} a LIST-WAN`,
      `Crear ${mgmtNet.vps.iface}, ${mgmtNet.clients.iface} y ${mgmtNet.admin.iface}`,
      `Asignar gateways ${mgmtNet.vps.base}1, ${mgmtNet.clients.base}1 y ${mgmtNet.admin.base}1`,
      'Crear peer del VPS con red de gestión y scan-pool',
      `Preparar SSTP en puerto ${Number(sstpPort || 443)}`,
      'Crear address-lists y reglas GVPN de gestión/aislamiento',
      'Ampliar allowlist de API/Winbox sin retirar orígenes existentes',
      ...(networkPlan ? [`Fijar ${networkPlan.net}: escaneo ${networkPlan.scanNet}, clientes ${networkPlan.clientsNet}, VPS ${networkPlan.vpsNet}, administración ${networkPlan.adminNet}`] : []),
    ];
    return { canProvision: blockers.length === 0, blockers, actions, summary, wanInterface };
  } finally {
    if (api) try { await api.close(); } catch (_) { /* noop */ }
  }
}

async function ensureList(api, existing, name, comment) {
  if (existing.some(x => x.name === name)) return false;
  await writeIdempotent(api, ['/interface/list/add', `=name=${name}`, `=comment=${comment}`]);
  existing.push({ name });
  return true;
}

async function ensureListMember(api, existing, list, iface) {
  if (existing.some(x => x.list === list && x.interface === iface)) return false;
  await writeIdempotent(api, ['/interface/list/member/add', `=list=${list}`, `=interface=${iface}`, `=comment=${OWNED}LIST-MEMBER`]);
  existing.push({ list, interface: iface });
  return true;
}

async function ensureAddressList(api, existing, list, address, comment) {
  if (existing.some(x => x.list === list && x.address === address)) return false;
  await writeIdempotent(api, ['/ip/firewall/address-list/add', `=list=${list}`, `=address=${address}`, `=comment=${comment}`]);
  existing.push({ list, address });
  return true;
}

async function ensureFilter(api, existing, rule, beforeId) {
  if (existing.some(x => x.comment === rule.comment)) return false;
  const cmd = ['/ip/firewall/filter/add', `=chain=${rule.chain}`, `=action=${rule.action}`, `=comment=${rule.comment}`];
  for (const [key, value] of Object.entries(rule.params || {})) cmd.push(`=${key}=${value}`);
  if (beforeId) cmd.push(`=place-before=${beforeId}`);
  await writeIdempotent(api, cmd);
  existing.push({ comment: rule.comment });
  return true;
}

async function provisionCore() {
  const preview = await previewProvision();
  if (!preview.canProvision) {
    const err = new Error(preview.blockers.join(' '));
    err.code = 'CORE_PROVISION_BLOCKED';
    err.preview = preview;
    throw err;
  }
  const creds = await loadCoreCredentials();
  const [savedVpsPublicKey, sstpPortRaw, agentResult] = await Promise.all([
    getAppSetting('core_vps_public_key'), getAppSetting('sstp_port'), readWireguardAgentResult(),
  ]);
  const vpsPublicKey = String(savedVpsPublicKey || agentResult?.publicKey || '').trim();
  const sstpPort = Number(sstpPortRaw || 443);
  const scanNet = scanIpRepo.poolSubnet() || '10.11.252.0/24';
  let api;
  const steps = [];
  const record = (name, changed) => steps.push({ name, status: changed ? 'CREATED' : 'EXISTS' });
  try {
    api = await connectToMikrotik(creds.ip, creds.user, creds.pass);
    const lists = await safeWrite(api, ['/interface/list/print']).catch(() => []);
    for (const [name, comment] of [
      ['LIST-WAN', `${OWNED}WAN`], ['LIST-VPN-TOWERS', `${OWNED}TOWERS`],
      ['LIST-VPN-WG', `${OWNED}WG`], ['LIST-VPN-SSTP', `${OWNED}SSTP`],
    ]) record(`Lista ${name}`, await ensureList(api, lists, name, comment));

    const members = await safeWrite(api, ['/interface/list/member/print']).catch(() => []);
    record('Miembro WAN', await ensureListMember(api, members, 'LIST-WAN', preview.wanInterface));

    const wg = await safeWrite(api, ['/interface/wireguard/print']).catch(() => []);
    for (const plane of [mgmtNet.vps, mgmtNet.clients, mgmtNet.admin]) {
      if (!wg.some(i => i.name === plane.iface)) {
        await writeIdempotent(api, ['/interface/wireguard/add', `=name=${plane.iface}`, `=listen-port=${plane.port}`, '=mtu=1420', `=comment=${OWNED}MGMT`]);
        wg.push({ name: plane.iface });
        record(`WireGuard ${plane.iface}`, true);
      } else record(`WireGuard ${plane.iface}`, false);
      record(`Lista VPN ${plane.iface}`, await ensureListMember(api, members, 'LIST-VPN-WG', plane.iface));
    }

    const addresses = await safeWrite(api, ['/ip/address/print']).catch(() => []);
    for (const plane of [mgmtNet.vps, mgmtNet.clients, mgmtNet.admin]) {
      const address = `${plane.base}1/24`;
      if (!addresses.some(a => a.interface === plane.iface && a.address === address)) {
        await writeIdempotent(api, ['/ip/address/add', `=interface=${plane.iface}`, `=address=${address}`, `=comment=${OWNED}GW`]);
        addresses.push({ interface: plane.iface, address });
        record(`Gateway ${address}`, true);
      } else record(`Gateway ${address}`, false);
    }

    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => []);
    const expectedVpsAllowed = vpsPeerAllowedAddresses(scanNet);
    const vpsPeer = peers.find(p => p.interface === mgmtNet.vps.iface && p['public-key'] === vpsPublicKey);
    if (!vpsPeer) {
      await writeIdempotent(api, ['/interface/wireguard/peers/add', `=interface=${mgmtNet.vps.iface}`,
        `=public-key=${vpsPublicKey}`, `=allowed-address=${expectedVpsAllowed.join(',')}`,
        '=persistent-keepalive=25s', `=comment=${OWNED}VPS`]);
      record('Peer VPS', true);
    } else if (!sameAddressSet(vpsPeer['allowed-address'], expectedVpsAllowed)) {
      await safeWrite(api, ['/interface/wireguard/peers/set', `=.id=${vpsPeer['.id']}`,
        `=allowed-address=${expectedVpsAllowed.join(',')}`]);
      record('Peer VPS', true);
    } else record('Peer VPS', false);

    const pools = await safeWrite(api, ['/ip/pool/print']).catch(() => []);
    if (!pools.some(p => p.name === 'POOL-VPN-SSTP')) {
      await writeIdempotent(api, ['/ip/pool/add', '=name=POOL-VPN-SSTP',
        `=ranges=${mgmtNet.nodes.sstpBase}200-${mgmtNet.nodes.sstpBase}250`, `=comment=${OWNED}SSTP-POOL`]);
      record('Pool SSTP', true);
    } else record('Pool SSTP', false);

    const profiles = await safeWrite(api, ['/ppp/profile/print']).catch(() => []);
    if (!profiles.some(p => p.name === 'PROF-VPN-TOWERS')) {
      await writeIdempotent(api, ['/ppp/profile/add', '=name=PROF-VPN-TOWERS',
        `=local-address=${mgmtNet.nodes.sstpLocal}`, '=remote-address=POOL-VPN-SSTP',
        '=use-encryption=yes', '=dns-server=8.8.8.8', `=comment=${OWNED}SSTP-PROFILE`]);
      record('Perfil SSTP', true);
    } else record('Perfil SSTP', false);
    await safeWrite(api, ['/interface/sstp-server/server/set', '=enabled=yes', `=port=${sstpPort}`,
      '=authentication=mschap2', '=tls-version=only-1.2'], 10000);
    record('Listener SSTP', true);

    const addrLists = await safeWrite(api, ['/ip/firewall/address-list/print']).catch(() => []);
    const managementLists = managementAddressListNetworks(scanNet);
    for (const net of managementLists.trusted) {
      record(`Trusted ${net}`, await ensureAddressList(api, addrLists, 'LIST-MGMT-TRUSTED', net, `${OWNED}MGMT-TRUSTED`));
    }
    for (const net of managementLists.active) {
      record(`VPN activa ${net}`, await ensureAddressList(api, addrLists, 'vpn-activa', net, `${OWNED}VPN-ACTIVA`));
    }

    const filters = await safeWrite(api, ['/ip/firewall/filter/print']).catch(() => []);
    const inputDrop = filters.find(f => f.chain === 'input' && f.action === 'drop' && f['.id'])?.['.id'];
    const forwardDrop = filters.find(f => f.chain === 'forward' && f.action === 'drop' && f['.id'])?.['.id'];
    const rules = [
      { chain: 'input', action: 'accept', comment: `${OWNED}INPUT-MGMT-WG`, params: { protocol: 'udp', 'dst-port': `${mgmtNet.vps.port},${mgmtNet.clients.port},${mgmtNet.admin.port}` }, before: inputDrop },
      { chain: 'input', action: 'accept', comment: `${OWNED}INPUT-SSTP`, params: { protocol: 'tcp', 'dst-port': String(sstpPort) }, before: inputDrop },
      { chain: 'input', action: 'accept', comment: `${OWNED}INPUT-MGMT-SERVICES`, params: { protocol: 'tcp', 'dst-port': '8291,8728,8729', 'src-address-list': 'LIST-MGMT-TRUSTED' }, before: inputDrop },
      { chain: 'forward', action: 'drop', comment: `${OWNED}ISOLATE-NODES`, params: { 'in-interface-list': 'LIST-VPN-TOWERS', 'out-interface-list': 'LIST-VPN-TOWERS' }, before: forwardDrop },
      { chain: 'forward', action: 'accept', comment: `${OWNED}MGMT-TO-TOWERS`, params: { 'src-address-list': 'vpn-activa', 'dst-address-list': 'LIST-NET-REMOTE-TOWERS' }, before: forwardDrop },
      { chain: 'forward', action: 'accept', comment: `${OWNED}TOWERS-RETURN`, params: { 'src-address-list': 'LIST-NET-REMOTE-TOWERS', 'dst-address-list': 'LIST-MGMT-TRUSTED' }, before: forwardDrop },
      { chain: 'forward', action: 'drop', comment: `${OWNED}BLOCK-NODE-INTERNET`, params: { 'in-interface-list': 'LIST-VPN-TOWERS', 'out-interface-list': 'LIST-WAN' }, before: forwardDrop },
    ];
    for (const rule of rules) record(rule.comment, await ensureFilter(api, filters, rule, rule.before));

    const services = await safeWrite(api, ['/ip/service/print']).catch(() => []);
    const allowedNets = [mgmtNet.vps.net, mgmtNet.clients.net, mgmtNet.admin.net];
    for (const name of ['api', 'api-ssl', 'winbox']) {
      const service = services.find(s => s.name === name && s['.id']);
      if (!service) continue;
      const merged = new Set(String(service.address || '').split(',').map(x => x.trim()).filter(Boolean));
      allowedNets.forEach(n => merged.add(n));
      await safeWrite(api, ['/ip/service/set', `=.id=${service['.id']}`, `=address=${[...merged].join(',')}`]);
    }
    record('Allowlist API/Winbox', true);

    await setAppSetting('core_mode', 'managed');
    await setAppSetting('core_provisioned_at', String(Date.now()));
    const finalInventory = await readInventory(api);
    return { steps, health: summarizeInventory(finalInventory) };
  } catch (error) {
    error.steps = steps;
    log.error({ code: error.code, message: error.message }, 'Aprovisionamiento del core falló');
    throw error;
  } finally {
    if (api) try { await api.close(); } catch (_) { /* noop */ }
  }
}

module.exports = {
  loadCoreCredentials, deriveWanInterface, summarizeInventory, inspectCore,
  previewProvision, provisionCore, readInventory, unexpectedManagementOverlaps,
  managementAddressListNetworks, vpsPeerAllowedAddresses, sameAddressSet,
};
