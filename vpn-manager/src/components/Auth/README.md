# Auth Module

Módulo de autenticación con RouterAccess como componente principal.

## Estructura

```
Auth/
├── RouterAccess.tsx          (componente orquestador principal)
├── components/               (componentes presentacionales)
│   ├── BackgroundDecorations.tsx   (elementos decorativos)
│   ├── LoadingScreen.tsx           (pantalla de carga inicial)
│   ├── RouterAccessHeader.tsx      (encabezado del formulario)
│   ├── SyncStatusMessage.tsx       (mensajes de estado)
│   └── CredentialsForm.tsx         (formulario de credenciales)
├── hooks/                    (lógica reutilizable)
│   ├── useAuthStatus.ts      (verifica estado del sistema)
│   └── useAuthSubmit.ts      (maneja envío de formulario)
└── README.md                 (este archivo)
```

## Componentes

### RouterAccess (Principal)
- **Responsabilidad**: Orquestador principal que coordina estado y flujo
- **Estado**: username, password
- **Props**: ninguno
- **Dependencias**: VpnContext, hooks (useAuthStatus, useAuthSubmit)

### BackgroundDecorations
- **Responsabilidad**: Renderiza elementos decorativos de fondo
- **Props**: ninguno
- **Reutilizable**: Sí

### LoadingScreen
- **Responsabilidad**: Muestra spinner mientras se verifica el estado
- **Props**: ninguno
- **Reutilizable**: Sí

### RouterAccessHeader
- **Responsabilidad**: Encabezado del formulario con logo y título
- **Props**: `needsSetup: boolean`
- **Reutilizable**: Sí

### SyncStatusMessage
- **Responsabilidad**: Muestra mensajes de estado (loading, success, error)
- **Props**: 
  - `syncStatus: 'idle' | 'loading' | 'success' | 'error'`
  - `errorDetail: string`
- **Reutilizable**: Sí

### CredentialsForm
- **Responsabilidad**: Formulario completo con inputs y botón
- **Props**:
  - `username: string`
  - `setUsername: (value: string) => void`
  - `password: string`
  - `setPassword: (value: string) => void`
  - `onSubmit: (e: React.FormEvent) => Promise<void>`
  - `isConnecting: boolean`
  - `needsSetup: boolean`
- **Reutilizable**: Sí

## Hooks

### useAuthStatus
```typescript
const needsSetup = useAuthStatus();
// Retorna: boolean | null
```
- Verifica el estado del sistema en el backend
- Se ejecuta una sola vez al montar el componente
- Devuelve `null` mientras carga, luego `true` o `false`

### useAuthSubmit
```typescript
const { isConnecting, syncStatus, errorDetail, handleSubmit } = useAuthSubmit(needsSetup);
// handleSubmit(e, username, password)
```
- Maneja el envío del formulario
- Comunica con `/api/auth/login` o `/api/auth/setup`
- Gestiona estados de loading/success/error

## Ventajas de esta Reorganización

✅ **Separación de responsabilidades**: Cada componente hace una cosa  
✅ **Reutilizable**: Componentes como `SyncStatusMessage` se pueden usar en otros formularios  
✅ **Mantenible**: RouterAccess ahora tiene solo ~50 líneas  
✅ **Testeable**: Componentes pequeños más fáciles de testear  
✅ **Sin cambios de funcionalidad**: Todo funciona igual que antes

**Última actualización**: 2026-05-30
