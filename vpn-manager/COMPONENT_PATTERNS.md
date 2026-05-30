# 🏗️ Patrones de Componentes Modularizados

**Versión**: 1.0  
**Última actualización**: 2026-05-30  
**Aplicable a**: React + TypeScript projects

---

## 📌 Introducción

Este documento establece los patrones estándar para crear componentes modularizados en este proyecto. El objetivo es mantener consistencia en la estructura de componentes complejos y facilitar su mantenimiento.

**Patrón base**: `ApMonitorModule` (mejor ejemplo en el proyecto)

---

## 🎯 Estructura Estándar de un Módulo Complejo

### Estructura Base
```
ComponentName/
├── ComponentName.tsx           # Componente principal (orquestador)
├── index.ts                    # Barrel export (re-exporta todo)
├── types.ts                    # Interfaces y tipos TypeScript
├── constants.ts                # Constantes y valores por defecto
├── components/                 # Subcomponentes UI
│   ├── SubComponent1.tsx
│   ├── SubComponent2.tsx
│   ├── modals/                 # Modales específicos
│   │   ├── Modal1.tsx
│   │   └── Modal2.tsx
│   ├── selectors/              # Componentes selectores
│   │   ├── Selector1.tsx
│   │   └── Selector2.tsx
│   └── index.ts                # Barrel export de componentes
├── hooks/                      # Custom hooks especializados
│   ├── useLogic1.ts
│   ├── useLogic2.ts
│   └── index.ts                # Barrel export de hooks
├── utils/                      # Funciones de utilidad
│   ├── helpers1.ts
│   ├── helpers2.ts
│   ├── formatters.ts           # Funciones de formato
│   ├── colors.ts               # Utilidades de colores
│   └── index.ts                # Barrel export de utils
└── README.md                   # Documentación del módulo (opcional)
```

---

## 📄 Desglose de Archivos

### 1. **ComponentName.tsx** (Archivo Principal)

**Responsabilidad**: Orquestar la lógica y renderizar la estructura general.

**Características**:
- Importa custom hooks para lógica
- Importa subcomponentes
- Maneja estado global (useVpn, etc.)
- Coordina flujos de datos
- ~300-400 líneas máximo

**Ejemplo Real** (`ApMonitorModule.tsx`):
```typescript
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { useVpn } from '../../../context/VpnContext';
import type { SavedDevice } from '../../../types/devices';

import ApGroupCard from './components/ApGroupCard';
import DeviceCardModal from './components/modals/DeviceCardModal';
import MoveToNodeModal from './components/modals/MoveToNodeModal';

import { useApMonitorLogic } from './hooks/useApMonitorLogic';
import { usePolling } from './hooks/usePolling';

export default function ApMonitorModule() {
  const { nodes, activeNodeVrf, tunnelExpiry } = useVpn();
  const logic = useApMonitorLogic(nodes, activeNodeName);
  const polling = usePolling(logic.devices, activeNodeName);

  // Estado local específico del módulo
  const [expandedAps, setExpandedAps] = useState<Set<string>>(new Set());

  // Efectos para sincronizar estado
  useEffect(() => {
    sessionStorage.setItem('apMonitorExpandedAps', JSON.stringify([...expandedAps]));
  }, [expandedAps]);

  // Render
  return (
    <div className="space-y-5">
      {/* Header y controles */}
      <div className="card p-6 flex items-center justify-between gap-4">
        {/* ... */}
      </div>

      {/* Lista de grupos */}
      {logic.filteredGroups.map(group => (
        <ApGroupCard key={group.nodeId} group={group} {...props} />
      ))}

      {/* Modales */}
      {logic.cpeDetailTarget && <CpeDetailModal {...} />}
      {logic.viewingApDevice && <DeviceCardModal {...} />}
    </div>
  );
}
```

**Patrón a seguir**:
1. Importar hooks personalizados primero
2. Importar subcomponentes después
3. Usar custom hooks para lógica compleja
4. Delegar rendering en subcomponentes
5. Mantener componente principal enfocado

---

### 2. **types.ts** (Definiciones de Tipos)

**Responsabilidad**: Centralizar todas las interfaces y tipos del módulo.

**Estructura**:
```typescript
// Datos del módulo
export interface ModuleData {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
}

// Props de componentes internos
export interface SubComponentProps {
  data: ModuleData;
  onAction: (id: string) => void;
  loading?: boolean;
}

// Estados internos específicos
export interface ModuleState {
  selectedId: string | null;
  filter: 'all' | 'active' | 'inactive';
  expandedItems: Set<string>;
}

// Resultados de operaciones
export interface OperationResult {
  success: boolean;
  message: string;
  data?: ModuleData;
}
```

**Ejemplo Real** (`ApMonitorModule/types.ts`):
```typescript
export interface NodeGroup {
  nodeId: string;
  nodeName: string;
  aps: SavedDevice[];
  activeApCount: number;
  errorApCount: number;
}

export interface CpeDetailTarget {
  mac: string;
  apId: string;
  ip: string;
  sshPort: number;
  sshUser: string;
  sshPass: string;
}

export interface PollResult {
  apId: string;
  polledAt: number;
  stations: StationData[];
  error?: string;
}
```

**Buenas prácticas**:
- Usar interfaces en lugar de tipos (mejor para extensión)
- Agrupar tipos relacionados
- Documentar tipos complejos con comentarios
- Exportar SOLO tipos que se usen fuera del módulo
- Tipos privados pueden quedar en archivos específicos

---

### 3. **constants.ts** (Valores Constantes)

**Responsabilidad**: Centralizar valores que no cambian.

**Incluye**:
- Labels y mensajes de UI
- Opciones de filtros
- Configuraciones por defecto
- Enumeraciones
- Constantes mágicas

**Ejemplo Real** (`ApMonitorModule/constants.ts`):
```typescript
export const MONITOR_LABELS = {
  TITLE: 'Monitor de APs',
  DESCRIPTION: 'Monitoreo en tiempo real de Access Points',
  NO_APS: 'Sin APs guardados',
  NO_TUNNEL: 'Sin túnel VPN activo',
} as const;

export const FILTER_OPTIONS = [
  { value: 'active', label: 'Activos', icon: 'CheckCircle2' },
  { value: 'inactive', label: 'Inactivos', icon: 'ZapOff' },
  { value: 'all', label: 'Todos', icon: 'Users' },
] as const;

export const POLL_INTERVALS = [
  { value: 0, label: 'Auto-poll Off' },
  { value: 15000, label: '15s' },
  { value: 30000, label: '30s' },
  { value: 60000, label: '1m' },
  { value: 120000, label: '2m' },
  { value: 300000, label: '5m' },
] as const;

export const STORAGE_KEYS = {
  EXPANDED_APS: 'apMonitorExpandedAps',
  POLL_INTERVAL: 'vpn_ap_poll_ms',
  COLUMN_PREFS: 'ap_monitor_cpe_cols',
} as const;
```

**Buenas prácticas**:
- Usar `as const` para inferencia de tipos
- Agrupar por categoría lógica
- Usar SCREAMING_SNAKE_CASE para constantes
- Documentar si no es evidente
- Mantener valores "mágicos" fuera del código

---

### 4. **hooks/** (Custom Hooks)

**Responsabilidad**: Encapsular lógica reutilizable y compleja.

#### 4a. **useLogic Hook** (Lógica Principal)

**Patrón**:
```typescript
// useApMonitorLogic.ts
import { useState, useCallback, useMemo } from 'react';
import type { SavedDevice, NodeGroup } from '../types';

interface UseApMonitorLogicReturn {
  devices: SavedDevice[];
  nodeGroups: NodeGroup[];
  filteredGroups: NodeGroup[];
  nodeFilter: 'active' | 'inactive' | 'all';
  apSearch: string;
  
  // Métodos
  loadDevices: () => Promise<void>;
  setNodeFilter: (f: 'active' | 'inactive' | 'all') => void;
  setApSearch: (s: string) => void;
  handleDeleteDev: (dev: SavedDevice) => Promise<void>;
}

export function useApMonitorLogic(
  nodes: Node[],
  activeNodeName: string | null
): UseApMonitorLogicReturn {
  const [devices, setDevices] = useState<SavedDevice[]>([]);
  const [nodeFilter, setNodeFilter] = useState<'active' | 'inactive' | 'all'>('all');
  const [apSearch, setApSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Agrupar dispositivos por nodo
  const nodeGroups = useMemo(() => {
    return devices
      .filter(d => d.role !== 'sta')
      .reduce((acc, dev) => {
        const existing = acc.find(g => g.nodeId === dev.nodeId);
        if (existing) {
          existing.aps.push(dev);
        } else {
          acc.push({
            nodeId: dev.nodeId,
            nodeName: dev.nodeName,
            aps: [dev],
            activeApCount: 0,
            errorApCount: 0,
          });
        }
        return acc;
      }, [] as NodeGroup[]);
  }, [devices]);

  // Filtrar por estado y búsqueda
  const filteredGroups = useMemo(() => {
    return nodeGroups.filter(group => {
      const matchesFilter = nodeFilter === 'all' || 
        (nodeFilter === 'active' && group.activeApCount > 0) ||
        (nodeFilter === 'inactive' && group.activeApCount === 0);
      
      const matchesSearch = apSearch === '' ||
        group.aps.some(ap => ap.nombre?.includes(apSearch));
      
      return matchesFilter && matchesSearch;
    });
  }, [nodeGroups, nodeFilter, apSearch]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      setDevices(data);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    devices,
    nodeGroups,
    filteredGroups,
    nodeFilter,
    apSearch,
    loadDevices,
    setNodeFilter,
    setApSearch,
    handleDeleteDev,
  };
}
```

**Patrón a seguir**:
- Centralizar lógica compleja en hooks
- Retornar objeto con toda la lógica necesaria
- Usar `useMemo` para cálculos costosos
- Usar `useCallback` para funciones que se pasen como props
- Documentar el retorno del hook

#### 4b. **usePolling Hook** (Lógica de Polling)

```typescript
export function usePolling(devices: SavedDevice[], nodeId: string | null) {
  const [pollResults, setPollResults] = useState<Record<string, PollResult>>({});
  const [pollInterval, setPollInterval] = useState(30000);
  const pollTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const pollApDirect = useCallback(async (apId: string, force = false) => {
    try {
      const res = await fetch(`/api/ap/poll/${apId}?force=${force}`);
      const data = await res.json();
      setPollResults(prev => ({ ...prev, [apId]: data }));
    } catch (err) {
      // Error handling
    }
  }, []);

  return {
    pollResults,
    pollInterval,
    pollTimers,
    pollApDirect,
    setPollInterval,
  };
}
```

**Buenas prácticas**:
- Un hook por responsabilidad bien definida
- Nombres descriptivos con prefijo `use`
- Retornar estado + funciones que lo modifican
- Usar refs para timers/intervals que no afecten render

#### 4c. **hook/index.ts** (Barrel Export)

```typescript
export { useApMonitorLogic } from './useApMonitorLogic';
export { usePolling } from './usePolling';
export { useColumnPrefs } from './useColumnPrefs';
```

---

### 5. **components/** (Subcomponentes)

**Responsabilidad**: UI renderizable.

**Reglas**:
- Componentes pequeños (~100-150 líneas)
- Props bien tipadas
- No deben contener lógica compleja
- Delegar efectos al componente padre

**Ejemplo** (`ApGroupCard.tsx`):
```typescript
import React from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import type { NodeGroup } from '../types';

interface ApGroupCardProps {
  group: NodeGroup;
  expanded: boolean;
  onToggle: () => void;
  onApClick: (ap: SavedDevice) => void;
}

export default function ApGroupCard({
  group,
  expanded,
  onToggle,
  onApClick,
}: ApGroupCardProps) {
  return (
    <div className="card">
      <button onClick={onToggle} className="flex items-center justify-between w-full p-4">
        <div>
          <h3 className="font-bold text-slate-800">{group.nodeName}</h3>
          <p className="text-sm text-slate-500">{group.aps.length} APs</p>
        </div>
        <ChevronDown 
          className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-4 space-y-2">
          {group.aps.map(ap => (
            <ApRow 
              key={ap.id}
              ap={ap}
              onClick={() => onApClick(ap)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Patrones**:
- Props como objeto destructurado
- Tipos exhaustivos de props
- Componentes funcionales
- Tailwind CSS para estilos
- Delegar eventos al padre

#### 5a. **components/modals/** (Modales)

Subcomponentes que renderizen en portales.

```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  data?: any;
}

export default function DeviceCardModal({
  isOpen,
  onClose,
  onConfirm,
  device,
}: ModalProps & { device: SavedDevice }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
        <h2 className="text-lg font-bold mb-4">{device.nombre}</h2>
        {/* Modal content */}
        <div className="flex gap-3 justify-end mt-6">
          <button onClick={onClose} className="btn btn-secondary">
            Cancelar
          </button>
          <button onClick={onConfirm} className="btn btn-primary">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
```

#### 5b. **components/index.ts** (Barrel Export)

```typescript
export { default as ApGroupCard } from './ApGroupCard';
export { default as ApRow } from './ApRow';
export { default as CpeRow } from './CpeRow';
export { default as StatCard } from './StatCard';

export { default as DeviceCardModal } from './modals/DeviceCardModal';
export { default as MoveToNodeModal } from './modals/MoveToNodeModal';
```

---

### 6. **utils/** (Funciones Utilitarias)

**Responsabilidad**: Funciones puras reutilizables.

#### 6a. **formatters.ts** (Formateo de datos)

```typescript
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

export function formatSignal(dbm: number): string {
  return `${dbm} dBm`;
}

export function formatSpeed(bps: number): string {
  const mbps = (bps / 1_000_000).toFixed(1);
  return `${mbps} Mbps`;
}
```

#### 6b. **colors.ts** (Utilidades de colores)

```typescript
export function getStatusColor(status: 'online' | 'offline' | 'error' | 'connecting') {
  const colors = {
    online: 'bg-emerald-500',
    offline: 'bg-slate-300',
    error: 'bg-red-500',
    connecting: 'bg-blue-500',
  };
  return colors[status];
}

export function getSignalColor(dbm: number): string {
  if (dbm >= -50) return 'text-emerald-600';
  if (dbm >= -70) return 'text-amber-600';
  return 'text-red-600';
}
```

#### 6c. **helpers.ts** (Funciones de negocio)

```typescript
export function groupDevicesByNode(devices: SavedDevice[]): NodeGroup[] {
  return devices.reduce((acc, dev) => {
    const node = acc.find(n => n.nodeId === dev.nodeId);
    if (node) node.aps.push(dev);
    else acc.push({ nodeId: dev.nodeId, aps: [dev] });
    return acc;
  }, [] as NodeGroup[]);
}

export function filterByStatus(
  devices: SavedDevice[],
  status: 'active' | 'inactive' | 'all'
): SavedDevice[] {
  if (status === 'all') return devices;
  return devices.filter(d => (d.active ? 'active' : 'inactive') === status);
}
```

#### 6d. **utils/index.ts** (Barrel Export)

```typescript
export * from './formatters';
export * from './colors';
export * from './helpers';
export { loadColPrefs, saveColPrefs, CPE_COL_DEFS } from './columnDefs';
```

---

### 7. **index.ts** (Barrel Export del Módulo)

**Responsabilidad**: Controlar qué se exporta públicamente.

```typescript
// src/components/Monitor/ApMonitorModule/index.ts
export { default } from './ApMonitorModule';
export type { NodeGroup, CpeDetailTarget, PollResult } from './types';
export { MONITOR_LABELS, FILTER_OPTIONS } from './constants';

// NO exportar:
// - Componentes internos (ApGroupCard, ApRow)
// - Hooks internos (useApMonitorLogic, usePolling)
// - Funciones de utils internas (a menos que sean muy útiles)
```

**Patrón**:
- Exportar componente principal como `default`
- Exportar tipos públicos por nombre
- Exportar constantes públicas
- NO exportar detalles de implementación interna

---

## 🔄 Flujo de Datos Recomendado

### Flujo Típico

```
ApMonitorModule (Main)
├── useApMonitorLogic()
│   ├── Carga devices desde API
│   ├── Agrupa por nodos
│   ├── Filtra por búsqueda/estado
│   └── Retorna estado + métodos
│
└── usePolling()
    ├── Mantiene pollResults
    ├── Controla timers
    └── Retorna estado + métodos

Render:
├── ApGroupCard (Subcomponentes)
│   ├── ApRow
│   └── CpeRow
├── DeviceCardModal (Modal)
├── MoveToNodeModal (Modal)
└── CpeDetailModal (Modal)

Estado:
├── State global: useVpn() (context)
├── State local: useState() (componente)
├── Memoization: useMemo() (cálculos costosos)
└── Callbacks: useCallback() (refs en props)
```

---

## ✅ Checklist de Implementación

Al crear un nuevo módulo complejo, verificar:

### Estructura
- [ ] Carpeta con nombre del módulo
- [ ] `ComponentName.tsx` (orquestador principal)
- [ ] `types.ts` (interfaces)
- [ ] `constants.ts` (valores)
- [ ] `components/` subfolder
- [ ] `hooks/` subfolder
- [ ] `utils/` subfolder
- [ ] `index.ts` barrel exports

### Componente Principal
- [ ] Importa hooks personalizados
- [ ] Importa subcomponentes
- [ ] Usa `useVpn()` si necesita estado global
- [ ] Max ~350 líneas
- [ ] Documenta props complejas

### Hooks
- [ ] Lógica separada por responsabilidad
- [ ] Nombres descriptivos con prefijo `use`
- [ ] Retorna objeto con estado + métodos
- [ ] Usa `useMemo` para cálculos costosos
- [ ] Usa `useCallback` para funciones
- [ ] Documented return type

### Subcomponentes
- [ ] Props bien tipadas (interfaces)
- [ ] ~100-150 líneas cada uno
- [ ] No contienen lógica compleja
- [ ] Delegación de eventos al padre
- [ ] Nombres PascalCase

### Utils
- [ ] Funciones puras
- [ ] Documentadas con JSDoc
- [ ] Categorías claras (formatters, colors, helpers)
- [ ] Reutilizables entre componentes

### Barrel Exports
- [ ] `components/index.ts` exporta todos los componentes
- [ ] `hooks/index.ts` exporta todos los hooks
- [ ] `utils/index.ts` exporta todas las utilidades
- [ ] `types.ts` es importable directamente
- [ ] Módulo `index.ts` controla API pública

---

## 🚀 Ejemplo Completo: Crear Nuevo Módulo

### Paso 1: Crear estructura
```bash
mkdir -p src/components/Settings/NewModule/{components,hooks,utils}
touch src/components/Settings/NewModule/NewModule.tsx
touch src/components/Settings/NewModule/{types,constants,index}.ts
```

### Paso 2: Crear types.ts
```typescript
export interface ItemData {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface FilterOptions {
  status: 'all' | 'active' | 'inactive';
  search: string;
}
```

### Paso 3: Crear constants.ts
```typescript
export const LABELS = {
  TITLE: 'Mi Módulo',
  NO_DATA: 'Sin datos',
} as const;

export const FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
] as const;
```

### Paso 4: Crear hook useModuleLogic.ts
```typescript
import { useState, useCallback, useMemo } from 'react';
import type { ItemData, FilterOptions } from '../types';

export function useModuleLogic(initialData: ItemData[]) {
  const [filter, setFilter] = useState<FilterOptions>({ status: 'all', search: '' });

  const filtered = useMemo(() => {
    return initialData.filter(item => {
      const statusMatch = filter.status === 'all' || item.status === filter.status;
      const searchMatch = item.name.includes(filter.search);
      return statusMatch && searchMatch;
    });
  }, [initialData, filter]);

  return { filtered, filter, setFilter };
}
```

### Paso 5: Crear subcomponente ItemRow.tsx
```typescript
import { Trash2 } from 'lucide-react';
import type { ItemData } from '../types';

interface ItemRowProps {
  item: ItemData;
  onDelete: (id: string) => void;
}

export default function ItemRow({ item, onDelete }: ItemRowProps) {
  return (
    <div className="flex items-center justify-between p-3 border-b">
      <span>{item.name}</span>
      <button onClick={() => onDelete(item.id)} className="p-1 hover:bg-red-50">
        <Trash2 className="w-4 h-4 text-red-500" />
      </button>
    </div>
  );
}
```

### Paso 6: Crear módulo principal NewModule.tsx
```typescript
import { useState, useEffect } from 'react';
import ItemRow from './components/ItemRow';
import { useModuleLogic } from './hooks/useModuleLogic';
import { LABELS } from './constants';
import type { ItemData } from './types';

export default function NewModule() {
  const [items, setItems] = useState<ItemData[]>([]);
  const { filtered, filter, setFilter } = useModuleLogic(items);

  useEffect(() => {
    // Load data
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">{LABELS.TITLE}</h2>

      <input
        placeholder="Buscar..."
        value={filter.search}
        onChange={e => setFilter({ ...filter, search: e.target.value })}
      />

      <div>
        {filtered.length === 0 ? (
          <p className="text-slate-400">{LABELS.NO_DATA}</p>
        ) : (
          filtered.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              onDelete={(id) => setItems(items.filter(i => i.id !== id))}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

### Paso 7: Crear index.ts
```typescript
export { default } from './NewModule';
export type { ItemData, FilterOptions } from './types';
export { LABELS, FILTER_OPTIONS } from './constants';
```

---

## 📚 Referencias Reales en el Proyecto

Los mejores ejemplos a seguir:

1. **ApMonitorModule** ⭐⭐⭐
   - Estructura perfecta
   - Múltiples hooks bien separados
   - Subcomponentes organizados en carpetas
   - Utilities modulares

2. **NetworkDevicesModule** ⭐⭐
   - Estructura sólida
   - Necesita optimización de hooks

3. **Common/ConfirmModal** ⭐⭐
   - Componente más simple pero bien estructurado
   - Barrel exports correctos

---

## 🎯 Conclusión

Seguir este patrón garantiza:
- ✅ Código mantenible
- ✅ Fácil de entender para nuevos desarrolladores
- ✅ Reutilización de lógica
- ✅ Escalabilidad
- ✅ Consistencia en el proyecto

**Recuerda**: Simplicidad primero. No sobre-ingenierices. Un componente simple no necesita esta estructura completa.
