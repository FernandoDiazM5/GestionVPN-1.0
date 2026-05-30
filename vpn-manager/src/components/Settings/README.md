# Settings Components

Configuración del sistema y gestión de usuarios.

## Contenido

- **SettingsModule.tsx** (153 líneas) - Configuración de credenciales MikroTik
- **UserManagementModule.tsx** (244 líneas) - CRUD de usuarios del sistema

## SettingsModule

Responsabilidades:
- Permitir cambiar credenciales MikroTik
- Validar nueva conexión antes de guardar
- Mostrar estado de conexión actual
- Permitir logout y re-login

## UserManagementModule

Responsabilidades:
- Listar usuarios del sistema
- Crear nuevos usuarios
- Editar usuarios existentes
- Eliminar usuarios
- Asignar roles (admin/user)
- Validar permisos

## APIs Utilizadas

- `GET /api/settings/current` - Obtener configuración actual
- `PUT /api/settings/update` - Actualizar configuración
- `GET /api/users/list` - Listar usuarios
- `POST /api/users/create` - Crear usuario
- `PUT /api/users/{id}` - Editar usuario
- `DELETE /api/users/{id}` - Eliminar usuario

**Última actualización:** 2026-05-29
