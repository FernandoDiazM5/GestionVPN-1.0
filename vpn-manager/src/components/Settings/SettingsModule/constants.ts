export const SETTINGS_MESSAGES = {
  LOAD_ERROR: 'Error al cargar la configuración.',
  NETWORK_ERROR: 'Error de red al cargar configuración.',
  SAVE_SUCCESS: 'Configuración guardada exitosamente.',
  SAVE_ERROR: 'Error desconocido',
};

export const SETTINGS_PLACEHOLDERS = {
  MT_IP: '192.168.88.1',
  MT_USER: 'admin',
  MT_PASS: '••••••••',
  server_public_ip: '213.173.36.232',
  sstp_port: '443',
};

export const SETTINGS_LABELS = {
  MT_IP: 'IP / Host del Router MikroTik',
  MT_USER: 'Usuario Full-Access RouterOS',
  MT_PASS: 'Contraseña del RouterOS',
  server_public_ip: 'IP pública o dominio del Router Core',
  sstp_port: 'Puerto SSTP del Router Core',
};

export const SETTINGS_HINTS = {
  MT_IP: '',
  MT_USER: '',
  MT_PASS: 'Esta contraseña se cifrará con AES-256-GCM en la DB del servidor.',
  server_public_ip: 'Endpoint público del MikroTik/Core. Se reutiliza al generar los accesos de los nodos; no corresponde a la IP pública del VPS.',
  sstp_port: 'Puerto donde escucha el listener SSTP del Core (RouterOS usa 443 por defecto). Si tu Core escucha en otro puerto (ej. 4443), se embebe en el script del CPE como connect-to=<ip>:<puerto>.',
};

export const TAB_VALUES = {
  CORE: 'core',
  USERS: 'users',
} as const;

export const TAB_LABELS = {
  core: 'Configuración Global Core',
  users: 'Personal y Roles',
} as const;

export const CARD_HEADER = {
  TITLE: 'Conexión con el Router Core',
  SUBTITLE: 'Configura las credenciales administrativas y los endpoints que utiliza el servidor.',
};
