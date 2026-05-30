# 📋 PLAN DE DIVISIÓN: NodeAccessPanel.tsx → Múltiples Hooks

**Objetivo**: Dividir NodeAccessPanel.tsx (1,042 líneas) en custom hooks reutilizables  
**Estrategia**: Similar a VpnContext (10 hooks) → NodeAccessPanel (8 hooks)  
**Código**: 100% original, solo reorganizado

---

## 📊 ESTADO ACTUAL

```
NodeAccessPanel.tsx: 1,042 líneas
├── Importes: ~40 líneas
├── CountdownDisplay: ~10 líneas
├── Estado de nodos: ~15 estados + refs
├── Estado WireGuard: ~15 estados + refs
├── Lógica de nodos: fetchNodes, handleLoadNodes, polling
├── Lógica WireGuard: loadWgPeers, savePeerColor, savePeerName, copyWgConfig
├── Lógica de tags: saveNodeTags
├── Lógica de toasts: addToast
├── Efectos (useEffect): ~10 efectos
└── JSX Render: ~700 líneas
```

---

## 🎯 ESTRUCTURA PROPUESTA

### `/hooks` → 8 Custom Hooks Reutilizables

```
hooks/
├── useNodeFetching.ts          (~60 líneas)
│   └── fetchNodes, handleLoadNodes, silentPoll
│
├── useNodeState.ts              (~40 líneas)
│   └── Estados de nodos: isLoading, hasLoaded, errorMsg, nodes, search, sort, etc.
│
├── useNodeModals.ts             (~30 líneas)
│   └── Estados de modales: showNuevoNodo, editNode, deleteNode, scriptNode, etc.
│
├── useNodeTags.ts               (~25 líneas)
│   └── nodeTags, saveNodeTags
│
├── useWireGuardState.ts         (~35 líneas)
│   └── wgPeers, loadingWg, wgError, showNuevoAdmin, peersExpanded, etc.
│
├── useWireGuardPeers.ts         (~80 líneas)
│   └── loadWgPeers, savePeerColor, savePeerName, copyWgConfig
│
├── useToasts.ts                 (~20 líneas)
│   └── toasts, addToast
│
├── useServerSettings.ts         (~25 líneas)
│   └── globalServerIP, editingGlobalIP, serverEndpointIP, serverPublicKey, serverListenPort
│
└── index.ts                     (barrel export)
```

### `NodeAccessPanel.tsx` → Componente Principal (~150 líneas)

```typescript
export default function NodeAccessPanel() {
  // Importar todos los hooks
  const nodeState = useNodeState();
  const nodeModals = useNodeModals();
  const nodeTags = useNodeTags();
  const { fetchNodes, handleLoadNodes, silentPoll } = useNodeFetching(nodeState);
  const wgState = useWireGuardState();
  const wgPeers = useWireGuardPeers(wgState);
  const toasts = useToasts();
  const serverSettings = useServerSettings();
  
  // Setup effects
  // Render JSX con estados y handlers
}
```

---

## 📝 DETALLES DE CADA HOOK

### 1. **useNodeState.ts** (~40 líneas)
**Estados relacionados con la gestión de nodos SSTP**

```typescript
export function useNodeState() {
  const { nodes, setNodes, activeNodeVrf, tunnelExpiry, setTunnelExpiry } = useVpn();
  
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(nodes.length > 0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'default' | 'connected' | 'disconnected'>('default');
  const [showRenewalWarn, setShowRenewalWarn] = useState(false);
  const prevRunningRef = useRef<Record<string, boolean>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  return {
    nodes, setNodes, activeNodeVrf, tunnelExpiry, setTunnelExpiry,
    isLoading, setIsLoading, hasLoaded, setHasLoaded,
    errorMsg, setErrorMsg, isRevoking, setIsRevoking,
    search, setSearch, sortMode, setSortMode,
    showRenewalWarn, setShowRenewalWarn,
    prevRunningRef, pollingRef
  };
}
```

### 2. **useNodeModals.ts** (~30 líneas)
**Estados de modales de nodos**

```typescript
export function useNodeModals() {
  const [showNuevoNodo, setShowNuevoNodo] = useState(false);
  const [editNode, setEditNode] = useState<NodeInfo | null>(null);
  const [deleteNode, setDeleteNode] = useState<NodeInfo | null>(null);
  const [scriptNode, setScriptNode] = useState<NodeInfo | null>(null);
  const [historyNode, setHistoryNode] = useState<NodeInfo | null>(null);
  const [tagNode, setTagNode] = useState<NodeInfo | null>(null);
  const [showBatchCsv, setShowBatchCsv] = useState(false);
  
  return {
    showNuevoNodo, setShowNuevoNodo,
    editNode, setEditNode,
    deleteNode, setDeleteNode,
    scriptNode, setScriptNode,
    historyNode, setHistoryNode,
    tagNode, setTagNode,
    showBatchCsv, setShowBatchCsv
  };
}
```

### 3. **useNodeFetching.ts** (~60 líneas)
**Lógica de obtención y sincronización de nodos**

```typescript
export function useNodeFetching(nodeState: ReturnType<typeof useNodeState>) {
  const { credentials } = useVpn();
  const { setNodes, prevRunningRef, pollingRef } = nodeState;
  
  const fetchNodes = useCallback(async () => {
    // Implementación original de fetchNodes
  }, [credentials]);
  
  const handleLoadNodes = async () => {
    // Implementación original de handleLoadNodes
  };
  
  const silentPoll = useCallback(async () => {
    // Implementación original de silentPoll
  }, [fetchNodes, setNodes, addToast]);
  
  return { fetchNodes, handleLoadNodes, silentPoll };
}
```

### 4. **useNodeTags.ts** (~25 líneas)
**Gestión de tags de nodos**

```typescript
export function useNodeTags() {
  const [nodeTags, setNodeTags] = useState<Record<string, string[]>>({});
  const tagsLoadedRef = useRef(false);
  
  const saveNodeTags = (pppUser: string, tags: string[]) => {
    // Implementación original
  };
  
  // useEffect para cargar tags al montar
  useEffect(() => {
    if (!tagsLoadedRef.current) {
      tagsLoadedRef.current = true;
      // Cargar tags
    }
  }, []);
  
  return { nodeTags, setNodeTags, saveNodeTags, tagsLoadedRef };
}
```

### 5. **useWireGuardState.ts** (~35 líneas)
**Estados relacionados con WireGuard peers**

```typescript
export function useWireGuardState() {
  const [wgPeers, setWgPeers] = useState<WgPeer[]>([]);
  const [loadingWg, setLoadingWg] = useState(false);
  const [wgError, setWgError] = useState<string | null>(null);
  const [showNuevoAdmin, setShowNuevoAdmin] = useState(false);
  const [peersExpanded, setPeersExpanded] = useState(false);
  const [peerColors, setPeerColors] = useState<Record<string, string>>({});
  const [colorPickerAddr, setColorPickerAddr] = useState<string | null>(null);
  const [editingPeerId, setEditingPeerId] = useState<string | null>(null);
  const [editingPeerName, setEditingPeerName] = useState('');
  const [savingPeerName, setSavingPeerName] = useState(false);
  const [copiedPeerId, setCopiedPeerId] = useState<string | null>(null);
  const wgLoadedRef = useRef(false);
  
  return {
    wgPeers, setWgPeers, loadingWg, setLoadingWg, wgError, setWgError,
    showNuevoAdmin, setShowNuevoAdmin, peersExpanded, setPeersExpanded,
    peerColors, setPeerColors, colorPickerAddr, setColorPickerAddr,
    editingPeerId, setEditingPeerId, editingPeerName, setEditingPeerName,
    savingPeerName, setSavingPeerName, copiedPeerId, setCopiedPeerId,
    wgLoadedRef
  };
}
```

### 6. **useWireGuardPeers.ts** (~80 líneas)
**Lógica de WireGuard (operaciones)**

```typescript
export function useWireGuardPeers(wgState: ReturnType<typeof useWireGuardState>) {
  const { credentials } = useVpn();
  
  const loadWgPeers = useCallback(async () => {
    // Implementación original de loadWgPeers
  }, [credentials, wgState]);
  
  const savePeerColor = (peerAddress: string, color: string) => {
    // Implementación original
  };
  
  const savePeerName = async (peer: WgPeer) => {
    // Implementación original
  };
  
  const copyWgConfig = (peer: WgPeer) => {
    // Implementación original
  };
  
  // useEffect para cargar peers al montar
  useEffect(() => {
    if (credentials && !wgState.wgLoadedRef.current) {
      wgState.wgLoadedRef.current = true;
      loadWgPeers();
    }
  }, [credentials, loadWgPeers]);
  
  return { loadWgPeers, savePeerColor, savePeerName, copyWgConfig };
}
```

### 7. **useToasts.ts** (~20 líneas)
**Sistema de notificaciones**

```typescript
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const addToast = useCallback((text: string, type: Toast['type'] = 'warn') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5500);
  }, []);
  
  return { toasts, setToasts, addToast };
}
```

### 8. **useServerSettings.ts** (~25 líneas)
**Configuración del servidor**

```typescript
export function useServerSettings() {
  const [globalServerIP, setGlobalServerIP] = useState(() => 
    localStorage.getItem('server_public_ip') || ''
  );
  const [editingGlobalIP, setEditingGlobalIP] = useState(false);
  const [serverPublicKey, setServerPublicKey] = useState('');
  const [serverListenPort, setServerListenPort] = useState('');
  const [serverEndpointIP, setServerEndpointIP] = useState(() => 
    localStorage.getItem('wg_endpoint_ip') || ''
  );
  
  // useEffect para cargar IP del servidor
  useEffect(() => {
    apiFetch(`${API_BASE_URL}/api/settings/get`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.settings?.server_public_ip) {
          const ip = d.settings.server_public_ip;
          setGlobalServerIP(ip);
          localStorage.setItem('server_public_ip', ip);
        }
      })
      .catch(() => { });
  }, []);
  
  return {
    globalServerIP, setGlobalServerIP, editingGlobalIP, setEditingGlobalIP,
    serverPublicKey, setServerPublicKey, serverListenPort, setServerListenPort,
    serverEndpointIP, setServerEndpointIP
  };
}
```

---

## 🔄 FLUJO EN NodeAccessPanel.tsx

```typescript
export default function NodeAccessPanel() {
  // Hooks
  const { credentials, adminIP, deactivateAllNodes, removeNodeFromState, isReady } = useVpn();
  const nodeState = useNodeState();
  const nodeModals = useNodeModals();
  const { nodeTags, saveNodeTags } = useNodeTags();
  const { fetchNodes, handleLoadNodes, silentPoll } = useNodeFetching(nodeState);
  const wgState = useWireGuardState();
  const { loadWgPeers, savePeerColor, savePeerName, copyWgConfig } = useWireGuardPeers(wgState);
  const { toasts, addToast } = useToasts();
  const serverSettings = useServerSettings();
  
  // Efectos que orquestan los hooks
  useEffect(() => {
    // Polling cuando hay nodos cargados
  }, [nodeState.hasLoaded, nodeState.pollingRef, silentPoll]);
  
  useEffect(() => {
    // Auto-sync al montar
  }, [isReady, credentials, fetchNodes]);
  
  useEffect(() => {
    // Alerta de renovación
  }, [nodeState.tunnelExpiry]);
  
  // Lógica adicional que requiere múltiples hooks
  const connectedNodes = nodeState.nodes.filter(n => n.running);
  const vpsPeer = wgState.wgPeers.find(p => p.allowedAddress === VPS_IP);
  
  // Render JSX
  return (
    <div className="space-y-5">
      {/* Header, tablas, modales, etc. */}
    </div>
  );
}
```

---

## 📂 ESTRUCTURA FINAL

```
NodeAccessPanel/
├── NodeAccessPanel.tsx         ✅ Componente Principal (~150 líneas)
├── index.ts                    ✅ Barrel export
│
├── hooks/                       ✅ Custom hooks (~315 líneas total)
│   ├── useNodeState.ts
│   ├── useNodeModals.ts
│   ├── useNodeFetching.ts
│   ├── useNodeTags.ts
│   ├── useWireGuardState.ts
│   ├── useWireGuardPeers.ts
│   ├── useToasts.ts
│   ├── useServerSettings.ts
│   └── index.ts
│
├── modals/                      ✅ (ya exists)
├── components/                  ✅ (ya exists)
└── utils/                       ✅ (ya exists)
```

---

## ✨ BENEFICIOS

✅ **Modularidad**: Cada hook tiene una responsabilidad única  
✅ **Reutilización**: Los hooks pueden usarse en otros componentes  
✅ **Mantenimiento**: Fácil de entender y modificar  
✅ **Testing**: Cada hook puede testearse independientemente  
✅ **Escalabilidad**: Fácil agregar nuevos hooks  
✅ **Código Original**: 100% preservado, solo reorganizado  

---

## 🚀 Próximos Pasos

1. ✅ Crear `/hooks` folder
2. ✅ Extraer cada hook del NodeAccessPanel.tsx original
3. ✅ Crear `hooks/index.ts` con barrel exports
4. ✅ Actualizar NodeAccessPanel.tsx para importar los hooks
5. ✅ Verificar compilación sin errores

