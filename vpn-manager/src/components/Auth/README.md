# Auth Components

Autenticación y acceso a la aplicación.

## Contenido

- **RouterAccess.tsx** (196 líneas) - Formulario de login inicial

## Flujo de Autenticación

1. Mostrar formulario de login con campos:
   - Host MikroTik
   - Usuario
   - Contraseña
   - Puerto (opcional)

2. Usuario ingresa credenciales

3. VpnContext.handleLoginSuccess()
   - Guarda token JWT
   - Cifra credenciales en IndexedDB

4. App renderiza módulos (en lugar de login)

## Responsabilidades

- Validar entrada de usuario
- Capturar credenciales MikroTik
- Disponer evento de login exitoso
- Mostrar errores de autenticación

**Última actualización:** 2026-05-29
