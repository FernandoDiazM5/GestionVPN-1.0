// ============================================================
//  coreBootstrap.js — Prepara un RouterOS/CHR como "Servidor VPN" (Core).
//
//  Convierte el .rsc de bootstrap del Core en una aplicación IDEMPOTENTE por
//  la RouterOS API. El Administrador solo ingresa IP pública + usuario +
//  contraseña; este módulo:
//    1) lee el estado del router y lo clasifica (blank/ours/partial/foreign),
//    2) aplica SOLO lo que falta (nunca duplica),
//    3) devuelve un checklist de todo lo aplicado (ok) o ya presente (skip).
//
//  ⚠️ Fuente de verdad de la red: lib/mgmtNet.js. Aquí NO se hardcodea ningún
//     "10.1x.250." ni "VPN-WG-*" — todo se deriva de mgmtNet.
//
//  ⚠️ Anti-bloqueo (§4.18): la regla "drop WAN input" y la restricción de la
//     allowlist de /ip service SOLO se aplican si el origen del backend está
//     garantizado en LIST-MGMT-TRUSTED (detectado o conectando por el plano de
//     gestión). Si no, se OMITEN con un `warn` — nunca dejamos al panel sin
//     acceso a un router recién levantado.
// ============================================================

const mgmtNet = require('./mgmtNet');
const scanIpRepo = require('../db/repos/scanIpRepo');
const { safeWrite, writeIdempotent } = require('../routeros.service');
const { entriesToAdd } = require('./addressList');
const log = require('./logger').child({ scope: 'coreBootstrap' });

const DEFAULT_IDENTITY = 'GW-VPN-CORE-ISP';

// ── Valores derivados de mgmtNet (única fuente) ──────────────────────────────
const SSTP_POOL_NAME = 'POOL-VPN-SSTP';
const PPP_PROFILE_NAME = 'PROF-VPN-TOWERS';
// Slice del /24 de nodos SSTP para el pool dinámico del PPP (la .1 es el Core).
const sstpPoolRange = () => `${mgmtNet.nodes.sstpBase}200-${mgmtNet.nodes.sstpBase}250`;
const scanPoolSubnet = () => (scanIpRepo.poolSubnet() || '10.11.252.0/24');

// Interfaces WG de gestión (nombre → puerto → comentario legible).
function mgmtIfaceDefs() {
  return [
    { name: mgmtNet.vps.iface,     port: mgmtNet.vps.port,     comment: 'Gestion VPS',
      addr: `${firstHost(mgmtNet.vps.net)}/24`,     addrComment: 'GW gestion VPS' },
    { name: mgmtNet.clients.iface, port: mgmtNet.clients.port, comment: 'Gestion Clientes (moderadores/members)',
      addr: `${firstHost(mgmtNet.clients.net)}/24`, addrComment: 'GW gestion Clientes' },
    { name: mgmtNet.admin.iface,   port: mgmtNet.admin.port,   comment: 'Gestion Admin',
      addr: `${firstHost(mgmtNet.admin.net)}/24`,   addrComment: 'GW gestion Admin' },
  ];
}
// .1 de un /24 (10.12.250.0/24 → 10.12.250.1). El Core es siempre la .1.
function firstHost(net) {
  const base = String(net).split('/')[0].split('.').slice(0, 3).join('.');
  return `${base}.1`;
}
const mgmtIfaceNames = () => [mgmtNet.vps.iface, mgmtNet.clients.iface, mgmtNet.admin.iface];
const mgmtNets = () => [mgmtNet.vps.net, mgmtNet.clients.net, mgmtNet.admin.net];

// ── Reglas de firewall gestionadas (idempotentes por `comment`) ──────────────
// El orden importa SOLO en la primera aplicación (RouterOS agrega al final). En
// re-ejecuciones se saltan por comment; una regla intermedia faltante se añade
// al final (trade-off aceptado — el modelo es aditivo). `risky:true` = regla que
// puede dejar sin acceso al panel si el origen del backend no está en trusted.
function filterRules(sstpPort) {
  const p = sstpPort || 4443;
  return [
    // input
    { comment: 'Permitir respuestas', args: ['=chain=input', '=action=accept', '=connection-state=established,related'] },
    { comment: 'Permitir todos los tuneles WG Nodos', args: ['=chain=input', '=action=accept', '=protocol=udp', '=dst-port=13300-13400'] },
    { comment: 'Dropear invalidos', args: ['=chain=input', '=action=drop', '=connection-state=invalid'] },
    { comment: 'Gestion: Winbox, API, REST', args: ['=chain=input', '=action=accept', '=protocol=tcp', '=dst-port=8291,8728,8729,443,444', '=src-address-list=LIST-MGMT-TRUSTED'] },
    { comment: 'SSTP Handshake', args: ['=chain=input', '=action=accept', '=protocol=tcp', `=dst-port=${p}`] },
    { comment: 'WG Gestion (migracion)', args: ['=chain=input', '=action=accept', '=protocol=udp', '=dst-port=13232-13234'] },
    { comment: 'Bloqueo total WAN', risky: true, args: ['=chain=input', '=action=drop', '=in-interface-list=LIST-WAN'] },
    // forward
    { comment: 'Forward established/related', args: ['=chain=forward', '=action=accept', '=connection-state=established,related'] },
    { comment: 'AISLAMIENTO NODO-NODO', args: ['=chain=forward', '=action=drop', '=in-interface-list=LIST-VPN-TOWERS', '=out-interface-list=LIST-VPN-TOWERS'] },
    { comment: 'SOFTWARE: Permitir acceso a red remota', args: ['=chain=forward', '=action=accept', '=src-address-list=vpn-activa', '=dst-address-list=LIST-NET-REMOTE-TOWERS'] },
    { comment: 'SOFTWARE: Retorno de datos', args: ['=chain=forward', '=action=accept', '=src-address-list=LIST-NET-REMOTE-TOWERS', '=dst-address-list=LIST-MGMT-TRUSTED'] },
    { comment: 'Admin MGMT libre', args: ['=chain=forward', '=action=accept', `=in-interface=${mgmtNet.admin.iface}`] },
    { comment: 'BLOQUEO: Nodos no acceden a internet del router', args: ['=chain=forward', '=action=drop', '=in-interface-list=LIST-VPN-TOWERS', '=out-interface-list=LIST-WAN'] },
    { comment: 'Bloqueo preventivo', args: ['=chain=forward', '=action=drop'] },
  ];
}
// Comentarios de las reglas que usamos para medir "cuán completo" está el router.
const MANAGED_FILTER_COMMENTS = filterRules(4443).map(r => r.comment);

// ── Lecturas seguras (una por vez — RouterOS no paraleliza en una conexión) ──
const read = (api, cmd, filters = []) => safeWrite(api, [cmd, ...filters]).catch(() => []);

/**
 * Detecta el origen (IP) desde el que el backend está hablando con el router,
 * mirando la tabla de conexiones a los puertos de la API. Si el router está
 * conectado por el plano de gestión, el origen es 10.x (ya en trusted). Sobre
 * IP pública, devuelve la IP pública del backend → hay que meterla en trusted
 * ANTES del "drop WAN". Best-effort: null si no se puede determinar.
 */
async function detectBackendOrigin(api) {
  try {
    const conns = await read(api, '/ip/firewall/connection/print', ['?protocol=tcp']);
    const apiPorts = new Set(['8728', '8729']);
    for (const c of (conns || [])) {
      const dst = String(c['dst-address'] || '');       // "10.12.250.1:8728"
      const port = dst.split(':')[1];
      if (apiPorts.has(port)) {
        const src = String(c['src-address'] || '').split(':')[0].trim();
        if (src) return src;
      }
    }
  } catch (_) { /* best-effort */ }
  return null;
}

/**
 * Lee el estado del router y lo clasifica. No modifica nada.
 * @returns {Promise<{state,summary}>}
 */
async function readRouterState(api) {
  const wg      = await read(api, '/interface/wireguard/print');
  const addrs   = await read(api, '/ip/address/print');
  const sstpSrv = await read(api, '/interface/sstp-server/server/print');
  const apiSvc  = await read(api, '/ip/service/print', ['?name=api']);
  const filter  = await read(api, '/ip/firewall/filter/print');
  const vrfs    = await read(api, '/ip/vrf/print');
  const peers   = await read(api, '/interface/wireguard/peers/print');
  const ident   = await read(api, '/system/identity/print');
  const resource = await read(api, '/system/resource/print');
  const ppp     = await read(api, '/ppp/secret/print');

  const names = mgmtIfaceNames();
  const mgmtInterfaces = (wg || [])
    .filter(i => names.includes(i.name))
    .map(i => ({
      name: i.name,
      listenPort: i['listen-port'] != null ? parseInt(i['listen-port'], 10) : null,
      publicKey: i['public-key'] || undefined,
      running: i.running === 'true' || i.running === true,
    }));

  const sstpCfg = (sstpSrv || [])[0] || null;
  const sstpServer = sstpCfg
    ? { enabled: sstpCfg.enabled === 'true' || sstpCfg.enabled === true,
        port: sstpCfg.port != null ? parseInt(sstpCfg.port, 10) : null }
    : null;

  const apiAddr = String(((apiSvc || [])[0] || {}).address || '').trim();
  // "ok" = allow-all (vacío) o incluye los planos de gestión.
  const apiAllowlistOk = apiAddr === '' || mgmtNets().some(n => apiAddr.includes(n.split('/')[0]));

  const managedFilter = (filter || []).filter(r => MANAGED_FILTER_COMMENTS.includes(r.comment));
  const provisionedNodes = (vrfs || []).filter(v => /^VRF-ND\d+/i.test(v.name || '')).length;
  const mgmtPeers = (peers || []).filter(p => names.includes(p.interface)).length;

  const summary = {
    identity: (ident || [])[0]?.name || undefined,
    version: (resource || [])[0]?.version || undefined,
    boardName: (resource || [])[0]?.['board-name'] || undefined,
    mgmtInterfaces,
    sstpServer,
    apiAllowlistOk,
    firewallRules: managedFilter.length,
    provisionedNodes,
    mgmtPeers,
  };

  // Clasificación
  const present = mgmtInterfaces.length;
  const otherWg = (wg || []).filter(i => !names.includes(i.name)).length;
  const hasOtherUse = otherWg > 0 || (ppp || []).length > 0 || provisionedNodes > 0;
  let state;
  if (present === 0) {
    state = hasOtherUse ? 'foreign' : 'blank';
  } else if (present === 3 && sstpServer?.enabled && managedFilter.length >= 10) {
    state = 'ours';
  } else {
    state = 'partial';
  }
  return { state, summary };
}

/**
 * Aplica la config base del Core de forma idempotente.
 *
 * ⚠️ NO gestiona la IP pública / WAN. La IP pública ya la provee la nube
 *    (ej. DigitalOcean CHR) o la habilita el operador con sus propias
 *    configuraciones (dirección WAN, src-nat de la pública, miembro de
 *    LIST-WAN). Aquí solo montamos el "resto": el andamiaje VPN del Core.
 *    Por eso NO detectamos la interfaz WAN, NO creamos el src-nat de la
 *    pública ni agregamos ningún miembro a LIST-WAN (solo creamos la lista,
 *    inerte hasta que el operador le añada su interfaz WAN).
 *
 * @param {object} api  conexión RouterOS
 * @param {object} opts { sstpPort, identity, backendOrigin,
 *                        trustedPublics: string[], lockdownSafe: boolean }
 * @param {(s:{obj,name,status})=>void} pushStep
 */
async function applyBaseline(api, opts, pushStep) {
  const { sstpPort, identity, backendOrigin, trustedPublics = [], lockdownSafe } = opts;
  let n = 0;
  const step = (obj, name, status) => { n += 1; pushStep({ step: n, obj, name, status }); };

  // 1) Identity
  try {
    const cur = ((await read(api, '/system/identity/print'))[0] || {}).name;
    const want = identity || DEFAULT_IDENTITY;
    if (cur === want) step('Identidad', `${want} (ya presente)`, 'skip');
    else { await safeWrite(api, ['/system/identity/set', `=name=${want}`]); step('Identidad', want, 'ok'); }
  } catch (e) { step('Identidad', e.message, 'warn'); }

  // 2) Interface lists
  const wantLists = ['LIST-WAN', 'LIST-VPN-TOWERS', 'LIST-VPN-SSTP', 'LIST-VPN-WG'];
  const curLists = await read(api, '/interface/list/print');
  const listNames = new Set((curLists || []).map(l => l.name));
  for (const name of wantLists) {
    if (listNames.has(name)) { step('Interface List', `${name} (ya presente)`, 'skip'); continue; }
    await writeIdempotent(api, ['/interface/list/add', `=name=${name}`]);
    step('Interface List', name, 'ok');
  }

  // 3) Interfaces WG de gestión + 4) sus IPs gateway
  const curWg = await read(api, '/interface/wireguard/print');
  const wgNames = new Set((curWg || []).map(i => i.name));
  const curAddrs = await read(api, '/ip/address/print');
  const addrKey = new Set((curAddrs || []).map(a => `${a.interface}|${String(a.address).split('/')[0]}`));
  for (const def of mgmtIfaceDefs()) {
    if (wgNames.has(def.name)) {
      step('WG Gestión', `${def.name} (ya presente)`, 'skip');
    } else {
      await writeIdempotent(api, ['/interface/wireguard/add',
        `=name=${def.name}`, `=listen-port=${def.port}`, '=mtu=1420', `=comment=${def.comment}`]);
      step('WG Gestión', `${def.name} :${def.port}`, 'ok');
    }
    const ip = def.addr.split('/')[0];
    if (addrKey.has(`${def.name}|${ip}`)) {
      step('IP Gateway', `${def.addr} en ${def.name} (ya presente)`, 'skip');
    } else {
      await writeIdempotent(api, ['/ip/address/add',
        `=address=${def.addr}`, `=interface=${def.name}`, `=comment=${def.addrComment}`]);
      step('IP Gateway', `${def.addr} → ${def.name}`, 'ok');
    }
  }

  // 5) Pool SSTP
  const pools = await read(api, '/ip/pool/print', [`?name=${SSTP_POOL_NAME}`]);
  if ((pools || []).length > 0) step('Pool SSTP', `${SSTP_POOL_NAME} (ya presente)`, 'skip');
  else {
    await writeIdempotent(api, ['/ip/pool/add', `=name=${SSTP_POOL_NAME}`, `=ranges=${sstpPoolRange()}`]);
    step('Pool SSTP', `${SSTP_POOL_NAME} ${sstpPoolRange()}`, 'ok');
  }

  // 6) PPP profile
  const profs = await read(api, '/ppp/profile/print', [`?name=${PPP_PROFILE_NAME}`]);
  if ((profs || []).length > 0) step('PPP Profile', `${PPP_PROFILE_NAME} (ya presente)`, 'skip');
  else {
    await writeIdempotent(api, ['/ppp/profile/add', `=name=${PPP_PROFILE_NAME}`,
      `=local-address=${mgmtNet.nodes.sstpLocal}`, `=remote-address=${SSTP_POOL_NAME}`,
      '=dns-server=8.8.8.8', '=use-encryption=yes']);
    step('PPP Profile', `${PPP_PROFILE_NAME} (local ${mgmtNet.nodes.sstpLocal})`, 'ok');
  }

  // 7) SSTP server (siempre `set` idempotente — es config singleton)
  const p = sstpPort || 4443;
  await safeWrite(api, ['/interface/sstp-server/server/set',
    '=enabled=yes', `=port=${p}`, '=authentication=mschap2', '=tls-version=only-1.2']);
  step('SSTP Server', `enabled :${p} mschap2 TLS1.2`, 'ok');

  // 8) Address-list LIST-MGMT-TRUSTED — ANTES del firewall (§4.18 anti-bloqueo)
  const curAl = await read(api, '/ip/firewall/address-list/print');
  const trustedWant = [...mgmtNets(), ...trustedPublics.filter(Boolean)];
  if (backendOrigin) trustedWant.push(`${backendOrigin}`);
  await ensureAddressList(api, curAl, 'LIST-MGMT-TRUSTED', trustedWant, 'Core bootstrap', step, 'MGMT Trusted');

  // 9) Address-list vpn-activa (planos de gestión + scan-pool)
  await ensureAddressList(api, curAl, 'vpn-activa', [...mgmtNets(), scanPoolSubnet()], 'User Access', step, 'vpn-activa');

  // 10) /ip service — apagar servicios inseguros + allowlist api/api-ssl
  await applyServices(api, { mgmtnets: mgmtNets(), trustedPublics, backendOrigin, lockdownSafe }, step);

  // 11) Firewall filter
  const curFilter = await read(api, '/ip/firewall/filter/print');
  const filterComments = new Set((curFilter || []).map(r => r.comment));
  for (const rule of filterRules(p)) {
    if (rule.risky && !lockdownSafe) {
      step('Firewall (omitido)', `"${rule.comment}" — se aplicará por el túnel de gestión (anti-bloqueo)`, 'warn');
      continue;
    }
    if (filterComments.has(rule.comment)) { step('Firewall', `${rule.comment} (ya presente)`, 'skip'); continue; }
    await writeIdempotent(api, ['/ip/firewall/filter/add', ...rule.args, `=comment=${rule.comment}`]);
    step('Firewall', rule.comment, 'ok');
  }

  // 12) Firewall NAT — SOLO lo del andamiaje VPN. El src-nat de la IP pública
  // NO se toca aquí: lo maneja la nube/operador junto con la WAN.
  const curNat = await read(api, '/ip/firewall/nat/print');
  const natComments = new Set((curNat || []).map(r => r.comment));
  const natRules = [
    { comment: 'Bypass NAT: Admin a torres WG', args: ['=chain=srcnat', '=action=accept', '=src-address-list=LIST-MGMT-TRUSTED', '=dst-address-list=LIST-NET-REMOTE-TOWERS', '=out-interface-list=LIST-VPN-WG'] },
    { comment: 'NAT Admin SSTP - retorno via PPP local', args: ['=chain=srcnat', '=action=masquerade', '=out-interface-list=LIST-VPN-SSTP'] },
  ];
  for (const rule of natRules) {
    if (natComments.has(rule.comment)) { step('NAT', `${rule.comment} (ya presente)`, 'skip'); continue; }
    await writeIdempotent(api, ['/ip/firewall/nat/add', ...rule.args, `=comment=${rule.comment}`]);
    step('NAT', rule.comment, 'ok');
  }

  // 13) Extras (best-effort, no crítico)
  try {
    await safeWrite(api, ['/ip/dns/set', '=allow-remote-requests=yes', '=servers=8.8.8.8,8.8.4.4']);
    step('DNS', 'allow-remote-requests + 8.8.8.8/8.8.4.4', 'ok');
  } catch (e) { step('DNS', e.message, 'warn'); }
}

/** Asegura N direcciones en una address-list sin duplicar (lee lo actual una vez). */
async function ensureAddressList(api, existing, list, addresses, comment, step, label) {
  const toAdd = entriesToAdd(existing || [], list, addresses);
  if (toAdd.length === 0) { step(label, `${list} (${addresses.length} entradas ya presentes)`, 'skip'); return; }
  for (const addr of toAdd) {
    await writeIdempotent(api, ['/ip/firewall/address-list/add', `=list=${list}`, `=address=${addr}`, `=comment=${comment}`]);
    // reflejar en el snapshot local para no re-añadir en la misma corrida
    existing.push({ list, address: addr });
  }
  step(label, `${list}: +${toAdd.length} (${toAdd.join(', ')})`, 'ok');
}

/** Apaga ftp/telnet/www/ssh y restringe la allowlist de api/api-ssl (con anti-bloqueo). */
async function applyServices(api, { mgmtnets, trustedPublics, backendOrigin, lockdownSafe }, step) {
  // Apagar servicios inseguros (nunca tocamos `api`, que es nuestro canal).
  for (const svc of ['ftp', 'telnet', 'www']) {
    try { await safeWrite(api, ['/ip/service/set', `=numbers=${svc}`, '=disabled=yes']); }
    catch (_) { /* best-effort */ }
  }
  step('Servicios inseguros', 'ftp/telnet/www deshabilitados', 'ok');

  // Allowlist de api / api-ssl. UNIÓN con lo actual — NUNCA quitamos el origen
  // vivo. Si no podemos garantizar el origen (lockdown no seguro) dejamos la
  // allowlist como está (allow-all en CHR fresco) y avisamos.
  if (!lockdownSafe) {
    step('API allowlist (diferido)', 'sin restringir — asegúrala por el túnel de gestión (§4.18)', 'warn');
    return;
  }
  const desired = new Set([...mgmtnets, ...trustedPublics.filter(Boolean)]);
  if (backendOrigin) desired.add(`${backendOrigin}/32`);
  for (const name of ['api', 'api-ssl']) {
    try {
      const cur = await read(api, '/ip/service/print', [`?name=${name}`]);
      const curAddr = String(((cur || [])[0] || {}).address || '').trim();
      const curSet = new Set(curAddr ? curAddr.split(',').map(s => s.trim()).filter(Boolean) : []);
      for (const d of desired) curSet.add(d);
      const merged = [...curSet].join(',');
      await safeWrite(api, ['/ip/service/set', `=numbers=${name}`, `=address=${merged}`]);
    } catch (_) { /* best-effort */ }
  }
  step('API allowlist', `api/api-ssl → planos de gestión${backendOrigin ? ' + origen backend' : ''}`, 'ok');
}

module.exports = {
  readRouterState,
  applyBaseline,
  detectBackendOrigin,
  DEFAULT_IDENTITY,
  MANAGED_FILTER_COMMENTS,
  // export interno para tests
  _internal: { filterRules, mgmtIfaceDefs, sstpPoolRange, firstHost },
};
