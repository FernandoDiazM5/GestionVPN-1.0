import type { ProtectedNet } from './types';

export const VPS_IP = '192.168.21.60';

export const PROTECTED_NETS: ProtectedNet[] = [
  { cidr: '192.168.21.0/24', label: 'WireGuard gestión (192.168.21.0/24)' },
  { cidr: '10.10.250.0/24', label: 'Pool PPP túnel (10.10.250.0/24)' },
  { cidr: '10.10.251.0/24', label: 'Pool WG túnel core (10.10.251.0/24)' },
];

// NOTA: pink/orange/teal/cyan/blue/green/yellow/red/purple son paletas FUERA
// del sistema (CLAUDE.md). Quedan así como DS01 explícita para Fase 5 del
// refactor del sistema de diseño (migración a paletas válidas). NO agregar
// `dark:` a esas entries — duplica los hallazgos DS01. Solo paletas válidas
// (indigo/emerald/rose/amber/sky/violet/slate) llevan dark variant.
export const PEER_COLOR_PALETTE = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  'bg-pink-100 text-pink-700',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  'bg-orange-100 text-orange-700',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  'bg-teal-100 text-teal-700',
  'bg-cyan-100 text-cyan-700',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
];

export const TAG_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-yellow-100 text-yellow-700',
  'bg-red-100 text-red-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
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
