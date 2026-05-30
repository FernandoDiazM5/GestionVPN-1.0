# 📋 NodeAccessPanel.tsx - Documentación Completa

**Archivo**: `src/components/Devices/NodeAccessPanel/NodeAccessPanel.tsx`  
**Estado**: ✅ Refactorizado a 8 Custom Hooks  
**Líneas**: 836 líneas  
**Fecha**: 2026-05-30  
**Funcionalidad**: 100% Idéntica - Sin cambios de comportamiento

---

## 🏗️ ARQUITECTURA GENERAL

```
NodeAccessPanel.tsx (836 líneas)
├── 📥 Imports y dependencias externas
├── 🎣 Inicialización de 8 Custom Hooks
├── 🧮 Lógica de computación y handlers
├── 🎨 JSX y renderizado de UI
└── 📤 Export del componente
```

**Principio**: Separación de responsabilidades
- **Hooks**: Estado y lógica de negocio
- **Componente**: Orquestación y renderizado

---

## 📦 ESTRUCTURA DE IMPORTS (Líneas 1-49)

### React Hooks (Línea 1)
```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
```
- Hooks básicos de React
- **Nota**: La mayoría de estado ahora está en custom hooks

### Utilities (Líneas 2-3, 11-14)
```typescript
import { apiFetch } from '../../../utils/apiClient';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import type { NodeInfo, WgPeer } from '../../../types/api';
import { API_BASE_URL } from '../../../config';
```
- Utilidades para llamadas API
- Tipos TypeScript
- Configuración centralizada

### Context (Línea 10)
```typescript
import { useVpn, TUNNEL_TIMEOUT_MS } from '../../../context';
```
- Context global de VPN
- Proporciona: credentials, nodes, activeNodeVrf, tunnelExpiry, adminIP, etc.

### Componentes UI (Líneas 13, 15-16)
```typescript
import NodeCard from '../../VPN/NodeCard';
import { deviceDb } from '../../../store/deviceDb';
import { cpeCache } from '../../../store/cpeCache';
```
- Componente NodeCard para cada nodo
- Almacenes de caché y DB

### Modales (Líneas 19-28)
```typescript
import {
  NuevoNodo, EditarNodo, EliminarNodo, NuevoAdmin,
  BatchCsvModal, ScriptModal, HistoryModal, TagModal,
} from './modals';
```
- 8 modales importados desde carpeta `./modals`
- Cada modal en archivo separado

### Utilities y Tipos (Líneas 31-37)
```typescript
import {
  getSubnetConflicts, generateSecurePassword,
  type ProvisionStep, type ProvisionResult,
  formatCountdown,
} from './utils';
```
- Funciones de utilidad específicas de nodos
- Tipos para provisioning
- Formateo de countdown

### Custom Hooks (Líneas 40-49)
```typescript
import {
  useToasts, useNodeModals, useNodeTags, useServerSettings,
  useWireGuardState, useNodeState,
  useNodeFetching, useWireGuardPeers,
} from './hooks';
```
- **8 Custom Hooks** - el core de la refactorización
- Cada hook maneja un dominio específico

---

## 🎣 CUSTOM HOOKS (8 Hooks - Líneas 40-49 imports + 71-128 inicialización)

### 1. **useToasts** (Línea 71)
```typescript
const { toasts, addToast } = useToasts();
```
**Responsabilidad**: Gestionar notificaciones
- `toasts`: Array de notificaciones activas
- `addToast(text, type)`: Mostrar notificación (warn | info)
- **Ubicado en**: `./hooks/useToasts.ts`

### 2. **useNodeModals** (Línea 72)
```typescript
const nodeModals = useNodeModals();
```
**Responsabilidad**: Estados de visibilidad de modales
- `showNuevoNodo / setShowNuevoNodo`: Crear nodo
- `editNode / setEditNode`: Editar nodo
- `deleteNode / setDeleteNode`: Eliminar nodo
- `scriptNode / setScriptNode`: Ejecutar script
- `historyNode / setHistoryNode`: Ver historial
- `tagNode / setTagNode`: Gestionar tags
- `showBatchCsv / setShowBatchCsv`: Import CSV
- **Ubicado en**: `./hooks/useNodeModals.ts`

### 3. **useNodeTags** (Línea 73)
```typescript
const { nodeTags, setNodeTags, saveNodeTags } = useNodeTags();
```
**Responsabilidad**: Gestionar tags de nodos
- `nodeTags`: Mapa de tags por nodo
- `setNodeTags`: Actualizar tags locales
- `saveNodeTags`: Persistir tags en BD
- **Ubicado en**: `./hooks/useNodeTags.ts`

### 4. **useServerSettings** (Línea 74)
```typescript
const serverSettings = useServerSettings();
```
**Responsabilidad**: Configuración del servidor WireGuard
- `globalServerIP`: IP global del servidor
- `editingGlobalIP / setEditingGlobalIP`: Estado de edición
- `serverPublicKey / setServerPublicKey`: Clave pública
- `serverListenPort / setServerListenPort`: Puerto de escucha
- `serverEndpointIP / setServerEndpointIP`: Endpoint IP
- **Ubicado en**: `./hooks/useServerSettings.ts`

### 5. **useWireGuardState** (Línea 75)
```typescript
const wgState = useWireGuardState();
```
**Responsabilidad**: Estado completo de WireGuard
- `wgPeers / setWgPeers`: Lista de peers
- `loadingWg / setLoadingWg`: Estado de carga
- `wgError / setWgError`: Errores
- `showNuevoAdmin / setShowNuevoAdmin`: Modal nuevo admin
- `peersExpanded / setPeersExpanded`: Expandir lista
- `peerColors / setPeerColors`: Colores de peers
- `colorPickerAddr / setColorPickerAddr`: Dirección seleccionada
- `editingPeerId / editingPeerName`: Estados de edición
- `savingPeerName / setSavingPeerName`: Estado de guardado
- `copiedPeerId / setCopiedPeerId`: ID copiado
- `wgLoadedRef`: Ref para tracking de carga
- **Ubicado en**: `./hooks/useWireGuardState.ts`

### 6. **useNodeState** (Línea 76)
```typescript
const nodeState = useNodeState();
```
**Responsabilidad**: Estado de nodos y lógica de sincronización
- `nodes / setNodes`: Lista de nodos (del context)
- `isLoading / setIsLoading`: Estado de carga
- `hasLoaded / setHasLoaded`: Flag inicial de carga
- `errorMsg / setErrorMsg`: Mensajes de error
- `isRevoking / setIsRevoking`: Estado de revocación
- `search / setSearch`: Búsqueda filtrada
- `sortMode / setSortMode`: Modo de ordenamiento
- `showRenewalWarn / setShowRenewalWarn`: Alerta de renovación
- `prevRunningRef / pollingRef`: Refs para tracking
- **Ubicado en**: `./hooks/useNodeState.ts`

### 7. **useNodeFetching** (Líneas 93-106)
```typescript
const { fetchNodes, handleLoadNodes } = useNodeFetching({
  credentials, isReady, hasLoaded, setHasLoaded,
  setNodes, setIsLoading, setErrorMsg, setShowRenewalWarn,
  tunnelExpiry, prevRunningRef, pollingRef, addToast,
});
```
**Responsabilidad**: Obtención y polling de nodos
- `fetchNodes()`: Callback para obtener nodos del API
- `handleLoadNodes()`: Función async para carga inicial
- **Incluye**: 
  - Polling cada 60s (detección de desconexiones)
  - Auto-sync al montar (después de 2s)
  - Alerta de renovación de túnel (<2 min)
- **Ubicado en**: `./hooks/useNodeFetching.ts` (~157 líneas)

### 8. **useWireGuardPeers** (Líneas 108-128)
```typescript
const { loadWgPeers, savePeerColor, savePeerName, copyWgConfig } = useWireGuardPeers({
  credentials, wgLoadedRef, setWgPeers, setPeerColors,
  setServerPublicKey, setServerListenPort, setServerEndpointIP,
  setLoadingWg, setWgError, setColorPickerAddr, setEditingPeerId,
  setEditingPeerName, setSavingPeerName, setCopiedPeerId,
  serverEndpointIP, serverListenPort, serverPublicKey,
  editingPeerName, savingPeerName,
});
```
**Responsabilidad**: Operaciones WireGuard
- `loadWgPeers()`: Cargar lista de peers
- `savePeerColor()`: Guardar color de peer
- `savePeerName()`: Guardar nombre de peer
- `copyWgConfig()`: Copiar configuración
- **Ubicado en**: `./hooks/useWireGuardPeers.ts` (~157 líneas)

---

## 🧮 LÓGICA DE COMPUTACIÓN (Líneas 130-150)

### PEER_COLOR_PALETTE (Línea 90)
```typescript
const PEER_COLOR_PALETTE = [
  '#6366f1', '#10b981', '#0ea5e9', '#f59e0b',
  '#f43f5e', '#8b5cf6', '#f97316', '#14b8a6',
  '#ec4899', '#64748b'
];
```
- Paleta de 10 colores para distintos peers

### exportCsv() (Líneas 130-143)
```typescript
const exportCsv = () => {
  const header = 'Nombre,VRF,Red LAN,IP Túnel,Usuario PPP,Estado';
  const csvRows = nodes.map(n => [
    `"${n.nombre_nodo}"`, n.nombre_vrf || '',
    `"${(n.lan_subnets?.join(';') || n.segmento_lan || '')}"`,
    n.ip_tunnel || '', n.ppp_user,
    n.running ? 'Conectado' : 'Desconectado',
  ].join(','));
  // ... crea blob y descarga
};
```
**Función**: Exportar nodos a CSV
**Columnas**: Nombre, VRF, Red LAN, IP Túnel, Usuario PPP, Estado

### handleRevokeAll() (Líneas 145-149)
```typescript
const handleRevokeAll = async () => {
  setIsRevoking(true);
  await deactivateAllNodes();
  setIsRevoking(false);
};
```
**Función**: Revocar todos los nodos
**Origen**: Del context `useVpn`

### CountdownDisplay (Líneas 55-64)
```typescript
function CountdownDisplay({ expiry }: { expiry: number }) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => setTime(formatCountdown(expiry - Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiry]);
  return <span>{time}</span>;
}
```
**Componente Interno**: Muestra countdown en formato mm:ss
**Actualización**: Cada 1 segundo

---

## 🎨 JSX Y RENDERIZADO

El componente retorna un `<div className="space-y-5">` que contiene:

### Secciones principales (en orden de aparición):

1. **Barra de Control Superior**
   - Botón de refresh
   - Campo de búsqueda
   - Select de ordenamiento
   - Botón de nuevos nodos

2. **Indicadores de Estado**
   - Error messages
   - Renewal warnings
   - Loading spinners

3. **Listado de Nodos**
   - NodeCard por cada nodo
   - Filtrado por búsqueda
   - Ordenamiento (default, connected, disconnected)

4. **Sección WireGuard**
   - Configuración de servidor
   - Lista de peers
   - Operaciones de administrador

5. **Modales Condicionales**
   - NuevoNodo (si showNuevoNodo)
   - EditarNodo (si editNode)
   - EliminarNodo (si deleteNode)
   - NuevoAdmin (si showNuevoAdmin)
   - ScriptModal (si scriptNode)
   - HistoryModal (si historyNode)
   - TagModal (si tagNode)
   - BatchCsvModal (si showBatchCsv)

6. **Toast Notifications**
   - Mostradas en esquina (arriba-derecha típicamente)
   - Duración automática

---

## 📁 ESTRUCTURA DE CARPETAS

```
NodeAccessPanel/
├── NodeAccessPanel.tsx              ← COMPONENTE PRINCIPAL (836 líneas)
├── index.ts                         ← Barrel export
│
├── hooks/                           ← CUSTOM HOOKS (~600 líneas)
│   ├── useToasts.ts                (19 líneas)
│   ├── useNodeModals.ts            (29 líneas)
│   ├── useNodeTags.ts              (32 líneas)
│   ├── useServerSettings.ts        (42 líneas)
│   ├── useWireGuardState.ts        (43 líneas)
│   ├── useNodeState.ts             (54 líneas)
│   ├── useNodeFetching.ts          (157 líneas)
│   ├── useWireGuardPeers.ts        (157 líneas)
│   └── index.ts                    ← Barrel export
│
├── modals/                          ← COMPONENTES DE MODALES
│   ├── NuevoNodo.tsx
│   ├── EditarNodo.tsx
│   ├── EliminarNodo.tsx
│   ├── NuevoAdmin.tsx
│   ├── BatchCsvModal.tsx
│   ├── ScriptModal.tsx
│   ├── HistoryModal.tsx
│   ├── TagModal.tsx
│   └── index.ts                    ← Barrel export (8 modales)
│
├── components/
│   └── ProvisionSteps.tsx           ← Pasos de provisioning
│
├── utils/
│   ├── types.ts                     ← Tipos específicos
│   ├── subnet.ts                    ← Lógica de subredes
│   ├── password.ts                  ← Generación de contraseñas
│   ├── countdown.ts                 ← Formateo de countdown
│   └── index.ts                    ← Barrel export
│
└── 📋_ESTRUCTURA_Y_DOCUMENTACION.md ← ESTE ARCHIVO
```

---

## 🔄 FLUJO DE DATOS

```
┌─────────────────────────────────────────────────────────────┐
│                      VPN Context                              │
│  (credentials, nodes, setNodes, tunnelExpiry, adminIP, ...) │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │ NodeAccessPanel  │
                    │  (Component)     │
                    └────────┬─────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼────────┐
    │   Hooks     │  │   Handlers  │  │     JSX       │
    │             │  │             │  │               │
    │ useToasts   │  │ exportCsv   │  │ Lista Nodos   │
    │ useNodeMod. │  │ handleRevoke│  │ WireGuard UI  │
    │ useNodeTags │  │ etc...      │  │ Modales       │
    │ useServerS. │  │             │  │ Notificaciones│
    │ useWgState  │  │             │  │               │
    │ useNodeState│  │             │  │               │
    │ useNodeFet. │  │             │  │               │
    │ useWgPeers │  │             │  │               │
    └──────┬──────┘  └──────┬──────┘  └───────────────┘
           │                │
           └────────────────┼────────────────┐
                            │                │
                    ┌───────▼──────┐  ┌─────▼────┐
                    │ API Calls    │  │  Local   │
                    │              │  │  Storage │
                    │ /api/nodes   │  │  deviceDb│
                    │ /api/wg/*    │  │  cpeCache│
                    │ /api/node/*  │  │          │
                    └──────────────┘  └──────────┘
```

---

## ⚙️ CICLO DE VIDA

### 1. **Inicialización (Al montar)**
```
1. useVpn() obtiene contexto global
2. useNodeState() inicializa estado local
3. useNodeFetching() configura polling
   ├─ useEffect: Auto-sync después de 2s
   ├─ useEffect: Inicia polling cada 60s
   └─ useEffect: Configura alerta renovación
4. useWireGuardPeers() prepara operaciones WG
5. Componente renderiza inicial
```

### 2. **Durante la sesión**
```
Polling cada 60s:
├─ fetchNodes() obtiene estado actual
├─ Detecta cambios (desconexiones/reconexiones)
├─ Actualiza UI automáticamente
└─ Muestra notificaciones si aplica

Interacciones del usuario:
├─ Click en nodo → Modales
├─ Editar → Handlers + API calls
├─ Eliminar → Confirmación + API call
├─ Tags → saveNodeTags()
├─ WireGuard → loadWgPeers, savePeerColor, etc.
└─ Exportar → exportCsv()
```

### 3. **Desmontaje**
```
- clearInterval en polling
- Limpiar timeouts
- Liberar refs
```

---

## 🔍 MAPA DE RESPONSABILIDADES

| Responsabilidad | Ubicación | Tipo |
|---|---|---|
| Notificaciones | `useToasts()` | Hook |
| Estados de modales | `useNodeModals()` | Hook |
| Gestión de tags | `useNodeTags()` | Hook |
| Config. servidor WG | `useServerSettings()` | Hook |
| Estado de peers WG | `useWireGuardState()` | Hook |
| Estado de nodos | `useNodeState()` | Hook |
| Fetch de nodos | `useNodeFetching()` | Hook |
| Operaciones WG | `useWireGuardPeers()` | Hook |
| Orquestación | `NodeAccessPanel.tsx` | Componente |
| Exportar CSV | `NodeAccessPanel.tsx` | Función |
| Revocar todos | `NodeAccessPanel.tsx` | Función |
| Renderizado UI | `NodeAccessPanel.tsx` | JSX |

---

## 🛠️ GUÍA DE MANTENIMIENTO

### Para agregar una nueva funcionalidad:

**Si afecta estado:**
1. Crear nuevo hook en `./hooks/useNewFeature.ts`
2. Exportar en `./hooks/index.ts`
3. Importar en `NodeAccessPanel.tsx`
4. Inicializar el hook
5. Usar en JSX

**Si afecta un modal:**
1. Crear nuevo modal en `./modals/NewModal.tsx`
2. Exportar en `./modals/index.ts`
3. Importar en `NodeAccessPanel.tsx`
4. Agregar estado en `useNodeModals()`
5. Renderizar modal condicionalmente

**Si es una utilidad:**
1. Crear en `./utils/newUtil.ts`
2. Exportar en `./utils/index.ts`
3. Importar en `NodeAccessPanel.tsx` o hooks

### Para debuggear:

1. **Estado no actualiza**: Revisar si setter está siendo llamado
2. **Modal no aparece**: Verificar estado de visibilidad en `useNodeModals()`
3. **API no responde**: Revisar credentials y `fetchNodes()`
4. **UI lenta**: Profiler de React - puede ser re-render innecesario
5. **Polling no funciona**: Revisar `useNodeFetching` y refs

---

## 📊 ESTADÍSTICAS

```
Total líneas:           836
├─ Imports:            ~50 líneas
├─ Inicialización:     ~80 líneas
├─ Componentes custom: ~10 líneas
├─ Lógica/Handlers:    ~20 líneas
└─ JSX/Renderizado:   ~676 líneas

Hooks externos:       8 (600 líneas en total)
Modales:             8 archivos
Utilidades:          4+ funciones
Componentes UI:      1 (NodeCard)
```

---

## ✅ CHECKLIST DE COMPILACIÓN

```
✅ TypeScript - Sin errores
✅ Imports - Todos resueltos
✅ Hooks - Correctamente inicializados
✅ Types - Todas las interfaces definidas
✅ JSX - Sintaxis válida
✅ Runtime - Funcionalidad preservada
```

---

## 🎯 PRÓXIMAS MEJORAS POTENCIALES

- [ ] Virtualizar lista de nodos para mejor rendimiento
- [ ] Agregar búsqueda en tiempo real optimizada
- [ ] Caché local de estado
- [ ] Compresión de polling
- [ ] Tests unitarios para cada hook
- [ ] Error boundary para manejo de errores

---

**Última actualización**: 2026-05-30  
**Estado**: Documentación completa, código intacto

