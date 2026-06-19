// audit:ignore-file DS01
//
// Excepción al sistema de diseño documentada en §54: las paletas
// PEER_COLOR_PALETTE y TAG_PALETTE requieren 10 y 7 colores únicos para
// distinguir visualmente N peers WireGuard / N etiquetas creadas por el
// moderador. El sistema canónico solo provee 7 paletas válidas + cyan
// (indigo/emerald/rose/amber/sky/violet/slate + cyan para CPEs), lo que
// alcanza para TAG_PALETTE pero no para PEER_COLOR_PALETTE. Documentamos
// la excepción aquí en lugar de violar el contrato semántico del sistema
// (cada paleta tiene un dueño semántico en CLAUDE.md).
//
// El comentario audit:ignore-file DS01 silencia la regla DS01 (paletas
// fuera del sistema) para todo este archivo. Las demás reglas (DS02-DS06)
// siguen activas.

// VPS_IP y PROTECTED_NETS viven en src/config.ts (fuente única, espejo de
// server/lib/mgmtNet.js). Se re-exportan aquí para no romper imports existentes.
export { VPS_IP, PROTECTED_NETS } from '../../../config';

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
