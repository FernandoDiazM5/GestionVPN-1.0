// En desarrollo: vacío → http://localhost:3001
// En Docker con nginx proxy: VITE_API_URL="" → URLs relativas, nginx redirige /api → backend
// En Docker acceso externo: VITE_API_URL="http://IP_SERVIDOR:3001"
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '') !== ''
  ? import.meta.env.VITE_API_URL
  : (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    ? ''              // En producción (Docker nginx proxy): URLs relativas
    : 'http://localhost:3001';  // En desarrollo local

// ── Plano de gestión (espejo de server/lib/mgmtNet.js) ──────────────────────
//  Solo para validación de subred y visualización en la UI. El backend es la
//  fuente autoritativa; estos valores deben coincidir con mgmtNet.js.
export const MGMT_NET = {
  vps:      { net: '10.12.250.0/24', ip: '10.12.250.60', iface: 'VPN-WG-VPS' },
  clients:  { net: '10.13.250.0/24', iface: 'VPN-WG-CLIENTES' },
  admin:    { net: '10.14.250.0/24', base: '10.14.250.', start: 20, iface: 'VPN-WG-ADMIN' },
  nodeWg:   { net: '10.11.250.0/24', base: '10.11.250.' },
  nodeSstp: { net: '10.11.251.0/24', base: '10.11.251.' },
  scan:     { net: '10.11.252.0/24' },
} as const;

// IP de gestión de un nodo (ND-N → 10.11.250.N WG / 10.11.251.N SSTP).
export function nodeMgmtIp(ndNum: number, isWg: boolean): string {
  return `${isWg ? MGMT_NET.nodeWg.base : MGMT_NET.nodeSstp.base}${ndNum}`;
}

// Redes de gestión que un CPE debe rutear de retorno hacia el Core
// (CLIENTES/ADMIN/VPS + scan-pool del VPS).
export const MGMT_RETURN_NETS: string[] = [
  MGMT_NET.clients.net, MGMT_NET.admin.net, MGMT_NET.vps.net, MGMT_NET.scan.net,
];

// IP del peer del VPS (se usa para identificarlo/excluirlo en las tablas de peers).
export const VPS_IP = MGMT_NET.vps.ip;
// /24 de gestión de clientes (default para AllowedIPs de un .conf de usuario).
export const ADMIN_WG_NET = MGMT_NET.clients.net;

// AllowedIPs split-tunnel para el .conf de gestión (admin/usuarios). ⚠️ NUNCA
// 0.0.0.0/0: el router no da salida a internet a los clientes de gestión, así
// que 0.0.0.0/0 dejaría al equipo SIN INTERNET. Cubre todo RFC1918 (planos de
// gestión 10.x + nodos + scan + LAN de torre privadas). Si una torre usa rango
// público como LAN (ej. 142.152.7.0/24), añádelo a mano.
export const MGMT_ALLOWED_IPS = '10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16';

// Redes reservadas que NO pueden usarse como LAN remota de un nodo.
export const PROTECTED_NETS: { cidr: string; label: string }[] = [
  { cidr: MGMT_NET.nodeWg.net,   label: 'Gestión nodos WG (10.11.250.0/24)' },
  { cidr: MGMT_NET.nodeSstp.net, label: 'Gestión nodos SSTP (10.11.251.0/24)' },
  { cidr: MGMT_NET.scan.net,     label: 'Scan-pool VPS (10.11.252.0/24)' },
  { cidr: MGMT_NET.vps.net,      label: 'Gestión VPS (10.12.250.0/24)' },
  { cidr: MGMT_NET.clients.net,  label: 'Gestión clientes (10.13.250.0/24)' },
  { cidr: MGMT_NET.admin.net,    label: 'Gestión admin (10.14.250.0/24)' },
  { cidr: '10.10.250.0/24',      label: 'Pool PPP túnel (10.10.250.0/24)' },
  { cidr: '10.10.251.0/24',      label: 'Pool WG túnel core (10.10.251.0/24)' },
];