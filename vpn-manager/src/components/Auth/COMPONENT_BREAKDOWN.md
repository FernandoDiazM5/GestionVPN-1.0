# RouterAccess Component Breakdown Plan

## Current State
- **File**: `RouterAccess.tsx` (196 líneas)
- **Status**: Funcional 100%, pero necesita mejor organización
- **Goal**: Dividir en componentes sin modificar código (solo reorganizar JSX)

## Identified Sections

### 1. **LoadingScreen** (líneas 73-79)
- Pantalla de carga inicial mientras se verifica el estado
- Complejidad: Baja
- Reutilizable: No
- **Archivo nuevo**: `components/LoadingScreen.tsx`

### 2. **BackgroundDecorations** (líneas 84-85)
- Elementos decorativos de fondo (gradient circles)
- Complejidad: Baja
- Reutilizable: Sí (podría usarse en otros formularios)
- **Archivo nuevo**: `components/BackgroundDecorations.tsx`

### 3. **RouterAccessHeader** (líneas 90-107)
- Encabezado con logo, título y descripción
- Complejidad: Baja
- Reutilizable: Sí
- **Props**: `needsSetup: boolean`
- **Archivo nuevo**: `components/RouterAccessHeader.tsx`

### 4. **SyncStatusMessage** (líneas 110-138)
- Muestra estados (loading, success, error)
- Complejidad: Media
- Reutilizable: Sí
- **Props**: 
  - `syncStatus: 'idle' | 'loading' | 'success' | 'error'`
  - `errorDetail: string`
- **Archivo nuevo**: `components/SyncStatusMessage.tsx`

### 5. **CredentialsForm** (líneas 140-186)
- Formulario completo (inputs + botón)
- Complejidad: Media
- Reutilizable: Sí (con props)
- **Props**:
  - `username: string`
  - `setUsername: (value: string) => void`
  - `password: string`
  - `setPassword: (value: string) => void`
  - `onSubmit: (e: React.FormEvent) => Promise<void>`
  - `isConnecting: boolean`
  - `needsSetup: boolean`
- **Archivo nuevo**: `components/CredentialsForm.tsx`

### 6. **Custom Hooks** (Lógica separada)
- `useAuthStatus.ts` - Verifica estado inicial del sistema
- `useAuthSubmit.ts` - Maneja submit del formulario
- **Directorio nuevo**: `hooks/`

## New Structure

```
src/components/Auth/
├── RouterAccess.tsx (orquestador principal)
├── components/
│   ├── LoadingScreen.tsx
│   ├── BackgroundDecorations.tsx
│   ├── RouterAccessHeader.tsx
│   ├── SyncStatusMessage.tsx
│   └── CredentialsForm.tsx
├── hooks/
│   ├── useAuthStatus.ts
│   └── useAuthSubmit.ts
├── README.md
└── COMPONENT_BREAKDOWN.md (este archivo)
```

## Benefits

✅ **Mantenibilidad**: Cada componente responsable de una sola cosa  
✅ **Reutilización**: Componentes como `BackgroundDecorations`, `SyncStatusMessage` pueden usarse en otros formularios  
✅ **Testing**: Componentes pequeños más fáciles de testear  
✅ **Legibilidad**: `RouterAccess.tsx` pasará de 196 a ~80 líneas  
✅ **Sin cambios de funcionalidad**: Todo el código existente se preserva

## Implementation Order

1. Crear directorio `components/` dentro de `Auth/`
2. Extraer `BackgroundDecorations.tsx` (sin lógica, solo JSX)
3. Extraer `LoadingScreen.tsx` (sin lógica, solo JSX)
4. Extraer `RouterAccessHeader.tsx` (sin lógica, solo JSX)
5. Extraer `SyncStatusMessage.tsx` (sin lógica, solo JSX)
6. Extraer `CredentialsForm.tsx` (sin lógica, solo JSX)
7. Crear `hooks/useAuthStatus.ts`
8. Crear `hooks/useAuthSubmit.ts`
9. Actualizar `RouterAccess.tsx` para usar todos los componentes
10. Crear `README.md` documentando la estructura

## Code Preservation Strategy

- **Copiar exactamente** los bloques JSX/HTML sin modificación
- **Mantener imports** de lucide-react igual en cada componente
- **Props nominales** para pasar estado (sin renombrar variables)
- **Interfaces TypeScript** para documentar props
- **Git commit** con mensaje claro sobre la división

**Actualizado**: 2026-05-30
