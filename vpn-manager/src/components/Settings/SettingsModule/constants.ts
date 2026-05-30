export const SETTINGS_MESSAGES = {
  LOAD_ERROR: 'Error al cargar la configuración.',
  NETWORK_ERROR: 'Error de red al cargar configuración.',
  SAVE_SUCCESS: 'Configuración guardada exitosamente. El Core ahora está provisionado en el servidor.',
  SAVE_ERROR: 'Error desconocido',
};

export const SETTINGS_PLACEHOLDERS = {
  MT_IP: '192.168.88.1',
  MT_USER: 'admin',
  MT_PASS: '••••••••',
};

export const SETTINGS_LABELS = {
  MT_IP: 'IP / Host del Router MikroTik',
  MT_USER: 'Usuario Full-Access RouterOS',
  MT_PASS: 'Contraseña del RouterOS',
};

export const SETTINGS_HINTS = {
  MT_IP: '',
  MT_USER: '',
  MT_PASS: 'Esta contraseña se cifrará con AES-256-GCM en la DB del servidor.',
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
  TITLE: 'Inyección de Core (RouterOS)',
  SUBTITLE: 'Configura de forma oculta los accesos supremos para que el Backend opere.',
};
