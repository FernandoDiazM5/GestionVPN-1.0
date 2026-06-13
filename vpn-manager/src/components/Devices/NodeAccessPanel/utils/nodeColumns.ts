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
  { key: 'vrf',       label: 'VRF',          defaultVisible: true,  group: 'Identificadores' },
  { key: 'lan',       label: 'Red LAN',      defaultVisible: true,  group: 'Identificadores' },
  { key: 'ip_tunnel', label: 'IP Túnel',     defaultVisible: true,  group: 'Identificadores' },
  { key: 'ppp_user',  label: 'Usuario PPP',  defaultVisible: true,  group: 'Identificadores' },
  { key: 'tags',      label: 'Etiquetas',    defaultVisible: false, group: 'Metadata' },
  { key: 'service',   label: 'Protocolo',    defaultVisible: false, group: 'Metadata' },
  { key: 'disabled',  label: 'Habilitado',   defaultVisible: false, group: 'Metadata' },
  { key: 'uptime',    label: 'Tiempo activo', defaultVisible: false, group: 'Metadata' },
];
