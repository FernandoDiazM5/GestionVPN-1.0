# 🎯 PLAN DE DESCOMPOSICIÓN - NodeAccessPanel

**Objetivo**: Dividir NodeAccessPanel.tsx (836 líneas) en componentes más pequeños  
**Restricción**: SIN cambiar el código, solo reorganizándolo  
**Beneficio**: Mejor mantenimiento y legibilidad

---

## 📊 ANÁLISIS ACTUAL

**NodeAccessPanel.tsx**: 836 líneas
├─ Imports: ~50 líneas
├─ CountdownDisplay (componente): ~10 líneas  
├─ NodeAccessPanel (componente principal): ~776 líneas
│  ├─ Inicialización de hooks: ~60 líneas
│  ├─ Handlers: ~20 líneas
│  ├─ Computaciones: ~30 líneas
│  └─ JSX/Renderizado: ~666 líneas

---

## 🔍 SECCIONES IDENTIFICADAS EN JSX

Analizando el return JSX, se pueden identificar estas secciones:

1. **Barra de Control Superior** (~80 líneas JSX)
   - Campo de búsqueda
   - Select de ordenamiento
   - Botón de nuevo nodo
   - Botón de exportar CSV
   - Botón de revocar todos

2. **Indicadores de Estado** (~40 líneas JSX)
   - Error messages
   - Renewal warnings
   - Loading spinners

3. **Listado de Nodos** (~150 líneas JSX)
   - Tabla/cards de nodos
   - Aplicar filtro de búsqueda
   - Aplicar ordenamiento
   - Interacciones (click handlers)

4. **Sección WireGuard** (~300 líneas JSX)
   - Configuración del servidor (IP, puerto, clave)
   - Lista de peers
   - Botones de administrador
   - Tabla expandible de peers

5. **Modales Condicionales** (~50 líneas JSX)
   - 8 modales que se renderizan según estado

6. **Toast Notifications** (~10 líneas JSX)
   - Notificaciones flotantes

---

## 📂 ESTRUCTURA PROPUESTA

```
NodeAccessPanel/
├── NodeAccessPanel.tsx              (ORQUESTADOR - ~100 líneas)
│   └── Imports, hooks, handlers, y renderizado de componentes
│
├── components/
│   ├── index.ts                    (Barrel export)
│   │
│   ├── sections/
│   │   ├── index.ts
│   │   ├── ControlBar.tsx          (~80 líneas) - Barra de control
│   │   ├── StateIndicators.tsx     (~40 líneas) - Errores, warnings, loading
│   │   ├── NodesListSection.tsx    (~150 líneas) - Tabla de nodos
│   │   └── WireGuardSection.tsx    (~300 líneas) - Config + peers
│   │
│   ├── modals/                     (YA EXISTE - Sin cambios)
│   │   └── (8 modales)
│   │
│   └── shared/
│       ├── CountdownDisplay.tsx    (~10 líneas) - Extraído de NodeAccessPanel
│       └── index.ts
│
├── hooks/                          (YA EXISTE - Sin cambios)
│   └── (8 hooks)
│
├── utils/                          (YA EXISTE - Sin cambios)
│   └── (utilidades)
│
└── README.md, documentación
```

---

## 🎯 COMPONENTES A CREAR

### 1. **ControlBar.tsx** (~80 líneas)
**Responsabilidad**: Controles superiores

**Props**:
```typescript
interface ControlBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortMode: 'default' | 'connected' | 'disconnected';
  onSortChange: (mode: 'default' | 'connected' | 'disconnected') => void;
  onNewNode: () => void;
  onExportCsv: () => void;
  onRevokeAll: () => void;
  isRevoking: boolean;
}
```

**Contenido JSX**:
- Input de búsqueda
- Select de ordenamiento
- Botones (Nuevo, Exportar, Revocar todos)

**Ubicación JSX actual**: Líneas ~150-200 (aprox)

---

### 2. **StateIndicators.tsx** (~40 líneas)
**Responsabilidad**: Mostrar estado de la app

**Props**:
```typescript
interface StateIndicatorsProps {
  isLoading: boolean;
  errorMsg: string;
  showRenewalWarn: boolean;
  tunnelExpiry: number | null;
}
```

**Contenido JSX**:
- Loading spinner
- Error messages
- Renewal warning + countdown

**Ubicación JSX actual**: Líneas ~200-240 (aprox)

---

### 3. **NodesListSection.tsx** (~150 líneas)
**Responsabilidad**: Mostrar lista/tabla de nodos

**Props**:
```typescript
interface NodesListSectionProps {
  nodes: NodeInfo[];
  search: string;
  sortMode: 'default' | 'connected' | 'disconnected';
  nodeTags: Record<string, string[]>;
  onEditNode: (node: NodeInfo) => void;
  onDeleteNode: (node: NodeInfo) => void;
  onScriptNode: (node: NodeInfo) => void;
  onHistoryNode: (node: NodeInfo) => void;
  onTagNode: (node: NodeInfo) => void;
}
```

**Contenido JSX**:
- NodeCard por cada nodo (o tabla)
- Aplicar filtro search
- Aplicar ordenamiento sortMode
- Manejadores de eventos

**Ubicación JSX actual**: Líneas ~240-390 (aprox)

---

### 4. **WireGuardSection.tsx** (~300 líneas)
**Responsabilidad**: Todo lo relacionado con WireGuard

**Props**:
```typescript
interface WireGuardSectionProps {
  // Configuración del servidor
  globalServerIP: string;
  editingGlobalIP: boolean;
  serverPublicKey: string;
  serverListenPort: string;
  serverEndpointIP: string;
  
  // Handlers
  onGlobalIPChange: (ip: string) => void;
  onSaveGlobalIP: () => void;
  
  // Peers
  wgPeers: WgPeer[];
  loadingWg: boolean;
  wgError: string;
  peerColors: Record<string, string>;
  
  // Handlers para peers
  onAddAdmin: () => void;
  onEditPeer: (peerId: string) => void;
  onColorPeer: (peerId: string, color: string) => void;
  onNamePeer: (peerId: string, newName: string) => void;
  onCopyConfig: (peerId: string) => void;
  
  // Estados de UI
  peersExpanded: boolean;
  onTogglePeersExpanded: () => void;
  showNuevoAdmin: boolean;
  onShowNuevoAdmin: (show: boolean) => void;
}
```

**Contenido JSX**:
- Sección de configuración del servidor
- Tabla/lista de peers
- Botones de administrador
- Estados y errores

**Ubicación JSX actual**: Líneas ~390-700 (aprox)

---

### 5. **CountdownDisplay.tsx** (~10 líneas) - EXTRAÍDO
**Ya existe en NodeAccessPanel.tsx líneas 55-64**

**Mover a**: `src/components/Devices/NodeAccessPanel/components/shared/CountdownDisplay.tsx`

---

## 🔄 FLUJO DE COMUNICACIÓN

```
NodeAccessPanel.tsx (ORQUESTADOR)
    │
    ├─ Inicializa 8 hooks
    ├─ Calcula estado computado
    ├─ Define handlers
    │
    └─ Renderiza:
        ├─ StateIndicators (props: isLoading, error, warning)
        ├─ ControlBar (props: search, sort, handlers)
        ├─ NodesListSection (props: nodes, search, sort, handlers)
        ├─ WireGuardSection (props: wgState, handlers)
        ├─ 8 Modales (props: states + handlers)
        └─ Toast Notifications (props: toasts)
```

---

## ✅ GARANTÍAS

- ✅ **SIN cambios de código**: Código idéntico, solo reorganizado
- ✅ **Misma funcionalidad**: 100% idéntica
- ✅ **Misma performance**: No hay overhead
- ✅ **TypeScript**: Todos los tipos correctos
- ✅ **Compilación**: 0 errores
- ✅ **Runtime**: Funcionamiento exacto

---

## 📐 ESTADÍSTICAS ESPERADAS

**ANTES**:
```
NodeAccessPanel.tsx: 836 líneas
├─ Imports: 50
├─ Lógica: 120
└─ JSX: 666
```

**DESPUÉS**:
```
NodeAccessPanel.tsx: ~100 líneas
├─ Imports: 20
├─ Hooks: 30
├─ Handlers: 20
└─ Renderizado de componentes: 30

+ ControlBar.tsx: ~80 líneas
+ StateIndicators.tsx: ~40 líneas
+ NodesListSection.tsx: ~150 líneas
+ WireGuardSection.tsx: ~300 líneas
+ CountdownDisplay.tsx: ~10 líneas

TOTAL: ~680 líneas distribuidas
(Menos imports duplicados)
```

---

## 🚀 BENEFICIOS

1. **Legibilidad**: Cada archivo ~100 líneas (vs 836)
2. **Mantenimiento**: Cambios locales sin afectar otros
3. **Testing**: Componentes reutilizables y testables
4. **Reutilización**: Componentes usables en otras vistas
5. **Performance**: Sin cambios (mismo patrón React)
6. **Escalabilidad**: Fácil agregar nuevas features

---

## ⚠️ NOTAS IMPORTANTES

1. **Props interfaces**: Crear interfaces claras
2. **Barrel exports**: Usar index.ts en cada carpeta
3. **Imports**: Actualizar paths correctamente
4. **Context**: Los hooks ya traen todo lo necesario
5. **No crear duplicados**: Usar props, no re-llamar hooks

---

**Estado**: Plan listo para implementación  
**Próximo paso**: Aplicar descomposición mantiendo código intacto
