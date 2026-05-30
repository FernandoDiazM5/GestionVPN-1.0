import type { ProtectedNet } from './types';

export const VPS_IP = '192.168.21.60';

export const PROTECTED_NETS: ProtectedNet[] = [
  { cidr: '192.168.21.0/24', label: 'WireGuard gestión (192.168.21.0/24)' },
  { cidr: '10.10.250.0/24', label: 'Pool PPP túnel (10.10.250.0/24)' },
  { cidr: '10.10.251.0/24', label: 'Pool WG túnel core (10.10.251.0/24)' },
];

export const PEER_COLOR_PALETTE = [
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-rose-100 text-rose-700',
  'bg-orange-100 text-orange-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-teal-100 text-teal-700',
  'bg-cyan-100 text-cyan-700',
  'bg-sky-100 text-sky-700',
];

export const TAG_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-yellow-100 text-yellow-700',
  'bg-red-100 text-red-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
];

export const DEL_STEPS = [
  { name: 'Remover interfaz VRF', obj: 'RouterOS' },
  { name: 'Eliminar usuario PPP', obj: 'RouterOS' },
  { name: 'Remover peer WireGuard', obj: 'WireGuard' },
  { name: 'Borrar de base de datos', obj: 'DB local' },
];

export const PASOS_LABELS: Record<string, string[]> = {
  sstp: [
    'Crear interfaz SSTP', 'Crear usuario PPP', 'Crear rutas de retorno',
    'Guardar en DB local', 'Revisar mangle activo',
  ],
  wireguard: [
    'Crear interfaz WG', 'Agregar peer WG', 'Crear rutas de retorno',
    'Guardar en DB local', 'Revisar mangle activo',
  ],
};
