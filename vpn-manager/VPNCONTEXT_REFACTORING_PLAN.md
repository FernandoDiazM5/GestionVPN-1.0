# 🏗️ Plan de Refactorización VpnContext.tsx

**Fecha**: 2026-05-30  
**Objetivo**: Dividir VpnContext.tsx en componentes modulares sin cambiar el código  
**Alcance**: Reorganización estructural pura (zero breaking changes)

---

## 📊 Análisis Actual

### VpnContext.tsx - Estado Monolítico (413 líneas)

**Responsabilidades Identificadas**:

1. **Autenticación** (8 líneas de lógica)
   - `isAuthenticated`, `credentials`
   - `handleLoginSuccess()`, `handleLogout()`

2. **VPNs Administrados** (4 líneas)
   - `managedVpns`, `setManagedVpns`

3. **Estado del Escáner** (6 líneas)
   - `scannedSecrets`, `hasScanned`
   - Estado lifting entre tabs

4. **Nodos VRF** (12 líneas)
   - `nodes`, `activeNodeVrf`, `tunnelExpiry`, `adminIP`
   - `deactivateAllNodes()`, `removeNodeFromState()`

5. **Navegación** (4 líneas)
   - `activeModule`, `setActiveModule`

6. **Tema** (4 líneas)
   - `darkMode`, `toggleDarkMode`

7. **Sincronización Avanzada** (80 líneas)
   - BroadcastChannel (líneas 82-104)
   - SSE EventSource (líneas 287-314)
   - Persistencia en BD (líneas 328-341)

8. **Auto-timeout Resiliente** (25 líneas)
   - Timeout inteligente que sobrevive a suspensión (líneas 169-190)
   - Polling cada 5s

9. **Heartbeat/Keepalive** (35 líneas)
   - Restauración automática de reglas (líneas 192-233)

10. **Detector Global de Sesión Expirada** (10 líneas)
    - Listener de eventos auth_expired (líneas 316-325)

11. **Inicialización y Persistencia** (65 líneas)
    - Carga desde DB (líneas 235-276)
    - Desactivación post-sleep (líneas 278-284)
    - Persistencia con debounce (líneas 328-341)

---

## 🎯 Estructura Propuesta

```
src/context/
├── VpnContext.tsx                    ← Archivo PRINCIPAL (orquestador)
├── VpnProvider.tsx                   ← Provider (wrapper del componente)
├── types.ts                          ← Tipos e interfaces compartidos
├── constants.ts                      ← Constantes (timeouts, keys)
├── index.ts                          ← Barrel export público
│
├── hooks/                            ← Custom hooks por responsabilidad
│   ├── useAuth.ts                    (Autenticación: login/logout)
│   ├── useTunnelSync.ts              (BroadcastChannel + SSE + persistencia)
│   ├── useTunnelTimeout.ts           (Auto-timeout resiliente)
│   ├── useTunnelKeepalive.ts         (Heartbeat y restauración)
│   ├── useNodeManagement.ts          (Gestión de nodos)
│   ├── useScannerState.ts            (Estado del escáner)
│   ├── useModuleNavigation.ts        (Navegación entre módulos)
│   ├── useDarkMode.ts                (Tema oscuro)
│   ├── usePersistence.ts             (Persistencia en BD)
│   ├── useAuthExpiry.ts              (Detector de sesión expirada)
│   └── index.ts                      (Barrel export interno)
│
├── utils/                            ← Utilidades y helpers
│   ├── tunnelSync.ts                 (Funciones de sincronización)
│   ├── tunnelTimeout.ts              (Lógica de auto-timeout)
│   ├── tunnelKeepalive.ts            (Lógica de keepalive)
│   ├── nodeManagement.ts             (Gestión de nodos)
│   ├── persistence.ts                (Persistencia en BD)
│   └── index.ts                      (Barrel export interno)
│
└── README.md                         ← Documentación de la arquitectura
```

---

## 📋 Desglose de Archivos

### 1. **VpnContext.tsx** (archivo principal - 50 líneas)

**Responsabilidad**: Crear y exportar el contexto

```typescript
import React, { createContext } from 'react';
import type { VpnContextType } from './types';

export const VpnContext = createContext<VpnContextType | null>(null);
```

**Contenido**:
- Importar tipos desde `types.ts`
- Crear contexto
- Nada más

---

### 2. **VpnProvider.tsx** (archivo principal - 350 líneas)

**Responsabilidad**: Componente provider que orquesta todos los hooks

```typescript
export function VpnProvider({ children }: { children: React.ReactNode }) {
  // Orquestar todos los hooks
  const auth = useAuth();
  const tunnelSync = useTunnelSync();
  const tunnelTimeout = useTunnelTimeout();
  const tunnelKeepalive = useTunnelKeepalive();
  const nodes = useNodeManagement();
  const scanner = useScannerState();
  const navigation = useModuleNavigation();
  const theme = useDarkMode();
  const persistence = usePersistence();
  const authExpiry = useAuthExpiry();
  
  // Combinar todos en el value del context
  return (
    <VpnContext.Provider value={{
      // Auth
      isAuthenticated: auth.isAuthenticated,
      credentials: auth.credentials,
      isReady: auth.isReady,
      handleLoginSuccess: auth.handleLoginSuccess,
      handleLogout: auth.handleLogout,
      // ... resto
    }}>
      {children}
    </VpnContext.Provider>
  );
}
```

**Contenido**:
- TODO el estado actual de VpnProvider
- Sin cambios lógicos
- Solo reorganizado

---

### 3. **types.ts** (archivo nuevo - 50 líneas)

```typescript
import type { VpnSecret, RouterCredentials } from '../store/db';
import type { NodeInfo } from '../types/api';

export interface VpnContextType {
  // Auth
  isAuthenticated: boolean;
  credentials: RouterCredentials | undefined;
  isReady: boolean;
  handleLoginSuccess: (creds: RouterCredentials) => void;
  handleLogout: () => Promise<void>;

  // VPNs gestionados
  managedVpns: VpnSecret[];
  setManagedVpns: React.Dispatch<React.SetStateAction<VpnSecret[]>>;

  // ... resto de tipos
}
```

**Contenido**:
- `VpnContextType` (interface del contexto)
- Tipos internos usados
- Importes de tipos externos

---

### 4. **constants.ts** (archivo nuevo - 10 líneas)

```typescript
export const TUNNEL_TIMEOUT_MS = 30 * 60 * 1000;    // 30 minutos
export const TUNNEL_KEEPALIVE_MS = 5 * 60 * 1000;   // 5 minutos
export const TUNNEL_KEEPALIVE_CHECK_MS = 5000;      // 5 segundos (polling)
export const DEBOUNCE_SAVE_MS = 500;                 // 500 ms

// LocalStorage keys
export const LS_DARK_MODE = 'vpn_dark_mode';
export const LS_ACTIVE_MODULE = 'vpn_active_module';

// BroadcastChannel
export const BROADCAST_TUNNEL_SYNC = 'vpn_tunnel_sync';
```

---

### 5. **hooks/useAuth.ts** (20 líneas)

**Responsabilidad**: Autenticación

Contiene:
- `isAuthenticated`, `credentials`, `isReady`
- `handleLoginSuccess()`, `handleLogout()`
- Lógica original sin cambios

---

### 6. **hooks/useTunnelSync.ts** (85 líneas)

**Responsabilidad**: Sincronización de túnel entre pestañas + SSE + persistencia

Contiene:
- BroadcastChannel setup (líneas 82-104)
- Emitir cambios a otras pestañas (líneas 96-104)
- SSE EventSource (líneas 287-314)
- Persistencia con debounce (líneas 328-341)
- Lógica original sin cambios

---

### 7. **hooks/useTunnelTimeout.ts** (35 líneas)

**Responsabilidad**: Auto-timeout resiliente

Contiene:
- `tunnelExpiry` state
- Polling cada 5s
- Check de expiración (sobrevive a suspend)
- Lógica original (líneas 169-190) sin cambios

---

### 8. **hooks/useTunnelKeepalive.ts** (45 líneas)

**Responsabilidad**: Heartbeat y restauración automática

Contiene:
- Interval cada 5 minutos
- POST /api/tunnel/keepalive
- Restauración de reglas mangle
- Lógica original (líneas 192-233) sin cambios

---

### 9. **hooks/useNodeManagement.ts** (30 líneas)

**Responsabilidad**: Gestión de nodos VRF

Contiene:
- `nodes`, `activeNodeVrf`, `adminIP`
- `deactivateAllNodes()`, `removeNodeFromState()`
- Lógica original (líneas 123-166) sin cambios

---

### 10. **hooks/useScannerState.ts** (8 líneas)

**Responsabilidad**: Estado del escáner

Contiene:
- `scannedSecrets`, `hasScanned` + setters
- Lifting de estado para persistencia entre tabs
- Lógica original sin cambios

---

### 11. **hooks/useModuleNavigation.ts** (12 líneas)

**Responsabilidad**: Navegación entre módulos

Contiene:
- `activeModule`, `setActiveModule`
- Persistencia en localStorage
- Lógica original (líneas 56-59, 117-119) sin cambios

---

### 12. **hooks/useDarkMode.ts** (18 líneas)

**Responsabilidad**: Tema oscuro

Contiene:
- `darkMode`, `toggleDarkMode()`
- Aplicar a documento
- Persistencia en localStorage
- Lógica original (líneas 107-121) sin cambios

---

### 13. **hooks/useAuthExpiry.ts** (12 líneas)

**Responsabilidad**: Detectar sesión expirada

Contiene:
- Listener de evento 'auth_expired'
- Trigger de logout automático
- Lógica original (líneas 316-325) sin cambios

---

### 14. **hooks/usePersistence.ts** (45 líneas)

**Responsabilidad**: Cargar/persistir en BD

Contiene:
- Carga inicial desde DB (líneas 235-276)
- Persistencia con debounce (líneas 328-341)
- Desactivación post-sleep (líneas 278-284)
- Lógica original sin cambios

---

### 15. **utils/tunnelSync.ts** (20 líneas)

**Responsabilidad**: Funciones helper de sincronización

```typescript
export function broadcastTunnelUpdate(activeNodeVrf: string | null, tunnelExpiry: number | null) {
  // BroadcastChannel helper
}

export async function fetchTunnelStatus(apiBaseUrl: string) {
  // GET /api/tunnel/status
}
```

---

### 16. **utils/tunnelKeepalive.ts** (15 líneas)

**Responsabilidad**: Helper de keepalive

```typescript
export async function sendKeepalive(apiBaseUrl: string, hostIP: string, targetVRF: string) {
  // POST /api/tunnel/keepalive
}
```

---

### 17. **utils/persistence.ts** (10 líneas)

**Responsabilidad**: Helpers de persistencia

```typescript
export async function loadContextFromDb() {
  // Cargar del almacén
}

export async function saveContextToDb(state: ContextState) {
  // Guardar en BD
}
```

---

## 🔄 Flujo de Reorganización

### Paso 1: Crear Estructura de Carpetas
```bash
mkdir -p src/context/{hooks,utils}
```

### Paso 2: Crear Archivos Nuevos
- `types.ts` - Mover tipos desde VpnContext.tsx
- `constants.ts` - Extraer constantes
- `VpnContext.tsx` - Nuevo, solo crea el contexto
- `VpnProvider.tsx` - Nuevo, move lógica de provider
- Hooks × 10 - Extraer lógica por responsabilidad
- Utils × 3 - Helpers reutilizables

### Paso 3: Actualizar Imports
- `src/context/index.ts` - Barrel export
- `src/App.tsx` - Sigue importando desde `src/context`

### Paso 4: Verificar Funcionamiento
- Build sin errores TypeScript
- Sin breaking changes
- Mismo comportamiento

---

## 📊 Comparación Antes/Después

### Antes ❌
```
src/context/
└── VpnContext.tsx (413 líneas - TODO mezclado)
```

### Después ✅
```
src/context/
├── VpnContext.tsx (50 líneas - solo creación)
├── VpnProvider.tsx (350 líneas - orquestación)
├── types.ts (50 líneas - tipos)
├── constants.ts (10 líneas - constantes)
├── index.ts (barrel export)
├── hooks/ (100 líneas distribuidas)
├── utils/ (45 líneas distribuidas)
└── README.md (documentación)
```

**Beneficios**:
- ✅ Cada archivo tiene una responsabilidad clara
- ✅ Fácil encontrar código específico
- ✅ Fácil de testear
- ✅ Fácil de mantener
- ✅ Cero breaking changes
- ✅ Sin cambios de lógica

---

## 🚀 Implementación

**Archivos a crear**: 17  
**Archivos a modificar**: 2 (index.ts, App.tsx imports)  
**Líneas de código**: 0 nuevas (solo reorganización)  
**Breaking changes**: CERO  
**Tiempo estimado**: 2-3 horas

---

## 📌 Estructura Final del index.ts

```typescript
// src/context/index.ts

export { VpnContext } from './VpnContext';
export { VpnProvider } from './VpnProvider';
export { useVpn } from './hooks';
export type { VpnContextType } from './types';
export { TUNNEL_TIMEOUT_MS, TUNNEL_KEEPALIVE_MS } from './constants';

// Los hooks internos NO se exportan
// Solo useVpn (hook externo) se proporciona
```

---

## ✅ Verificación Post-Refactor

```bash
# Build debe pasar
npm run build

# Tests deben pasar (si existen)
npm test

# No hay breaking changes
# - Mismos tipos exportados
# - Mismo hook useVpn()
# - Mismo comportamiento
```

---

## 📚 Documentación

Crear `src/context/README.md`:

```markdown
# Context API - VPN Manager

## Estructura

### VpnContext.tsx
- Define el contexto React

### VpnProvider.tsx
- Provider que orquesta todos los hooks
- Inyecta estado en el árbol de componentes

### hooks/
- useAuth: autenticación
- useTunnelSync: sincronización cross-device
- useTunnelTimeout: auto-timeout resiliente
- useTunnelKeepalive: heartbeat
- useNodeManagement: gestión de nodos
- useScannerState: estado del escáner
- useModuleNavigation: navegación
- useDarkMode: tema
- usePersistence: persistencia en BD
- useAuthExpiry: expiración de sesión

### utils/
- Helpers reutilizables
```

---

## 🎯 Conclusión

**Propuesta**: Refactorización pura de VpnContext.tsx en estructura modular

**Resultado**:
- ✅ Código más legible
- ✅ Mantenimiento más fácil
- ✅ Testing más fácil
- ✅ Cero breaking changes
- ✅ Cero cambios de lógica

**Próximo paso**: Ejecutar la refactorización siguiendo esta guía paso a paso.

