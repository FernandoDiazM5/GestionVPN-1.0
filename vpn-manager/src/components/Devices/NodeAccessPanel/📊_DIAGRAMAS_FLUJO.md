# 📊 Diagramas de Flujo - NodeAccessPanel

Visualización completa de cómo fluyen los datos y las interacciones en NodeAccessPanel.tsx

---

## 1️⃣ ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────────┐
│                    APLICACIÓN REACT                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
        ┌───────▼──────┐        ┌──────▼──────┐
        │ VPN Context  │        │  deviceDb   │
        │              │        │  cpeCache   │
        │ • nodes      │        │             │
        │ • creds      │        │  (Storage)  │
        │ • tunnel     │        │             │
        └───────┬──────┘        └─────────────┘
                │
                │ useVpn()
                │
        ┌───────▼──────────────────────────────┐
        │   NodeAccessPanel.tsx (836 líneas)   │
        │                                      │
        │  ┌──────────────────────────────┐   │
        │  │  8 Custom Hooks (600 líneas) │   │
        │  │                              │   │
        │  │  1. useToasts                │   │
        │  │  2. useNodeModals            │   │
        │  │  3. useNodeTags              │   │
        │  │  4. useServerSettings        │   │
        │  │  5. useWireGuardState        │   │
        │  │  6. useNodeState             │   │
        │  │  7. useNodeFetching          │   │
        │  │  8. useWireGuardPeers        │   │
        │  └──────────────────────────────┘   │
        │                                      │
        │  ┌──────────────────────────────┐   │
        │  │  Handlers & Computations     │   │
        │  │                              │   │
        │  │  • exportCsv()               │   │
        │  │  • handleRevokeAll()         │   │
        │  │  • PEER_COLOR_PALETTE        │   │
        │  └──────────────────────────────┘   │
        │                                      │
        │  ┌──────────────────────────────┐   │
        │  │  Renderizado (JSX)           │   │
        │  │                              │   │
        │  │  • Barra de control          │   │
        │  │  • Listado de nodos          │   │
        │  │  • Panel WireGuard           │   │
        │  │  • 8 Modales                 │   │
        │  │  • Notificaciones            │   │
        │  └──────────────────────────────┘   │
        └───────┬──────────────────────────────┘
                │
        ┌───────┴─────────────────────┐
        │                             │
    ┌───▼────────┐           ┌──────▼──────┐
    │ REST APIs  │           │ User Events │
    │            │           │             │
    │ /api/nodes │           │ • clicks    │
    │ /api/wg/*  │           │ • changes   │
    │ /api/node/*│           │ • inputs    │
    └────────────┘           └─────────────┘
```

---

## 2️⃣ INICIALIZACIÓN DE HOOKS

```
┌─────────────────────────────────────┐
│  NodeAccessPanel() - Línea 66      │
└──────────────┬──────────────────────┘
               │
        ┌──────▼──────────────────────────┐
        │  useVpn() - Línea 67-68         │
        │  Obtener context global         │
        └──────┬───────────────────────────┘
               │
        ┌──────┴─────────────────────────────────┐
        │  Inicializar 8 Hooks (Líneas 71-128)  │
        │                                       │
        │  ┌─ useToasts (71)                   │
        │  │  └─ Estado de notificaciones      │
        │  │                                   │
        │  ┌─ useNodeModals (72)               │
        │  │  └─ Estado de 8 modales           │
        │  │                                   │
        │  ┌─ useNodeTags (73)                 │
        │  │  └─ Cargar tags al montar         │
        │  │                                   │
        │  ┌─ useServerSettings (74)           │
        │  │  └─ Cargar config servidor        │
        │  │                                   │
        │  ┌─ useWireGuardState (75)           │
        │  │  └─ Inicializar estado WG         │
        │  │                                   │
        │  ├─ useNodeState (76)                │
        │  │  └─ Ref a context + nuevo estado  │
        │  │                                   │
        │  ├─ useNodeFetching (93-106)         │
        │  │  ├─ useEffect: auto-sync (2s)    │
        │  │  ├─ useEffect: polling (60s)     │
        │  │  └─ useEffect: renovación        │
        │  │                                   │
        │  └─ useWireGuardPeers (108-128)     │
        │     └─ useEffect: cargar peers       │
        │                                       │
        └──────────┬────────────────────────────┘
                   │
            ┌──────▼──────────┐
            │ Componente Listo│
            │   para renderizar
            └─────────────────┘
```

---

## 3️⃣ FLUJO DE OBTENCIÓN DE NODOS

```
┌─────────────────────────────────────────┐
│  Usuario llega a la página              │
└────────────┬────────────────────────────┘
             │
    ┌────────▼──────────────┐
    │ Componente se monta   │
    └────────┬───────────────┘
             │
    ┌────────▼──────────────────────────┐
    │ useNodeFetching init (Línea 93)   │
    │                                   │
    │ useEffect 1: Auto-sync (2s)      │
    │  ├─ Espera 2 segundos             │
    │  ├─ fetchNodes() → API call       │
    │  ├─ setNodes(data)                │
    │  └─ setHasLoaded(true)            │
    └────────┬───────────────────────────┘
             │
    ┌────────▼──────────────────────────┐
    │ useEffect 2: Init Polling         │
    │                                   │
    │ Cada 60 segundos:                 │
    │  ├─ silentPoll() ejecuta           │
    │  │  ├─ fetchNodes() → API call     │
    │  │  ├─ Detecta cambios:            │
    │  │  │  ├─ Desconexiones           │
    │  │  │  └─ Reconexiones            │
    │  │  ├─ setNodes(updated)           │
    │  │  └─ addToast() si hay cambios  │
    │  └─ LOG en historial              │
    └────────────────────────────────────┘
             │
    ┌────────▼──────────────────────────┐
    │ useEffect 3: Renewal Alert        │
    │                                   │
    │ Cada 10 segundos:                 │
    │  ├─ Si tunnelExpiry < 2min       │
    │  │  └─ setShowRenewalWarn(true)  │
    │  └─ Mostrar warning en UI         │
    └────────────────────────────────────┘
```

---

## 4️⃣ FLUJO DE INTERACCIÓN DE USUARIO

```
┌─────────────────────────────────────────┐
│  USUARIO INTERACTÚA CON LA UI           │
└─────────────────────────────────────────┘
            │
        ┌───┴─────────────────────────────────┐
        │                                     │
    ┌───▼────────────┐            ┌──────────▼─────────┐
    │ Filtrar/Buscar │            │ Click en Nodo      │
    │                │            │                    │
    │ setSearch()    │            ├─ Editar           │
    │                │            │ setEditNode()      │
    │ setSortMode()  │            │ EditarNodo modal   │
    │                │            │                    │
    │ (Local solo)   │            ├─ Eliminar         │
    │                │            │ setDeleteNode()    │
    └────────────────┘            │ EliminarNodo modal │
                                   │                    │
                                   ├─ Ver historial    │
                                   │ setHistoryNode()   │
                                   │ HistoryModal       │
                                   │                    │
                                   ├─ Tags             │
                                   │ setTagNode()       │
                                   │ TagModal           │
                                   │                    │
                                   └────────────────────┘
                                           │
                                   ┌───────▼────────┐
                                   │ Modal abierto  │
                                   │ (Línea 54+)    │
                                   │                │
                                   │ User completa  │
                                   │ y hace submit  │
                                   └───────┬────────┘
                                           │
                                   ┌───────▼────────┐
                                   │ API Call       │
                                   │ (async)        │
                                   │                │
                                   │ POST /api/node │
                                   │ POST /api/wg/* │
                                   └───────┬────────┘
                                           │
                        ┌──────────────────┼──────────────────┐
                        │                  │                  │
                    ┌───▼────┐      ┌──────▼──┐      ┌───────▼──┐
                    │ Success │      │ Error  │      │ Loading  │
                    │         │      │        │      │          │
                    │setNodes │      │addToast│      │setLoading│
                    │(updated)│      │(error) │      │(false)   │
                    │         │      │        │      │          │
                    │addToast │      │setState│      │ Spinner  │
                    │(success)│      │reset  │      │ UI       │
                    │         │      │        │      │          │
                    │Modal    │      │Modal  │      │Promise   │
                    │cierra   │      │sigue  │      │pending   │
                    └─────────┘      └────────┘      └──────────┘
```

---

## 5️⃣ FLUJO DE OPERACIONES WIREGUARD

```
┌────────────────────────────────────────┐
│  USUARIO ACCIONA WIREEGUARD            │
└────────────┬─────────────────────────────┘
             │
        ┌────┴──────────────────────────────────┐
        │                                       │
    ┌───▼──────────────┐         ┌────────────▼─────┐
    │ Agregar Admin    │         │ Editar Peer      │
    │                  │         │                  │
    │setShowNuevoAdmin │         │clickPeer         │
    │NuevoAdmin modal  │         │setEditingPeerId  │
    │                  │         │setColorPickerAddr│
    │                  │         │setEditingPeerName│
    └─────┬────────────┘         └────────┬─────────┘
          │                               │
          │                       ┌───────┴────────┐
          │                       │                │
          │                   ┌───▼────┐      ┌───▼────┐
          │                   │ Color  │      │ Nombre │
          │                   │        │      │        │
          │                   │select  │      │edit    │
          │                   │color   │      │text    │
          │                   │        │      │        │
          │                   └───┬────┘      └───┬────┘
          │                       │              │
          │                  ┌────▼──────────────▼─┐
          │                  │  Guardar cambios    │
          │                  │                     │
          │                  │ savePeerColor()     │
          │                  │ savePeerName()      │
          │                  │                     │
          │                  │ await API call      │
          │                  │                     │
          │                  │ setPeerColors()     │
          │                  │ setWgPeers()        │
          │                  │ addToast(success)   │
          │                  └─────────────────────┘
          │
    ┌─────▼────────────────────────────────┐
    │ loadWgPeers() (Línea 108-128)        │
    │                                      │
    │ useEffect: Al montar                │
    │  ├─ fetchWithTimeout(...) API call  │
    │  ├─ Parsear response                │
    │  ├─ setWgPeers(data)                │
    │  ├─ setPeerColors(colores)          │
    │  ├─ setServerPublicKey(key)         │
    │  ├─ setServerListenPort(port)       │
    │  └─ setServerEndpointIP(ip)         │
    │                                      │
    │ copyWgConfig() al hacer click       │
    │  ├─ buildConfigString()             │
    │  ├─ navigator.clipboard.write()     │
    │  ├─ setCopiedPeerId(addr)           │
    │  ├─ Mostrar checkmark               │
    │  └─ Auto-limpiar después 2s         │
    └────────────────────────────────────┘
```

---

## 6️⃣ FLUJO DE DATOS ESTADO

```
┌──────────────────────────────────────────┐
│  8 CUSTOM HOOKS - GESTIÓN DE ESTADO      │
└──────────────────┬───────────────────────┘
                   │
        ┌──────────┴───────────┐
        │                      │
   ┌────▼─────────┐     ┌──────▼──────────┐
   │ Hooks Simples│     │ Hooks Complejos │
   │ (Estado)     │     │ (Lógica + API)  │
   │              │     │                 │
   │useToasts     │     │useNodeFetching  │
   │useNodeModals │     │useWireGuardPeers│
   │useNodeTags   │     │                 │
   │useServerS.   │     │ Incluyen:       │
   │useWgState    │     │ • callbacks     │
   │useNodeState  │     │ • useEffect     │
   │              │     │ • async ops    │
   │              │     │ • API calls     │
   │              │     │ • error handle  │
   └──────────────┘     └─────────────────┘
          │                      │
          │      ┌───────────────┘
          │      │
          └──────┴─────────────────────┐
                                       │
                          ┌────────────▼──────────┐
                          │  COMPONENT STATE      │
                          │                       │
                          │ Línea 78-88:          │
                          │ Extraer valores para  │
                          │ compatibilidad JSX    │
                          │                       │
                          │ const {               │
                          │   isLoading,          │
                          │   hasLoaded,          │
                          │   errorMsg,           │
                          │   search,             │
                          │   sortMode,           │
                          │   ...                 │
                          │ } = nodeState;        │
                          │                       │
                          └────────────┬──────────┘
                                       │
                          ┌────────────▼──────────┐
                          │  JSX RENDERIZADO      │
                          │                       │
                          │ Usa todas las         │
                          │ variables de estado   │
                          │ extraídas             │
                          │                       │
                          │ Props → Modales       │
                          │ Visibilidad condicional
                          │ Renderizado dinámico  │
                          └───────────────────────┘
```

---

## 7️⃣ FLUJO DE NOTIFICACIONES

```
┌──────────────────────────────────────┐
│  TOAST NOTIFICATIONS (useToasts)     │
└────────────┬────────────────────────┘
             │
        ┌────▼──────────────────────┐
        │ addToast(text, type)      │
        │                           │
        │ type: 'info' | 'warn'    │
        └────┬──────────────────────┘
             │
        ┌────▼──────────────────────┐
        │ Crear toast en array      │
        │                           │
        │ toasts.push({             │
        │   id: unique,             │
        │   text: text,             │
        │   type: type,             │
        │   timestamp: Date.now()   │
        │ })                        │
        └────┬──────────────────────┘
             │
        ┌────▼──────────────────────┐
        │ Auto-remover después X ms │
        │ (típicamente 5-7 segundos)│
        │                           │
        │ setTimeout(() => {        │
        │   remover del array       │
        │ }, 5000)                  │
        └────────────────────────────┘
             │
        ┌────▼──────────────────────┐
        │ Renderizar en UI          │
        │                           │
        │ {toasts.map(t =>          │
        │   <Toast key={t.id} ...   │
        │ }                         │
        └────────────────────────────┘
```

---

## 8️⃣ CICLO DE VIDA COMPLETO

```
┌────────────────────────────────────────────────────────┐
│                   MOUNT (Componente se crea)           │
└────────────┬────────────────────────────────────────────┘
             │
    ┌────────▼────────────────────────────────┐
    │ 1. Inicializar context (useVpn)         │
    │ 2. Inicializar 8 hooks                  │
    │ 3. Extraer valores para JSX             │
    │ 4. Crear handlers (exportCsv, etc)      │
    │ 5. Renderizado inicial                  │
    └────────┬─────────────────────────────────┘
             │
    ┌────────▼────────────────────────────────┐
    │          UPDATE - DURANTE SESIÓN         │
    │                                         │
    │ Polling cada 60s                        │
    │  → fetchNodes()                         │
    │  → Actualizar UI si hay cambios        │
    │                                         │
    │ User interactions                       │
    │  → Modales                              │
    │  → API calls                            │
    │  → setState updates                     │
    │                                         │
    │ Cambios en URL/params                   │
    │  → Re-render si aplica                  │
    └────────┬─────────────────────────────────┘
             │
    ┌────────▼────────────────────────────────┐
    │        UNMOUNT (Componente se destruye) │
    │                                         │
    │ 1. Limpiar polling                      │
    │    clearInterval(pollingRef.current)    │
    │                                         │
    │ 2. Limpiar timeouts                     │
    │    clearTimeout(...)                    │
    │                                         │
    │ 3. Limpiar refs                         │
    │    wgLoadedRef, prevRunningRef          │
    │                                         │
    │ 4. Liberar memory                       │
    └────────────────────────────────────────┘
```

---

## 9️⃣ DIAGRAMA DE RESPONSABILIDADES

```
┌──────────────────────────────────────────────────────────────┐
│                   NodeAccessPanel.tsx                        │
│                      (Orquestador)                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ CAPA DE ESTADO (8 Custom Hooks)                        │ │
│  │                                                        │ │
│  │ ┌─────────────┐  ┌─────────────┐  ┌────────────────┐ │ │
│  │ │ useToasts   │  │useNodeModals│  │useWireGuardS.  │ │ │
│  │ │ (1)         │  │ (2)         │  │ (5)            │ │ │
│  │ └─────────────┘  └─────────────┘  └────────────────┘ │ │
│  │                                                        │ │
│  │ ┌─────────────┐  ┌─────────────┐  ┌────────────────┐ │ │
│  │ │useNodeTags  │  │useServerS.  │  │useNodeState    │ │ │
│  │ │ (3)         │  │ (4)         │  │ (6)            │ │ │
│  │ └─────────────┘  └─────────────┘  └────────────────┘ │ │
│  │                                                        │ │
│  │ ┌──────────────────────┐  ┌──────────────────────┐  │ │
│  │ │useNodeFetching (7)   │  │useWireGuardPeers (8) │  │ │
│  │ │ • fetchNodes()       │  │ • loadWgPeers()      │  │ │
│  │ │ • handleLoadNodes()  │  │ • savePeerColor()    │  │ │
│  │ │ • silentPoll()       │  │ • savePeerName()     │  │ │
│  │ │ • 3 useEffect        │  │ • copyWgConfig()     │  │ │
│  │ │ • 2+ API calls       │  │ • 1 useEffect        │  │ │
│  │ └──────────────────────┘  └──────────────────────┘  │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ▲                                 │
│                            │ Obtener valores                │
│                            │ Inicializar                    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ CAPA DE LÓGICA (Handlers & Computations)              │ │
│  │                                                        │ │
│  │ • exportCsv()                                          │ │
│  │ • handleRevokeAll()                                    │ │
│  │ • PEER_COLOR_PALETTE (constante)                       │ │
│  │ • Extracciones de valores (líneas 78-88)              │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ▲                                 │
│                            │ Usar en JSX                    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ CAPA DE PRESENTACIÓN (JSX)                             │ │
│  │                                                        │ │
│  │ • Barra de control + filtros                           │ │
│  │ • Indicadores de estado                                │ │
│  │ • Listado de NodeCards                                 │ │
│  │ • Panel WireGuard                                      │ │
│  │ • 8 Modales condicionales                              │ │
│  │ • Toast notifications                                  │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ▲                                 │
│                            │ Eventos de usuario             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
        ┌───────▼─────────┐   ┌─────────▼──────┐
        │  REST APIs      │   │  Context       │
        │                 │   │                │
        │ /api/nodes      │   │ setNodes()     │
        │ /api/wg/*       │   │ setTunnelExpiry│
        │ /api/node/*     │   │ etc.           │
        │                 │   │                │
        └─────────────────┘   └────────────────┘
```

---

## 🔟 EJEMPLO COMPLETO: "Crear y editar un nodo"

```
Usuario hace click "Nuevo Nodo"
│
├─ setShowNuevoNodo(true)
│
├─ NuevoNodo modal aparece
│
├─ User llena formulario
│  ├─ nombre_nodo: "Oficina Principal"
│  ├─ lan_subnets: ["10.0.0.0/24"]
│  └─ ... otros campos
│
├─ User hace submit
│
├─ API POST /api/node/create
│  └─ Body: { nombre_nodo, lan_subnets, ... }
│
├─ Response: { success: true, nodeId, ... }
│
├─ fetchNodes() → Obtener lista actualizada
│  ├─ setNodes(newList)
│  ├─ addToast("Nodo creado", "info")
│  └─ setShowNuevoNodo(false)
│
├─ Modal se cierra
│
├─ NodeCard aparece en lista
│
├─ Polling detecta cambio en siguiente iteración
│  └─ silentPoll() cada 60s
│
├─ User quiere editar el nodo
│  ├─ Click en NodeCard → "Editar"
│  ├─ setEditNode(nodoObject)
│  └─ EditarNodo modal abre
│
├─ EditarNodo modal
│  ├─ Pre-rellena campos con datos actuales
│  ├─ User modifica campos
│  └─ Click "Guardar"
│
├─ API POST /api/node/update
│  └─ Body: { nodeId, ...changedFields }
│
├─ Response: { success: true, ... }
│
├─ fetchNodes() → Obtener lista actualizada
│  ├─ setNodes(newList) ← NodeCard se actualiza
│  ├─ addToast("Nodo actualizado", "info")
│  └─ setEditNode(null) ← Modal se cierra
│
└─ FIN: Nodo visible actualizado en UI
```

---

**Última actualización**: 2026-05-30  
**Objetivo**: Ayudar a entender visualmente cómo fluyen datos y eventos

