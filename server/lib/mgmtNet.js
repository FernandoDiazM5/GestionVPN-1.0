// ============================================================
//  mgmtNet.js — Fuente de verdad del PLANO DE GESTIÓN (WireGuard)
//
//  Antes existía UNA sola red de gestión plana (VPN-WG-MGMT,
//  192.168.21.0/24) que mezclaba todos los roles. Chocaba con LANs
//  reales de torre (192.168.x). Se migró a segmentos dedicados en
//  espacio 10.x, parametrizados por env (mismo patrón que el
//  scan-pool de scanIpRepo):
//
//    ── Interfaces de gestión (terminan peers humanos / servidor) ──
//    • VPS      (VPN-WG-VPS,      10.12.250.0/24, :13232) → peer del VPS (.60)
//    • CLIENTES (VPN-WG-CLIENTES, 10.13.250.0/24, :13233) → moderadores / members
//    • ADMIN    (VPN-WG-ADMIN,    10.14.250.0/24, :13234) → dispositivos del admin
//
//    ── IP de gestión POR NODO (no son peers de gestión; viven en el CPE) ──
//    • Nodo WireGuard → 10.11.250.<ndNum>   (ej. ND7 → 10.11.250.7)
//    • Nodo SSTP      → 10.11.251.<ndNum>
//
//    ── Scan-pool del VPS (Opción C) → 10.11.252.0/24 (ver scanIpRepo) ──
//
//  El transporte de los túneles (10.10.250/251) NO pertenece a este
//  módulo y NO se migra.
//
//  El mangle de acceso sigue siendo POR-IP de usuario (src=<mgmt_ip>),
//  así que cambiar de segmento solo cambia la IP, no el modelo.
//
//  ⚠️ Cualquier valor de red de gestión NUEVO debe leerse de aquí,
//     nunca hardcodear "10.1x.250." ni "VPN-WG-*" en otros módulos.
// ============================================================

const env = (k, d) => {
  const v = process.env[k];
  return v === undefined || v === null || String(v).trim() === '' ? d : String(v).trim();
};
const envNum = (k, d) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n > 0 ? n : d;
};

// ── VPS — peer único del servidor (escaneo/Monitor AP/hooks) ──
const vps = {
  iface: env('MGMT_VPS_IFACE', 'VPN-WG-VPS'),
  net:   env('MGMT_VPS_NET',   '10.12.250.0/24'),
  base:  env('MGMT_VPS_BASE',  '10.12.250.'),
  ip:    env('MGMT_VPS_IP',    '10.12.250.60'),
  port:  envNum('MGMT_VPS_PORT', 13232),
};

// ── CLIENTES — moderadores / members (el grueso de peers humanos) ──
const clients = {
  iface: env('MGMT_CLIENTS_IFACE', 'VPN-WG-CLIENTES'),
  net:   env('MGMT_CLIENTS_NET',   '10.13.250.0/24'),
  base:  env('MGMT_CLIENTS_BASE',  '10.13.250.'),   // prefijo de IP (con punto final)
  port:  envNum('MGMT_CLIENTS_PORT', 13233),
  start: envNum('MGMT_CLIENTS_START', 20),          // 1er octeto del pool dinámico
};

// ── ADMIN — dispositivos personales del administrador de plataforma ──
const admin = {
  iface: env('MGMT_ADMIN_IFACE', 'VPN-WG-ADMIN'),
  net:   env('MGMT_ADMIN_NET',   '10.14.250.0/24'),
  base:  env('MGMT_ADMIN_BASE',  '10.14.250.'),
  port:  envNum('MGMT_ADMIN_PORT', 13234),
  start: envNum('MGMT_ADMIN_START', 20),
};

// ── IP de gestión POR NODO (se materializa en cada CPE, no aquí) ──
const nodes = {
  wgBase:   env('MGMT_NODE_WG_BASE',   '10.11.250.'),
  wgNet:    env('MGMT_NODE_WG_NET',    '10.11.250.0/24'),
  sstpBase: env('MGMT_NODE_SSTP_BASE', '10.11.251.'),
  sstpNet:  env('MGMT_NODE_SSTP_NET',  '10.11.251.0/24'),
};

/** IP de gestión de un nodo a partir de su número (ND-N) y protocolo. */
function nodeMgmtIp(ndNum, isWG) {
  const n = parseInt(ndNum, 10);
  if (!Number.isInteger(n) || n < 1 || n > 254) return null;
  return `${isWG ? nodes.wgBase : nodes.sstpBase}${n}`;
}

// Interfaces WG de gestión (todas — para búsquedas/lookup de peers).
const ifaces = [vps.iface, clients.iface, admin.iface];

// Interfaces que alojan peers de USUARIO mostrados en "Usuarios VPN"
// (moderadores/members + admin; el VPS no es un usuario).
const userIfaces = [clients.iface, admin.iface];

// Prefijos de IP válidos para una IP de gestión reclamable desde la UI
// (CLIENTES o ADMIN; el VPS no se "reclama"). Usado por register-my-ip.
const mgmtIpBases = [clients.base, admin.base];

/** ¿`ip` (sin máscara) pertenece a algún segmento de gestión reclamable? */
function isMgmtIp(ip) {
  const clean = String(ip || '').split('/')[0].trim();
  return mgmtIpBases.some((b) => clean.startsWith(b));
}

/**
 * Rutas de retorno que cada VRF necesita para que el tráfico de respuesta de
 * las LAN de nodo encuentre el camino de vuelta a cada plano de gestión.
 * Reemplaza la antigua ruta única `dst=192.168.21.0/24 → VPN-WG-MGMT`.
 * Devuelve [{ subnet, gateway, tag }].
 */
function returnRoutes() {
  return [
    { subnet: clients.net, gateway: clients.iface, tag: 'MGMT-CLIENTES' },
    { subnet: admin.net,   gateway: admin.iface,   tag: 'MGMT-ADMIN' },
    { subnet: vps.net,     gateway: vps.iface,     tag: 'MGMT-VPS' },
  ];
}

// Todos los /24 del espacio de gestión (para excluirlos del listado de
// "LANs de nodo" y de la validación de subred del alta de nodo).
const allNets = [nodes.wgNet, nodes.sstpNet, vps.net, clients.net, admin.net];

module.exports = {
  vps, clients, admin, nodes,
  ifaces, userIfaces, mgmtIpBases, allNets,
  isMgmtIp, nodeMgmtIp, returnRoutes,
};
