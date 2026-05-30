# 🔍 Mapa Rápido de Referencias - NodeAccessPanel

**Uso**: Encontrar rápidamente dónde está cada cosa  
**Formato**: Índice de funciones, hooks, componentes y flujos

---

## 🏃 BÚSQUEDAS RÁPIDAS

### "¿Dónde está la función X?"

| Función | Ubicación | Líneas |
|---------|-----------|--------|
| `addToast()` | `useToasts.ts` | 19 |
| `exportCsv()` | `NodeAccessPanel.tsx` | 130-143 |
| `handleRevokeAll()` | `NodeAccessPanel.tsx` | 145-149 |
| `handleLoadNodes()` | `useNodeFetching.ts` | 51-69 |
| `fetchNodes()` | `useNodeFetching.ts` | 39-49 |
| `silentPoll()` | `useNodeFetching.ts` | 73-110 |
| `loadWgPeers()` | `useWireGuardPeers.ts` | 70+ |
| `savePeerColor()` | `useWireGuardPeers.ts` | 90+ |
| `savePeerName()` | `useWireGuardPeers.ts` | 100+ |
| `copyWgConfig()` | `useWireGuardPeers.ts` | 110+ |
| `saveNodeTags()` | `useNodeTags.ts` | 22+ |
| `getSubnetConflicts()` | `utils/subnet.ts` | - |
| `generateSecurePassword()` | `utils/password.ts` | - |
| `formatCountdown()` | `utils/countdown.ts` | - |

### "¿Dónde está el estado X?"

| Estado | Hook | Setter | Línea |
|--------|------|--------|-------|
| `toasts` | `useToasts` | `setToasts` | 71 |
| `showNuevoNodo` | `useNodeModals` | `setShowNuevoNodo` | 88 |
| `editNode` | `useNodeModals` | `setEditNode` | 88 |
| `deleteNode` | `useNodeModals` | `setDeleteNode` | 88 |
| `scriptNode` | `useNodeModals` | `setScriptNode` | 88 |
| `historyNode` | `useNodeModals` | `setHistoryNode` | 88 |
| `tagNode` | `useNodeModals` | `setTagNode` | 88 |
| `showBatchCsv` | `useNodeModals` | `setShowBatchCsv` | 88 |
| `nodeTags` | `useNodeTags` | `setNodeTags` | 73 |
| `globalServerIP` | `useServerSettings` | `setGlobalServerIP` | 82 |
| `serverPublicKey` | `useServerSettings` | `setServerPublicKey` | 82 |
| `serverListenPort` | `useServerSettings` | `setServerListenPort` | 82 |
| `serverEndpointIP` | `useServerSettings` | `setServerEndpointIP` | 82 |
| `wgPeers` | `useWireGuardState` | `setWgPeers` | 85 |
| `peerColors` | `useWireGuardState` | `setPeerColors` | 85 |
| `isLoading` | `useNodeState` | `setIsLoading` | 79 |
| `hasLoaded` | `useNodeState` | `setHasLoaded` | 79 |
| `errorMsg` | `useNodeState` | `setErrorMsg` | 79 |
| `search` | `useNodeState` | `setSearch` | 79 |
| `sortMode` | `useNodeState` | `setSortMode` | 79 |

### "¿Dónde está el modal X?"

| Modal | Componente | Estado visible | Setter |
|-------|-----------|-----------------|--------|
| Crear Nodo | `NuevoNodo.tsx` | `showNuevoNodo` | `setShowNuevoNodo` |
| Editar Nodo | `EditarNodo.tsx` | `editNode` | `setEditNode` |
| Eliminar Nodo | `EliminarNodo.tsx` | `deleteNode` | `setDeleteNode` |
| Nuevo Admin | `NuevoAdmin.tsx` | `showNuevoAdmin` | `setShowNuevoAdmin` |
| Script | `ScriptModal.tsx` | `scriptNode` | `setScriptNode` |
| Historial | `HistoryModal.tsx` | `historyNode` | `setHistoryNode` |
| Tags | `TagModal.tsx` | `tagNode` | `setTagNode` |
| Import CSV | `BatchCsvModal.tsx` | `showBatchCsv` | `setShowBatchCsv` |

---

## 🪝 GUÍA DE HOOKS

### useToasts (Línea 71)
```typescript
const { toasts, addToast } = useToasts();

// Usar:
addToast('Nodo conectado', 'info');
addToast('Error al conectar', 'warn');
```
**Props**: Ninguno  
**Returns**: `{ toasts, addToast }`

---

### useNodeModals (Línea 72)
```typescript
const nodeModals = useNodeModals();

// Acceder:
nodeModals.showNuevoNodo, nodeModals.setShowNuevoNodo
nodeModals.editNode, nodeModals.setEditNode
// ... 6 pares más

// Usar:
nodeModals.setShowNuevoNodo(true);  // Abrir modal
```
**Props**: Ninguno  
**Returns**: Objeto con 8 pares estado/setter

---

### useNodeTags (Línea 73)
```typescript
const { nodeTags, setNodeTags, saveNodeTags } = useNodeTags();

// Usar:
setNodeTags({ ...nodeTags, [nodeId]: ['tag1', 'tag2'] });
await saveNodeTags(); // Persistir en BD
```
**Props**: Ninguno  
**Returns**: `{ nodeTags, setNodeTags, saveNodeTags }`

---

### useServerSettings (Línea 74)
```typescript
const serverSettings = useServerSettings();

// Acceder:
serverSettings.globalServerIP
serverSettings.serverPublicKey
serverSettings.serverListenPort
// ... y más

// Usar:
serverSettings.setGlobalServerIP('192.168.1.1');
```
**Props**: Ninguno  
**Returns**: Objeto con 10+ propiedades

---

### useWireGuardState (Línea 75)
```typescript
const wgState = useWireGuardState();

// Acceder:
wgState.wgPeers
wgState.peerColors
wgState.loadingWg
// ... 10+ propiedades más

// Usar:
wgState.setWgPeers(newPeersList);
wgState.setPeerColors({ [addr]: color });
```
**Props**: Ninguno  
**Returns**: Objeto con 20+ propiedades

---

### useNodeState (Línea 76)
```typescript
const nodeState = useNodeState();

// Acceder:
nodeState.isLoading
nodeState.nodes
nodeState.search
nodeState.sortMode
// ... y más

// Usar:
nodeState.setSearch('filtro');
nodeState.setSortMode('connected');
```
**Props**: Ninguno  
**Returns**: Objeto con 20+ propiedades (muchas del context)

---

### useNodeFetching (Línea 93-106)
```typescript
const { fetchNodes, handleLoadNodes } = useNodeFetching({
  credentials,
  isReady, hasLoaded, setHasLoaded,
  setNodes, setIsLoading, setErrorMsg, setShowRenewalWarn,
  tunnelExpiry, prevRunningRef, pollingRef, addToast,
});

// Usar:
await handleLoadNodes();  // Carga inicial
const data = await fetchNodes();  // Obtener datos
```
**Props**: Objeto con credenciales y setters  
**Returns**: `{ fetchNodes, handleLoadNodes, silentPoll, pollErrorCountRef }`  
**Efectos internos**: 3 useEffect (polling, auto-sync, renovación)

---

### useWireGuardPeers (Línea 108-128)
```typescript
const { loadWgPeers, savePeerColor, savePeerName, copyWgConfig } = useWireGuardPeers({
  credentials,
  wgLoadedRef,
  setWgPeers, setPeerColors, setServerPublicKey,
  setServerListenPort, setServerEndpointIP,
  // ... más setters
  serverEndpointIP, serverListenPort, serverPublicKey,
  editingPeerName, savingPeerName,
});

// Usar:
await loadWgPeers();
await savePeerColor(address, color);
await savePeerName(address, newName);
copyWgConfig(address);
```
**Props**: Objeto grande con muchos setters  
**Returns**: Objeto con 4 funciones async  
**Efectos internos**: useEffect para cargar peers

---

## 🧩 COMPONENTES Y MODALES

### Componentes internos

```typescript
// Línea 55-64
function CountdownDisplay({ expiry }: { expiry: number })
  Props: expiry (timestamp en ms)
  Output: Span con format "mm:ss"
  Actualización: Cada 1 segundo
```

### Modales (en ./modals/)

```
NuevoNodo.tsx       → Crear nuevo nodo VPN
EditarNodo.tsx      → Editar nodo existente
EliminarNodo.tsx    → Eliminar nodo con confirmación
NuevoAdmin.tsx      → Agregar nuevo peer admin WireGuard
BatchCsvModal.tsx   → Importar nodos desde CSV
ScriptModal.tsx     → Ejecutar scripts en nodo
HistoryModal.tsx    → Ver historial de eventos
TagModal.tsx        → Asignar tags a nodo
```

---

## 🔌 CONEXIONES CON EXTERNAL

### Context (`useVpn()`)
```typescript
// Línea 67-68
const { 
  credentials,          // IP, usuario, contraseña del router
  nodes,                // Array de NodeInfo
  setNodes,             // Actualizar nodos
  activeNodeVrf,        // VRF activo
  tunnelExpiry,         // Timestamp de expiración del túnel
  setTunnelExpiry,      // Actualizar expiración
  adminIP,              // IP del administrador
  deactivateAllNodes,   // Async function
  removeNodeFromState,  // Remover nodo de state
  isReady               // Flag de listo
} = vpnContext;
```

### APIs llamadas
```
POST /api/nodes                    → Obtener lista de nodos
POST /api/node/history/add         → Agregar evento a historial
GET  /api/wg/*                     → Operaciones WireGuard
POST /api/node/*                   → Operaciones de nodo
```

### Utilidades
```typescript
import { apiFetch } from '../../../utils/apiClient';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { getSubnetConflicts } from './utils';
import { generateSecurePassword } from './utils';
import { formatCountdown } from './utils';
```

---

## 🎨 ESTRUCTURA JSX PRINCIPAL

```
<div className="space-y-5">
  
  ┌─ Barra superior (filtro, búsqueda, botones)
  │
  ├─ Indicadores de estado (errores, warnings)
  │
  ├─ Listado de nodos
  │  └─ NodeCard × N (filtered + sorted)
  │
  ├─ Sección WireGuard
  │  ├─ Configuración del servidor
  │  └─ Tabla de peers
  │
  ├─ Modales condicionales × 8
  │
  └─ Toast notifications
```

---

## 🔄 FLUJOS COMUNES

### 1. Crear un nodo
```
Usuario click "Nuevo Nodo"
→ setShowNuevoNodo(true)
→ NuevoNodo modal aparece
→ User completa form
→ Submit → API call
→ setNodes(updated)
→ addToast success
→ setShowNuevoNodo(false)
```

### 2. Editar nodo
```
Usuario click editar en NodeCard
→ setEditNode(node)
→ EditarNodo modal aparece
→ User modifica
→ Submit → API call
→ setNodes(updated)
→ setEditNode(null)
```

### 3. Agregar color a peer
```
Usuario selecciona color
→ setColorPickerAddr(address)
→ User elige color
→ savePeerColor(address, color)
→ API call a /api/wg/peer/color
→ setPeerColors(updated)
→ addToast success
```

### 4. Polling automático
```
Componente monta
→ useNodeFetching init
→ useEffect: auto-sync after 2s
→ useEffect: start polling every 60s
→ silentPoll() cada minuto
  ├─ fetchNodes()
  ├─ Detecta changes
  ├─ setNodes(updated)
  └─ addToast si hay desconexiones
```

---

## ⚡ QUICK TIPS

### Para agregar estado
```typescript
// Crear hook en ./hooks/useMyFeature.ts
export function useMyFeature() {
  const [myState, setMyState] = useState(false);
  return { myState, setMyState };
}

// Exportar en ./hooks/index.ts
export { useMyFeature } from './useMyFeature';

// Usar en NodeAccessPanel.tsx
const { myState, setMyState } = useMyFeature();
```

### Para agregar modal
```typescript
// Crear en ./modals/MyModal.tsx
export function MyModal({ isOpen, onClose, data }) {
  // ... contenido modal
}

// Exportar en ./modals/index.ts
export { MyModal } from './MyModal';

// Usar en NodeAccessPanel.tsx
<MyModal isOpen={myState} onClose={() => setMyState(false)} />
```

### Para agregar notificación
```typescript
addToast('Tu mensaje aquí', 'info');    // info o warn
```

### Para llamar API
```typescript
const response = await apiFetch('/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
```

---

## 📋 CHECKLIST DE ENTENDIMIENTO

- [ ] Entiendo qué hace cada uno de los 8 hooks
- [ ] Sé dónde está cada función (Hook o Componente)
- [ ] Entiendo el flujo de datos (Context → Hooks → Component → JSX)
- [ ] Puedo encontrar rápidamente cualquier estado
- [ ] Sé cómo agregar un nuevo modal
- [ ] Sé cómo agregar una notificación
- [ ] Entiendo cómo funciona el polling
- [ ] Puedo debuggear un issue de estado

---

**Última actualización**: 2026-05-30  
**Nivel de detalle**: Intermedio (para desarrolladores familiarizados con React)

