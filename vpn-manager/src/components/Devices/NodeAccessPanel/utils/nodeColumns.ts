// ============================================================
//  nodeColumns — definiciones declarativas de columnas de la tabla Nodos
//
//  Columnas FIJAS (siempre visibles, no entran en el picker):
//   • status   — semáforo de estado del túnel/PPP
//   • name     — nombre del nodo + tags + countdown si está activo
//   • actions  — Acceder/Revocar + kebab
//
//  Columnas OPCIONALES (configurables vía NodeColumnPicker, persisten en
//  useNodesPreferences):
//   • vrf, lan, ip_tunnel, ppp_user, tags, service, disabled, uptime
//
//  El render concreto vive en NodeCardStatusRow para no duplicar la lógica
//  de badges / data-cells / wrap. Acá solo van metadata.
// ============================================================

export interface NodeColumnDef {
  key: string;
  label: string;
  /** Por defecto visible al primer arranque (sin prefs guardadas). */
  defaultVisible: boolean;
  /** Etiqueta de sub-grupo opcional en el picker. */
  group?: string;
}

export const NODE_COLUMN_DEFS: NodeColumnDef[] = [
  { key: 'vrf',       label: 'Ruta asignada',         defaultVisible: false, group: 'Detalles técnicos' },
  { key: 'lan',       label: 'Red del sitio',         defaultVisible: false, group: 'Detalles técnicos' },
  { key: 'ip_tunnel', label: 'Dirección de conexión', defaultVisible: false, group: 'Detalles técnicos' },
  { key: 'ppp_user',  label: 'Identificador de acceso', defaultVisible: false, group: 'Detalles técnicos' },
  { key: 'tags',      label: 'Etiquetas',             defaultVisible: false, group: 'Información adicional' },
  { key: 'service',   label: 'Tipo de conexión',      defaultVisible: false, group: 'Detalles técnicos' },
  { key: 'disabled',  label: 'Disponibilidad',        defaultVisible: false, group: 'Información adicional' },
  { key: 'uptime',    label: 'Tiempo en línea',       defaultVisible: false, group: 'Información adicional' },
];
