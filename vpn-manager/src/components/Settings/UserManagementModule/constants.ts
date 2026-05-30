export const ROLE_OPTIONS = [
  { id: 'admin', label: 'Admin', desc: 'Acceso Total' },
  { id: 'operator', label: 'Operator', desc: 'Gestiona Nodos' },
  { id: 'viewer', label: 'Viewer', desc: 'Solo Lectura' },
] as const;

export const MESSAGES = {
  LOAD_ERROR: 'Error fatal obteniendo usuarios',
  DELETE_SUCCESS: 'Usuario eliminado correctamente',
  DELETE_CONFIRM: '¿Estás seguro de que deseas revocar permanentemente a',
  DELETE_ADMIN_ONLY: 'No puedes borrar al único administrador.',
  DELETE_CURRENT_USER: 'No puedes borrar tu propia cuenta de sesión actual.',
  CREATE_SUCCESS: 'Usuario creado correctamente',
  EDIT_SUCCESS: 'Usuario actualizado correctamente',
  VALIDATION_ERROR: 'Error en validación',
  NETWORK_ERROR: 'Error de red',
};

export const LABELS = {
  USERNAME: 'Nombre de Usuario',
  PASSWORD: 'Contraseña',
  PASSWORD_OPTIONAL: '(Opcional — Déjalo en blanco para no cambiar)',
  ROLE: 'Nivel de Acceso (Rol)',
  CREATED_AT: 'Vigente Desde',
};

export const HEADERS = {
  LIST_TITLE: 'Gestión de Personal',
  LIST_SUBTITLE: 'Administra los accesos de tus colaboradores a la plataforma.',
  FORM_CREATE_TITLE: 'Nuevo Operador',
  FORM_EDIT_TITLE: 'Editar Operador',
  FORM_SUBTITLE: 'Asignación de rol y credenciales.',
};

export const BUTTON_LABELS = {
  CREATE: 'Crear Cuenta',
  UPDATE: 'Actualizar Cuenta',
  INVITE: 'Invitar Operador',
  EDIT: 'Editar',
  DELETE: 'Eliminar',
};

export const TABLE_HEADERS = {
  USERNAME: 'Nombre del Colaborador',
  ROLE: 'Nivel de Acceso',
  CREATED_AT: 'Vigente Desde',
  ACTIONS: 'Acciones',
};

export const EMPTY_STATES = {
  NO_USERS: 'No hay usuarios registrados',
  LOADING: 'Cargando directorio...',
};

export const ROLE_STYLES = {
  admin: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  operator: { bg: 'bg-sky-100', text: 'text-sky-800' },
  viewer: { bg: 'bg-slate-100', text: 'text-slate-600' },
} as const;
