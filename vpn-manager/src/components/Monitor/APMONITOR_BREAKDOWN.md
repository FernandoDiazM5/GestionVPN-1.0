# ApMonitorModule Component Breakdown Plan

## Current State
- **File**: `ApMonitorModule.tsx` (1925 líneas)
- **Status**: Funcional 100%, pero necesita mejor organización
- **Goal**: Dividir en componentes sin modificar código (solo reorganizar)

## Identified Sections (desde 1338 líneas analizadas)

### Core Helper Functions
- **Formatters** (líneas 26-58): fmtDbm, fmtPct, fmtKbps, fmtMbps, sigColor, ccqColor, fmtFw, fmtUptime, fmtCpu, fmtMem
- **Column Definitions** (líneas 61-99): CPE_COL_DEFS, loadColPrefs, saveColPrefs
- **Status Helpers** (líneas 104-124): getApStatus
- **AP Column Definitions** (líneas 284-308): AP_COL_DEFS, loadApColPrefs, saveApColPrefs

### Component Structures

#### 1. **ColSelector** (líneas 127-172)
- Selector dropdown para columnas de CPE
- Reutilizable: Sí
- Props: `hidden: Set<string>`, `onChange: (h: Set<string>) => void`

#### 2. **StatCard** (líneas 175-183)
- Tarjeta de estadísticas individual
- Reutilizable: Sí
- Props: `label, value, sub?, color?`

#### 3. **DeviceCardModal** (líneas 186-208)
- Modal con tarjeta de dispositivo
- Reutilizable: Sí
- Props: `device, onClose, onRemove?, onUpdate?`

#### 4. **MoveToNodeModal** (líneas 211-281)
- Modal para mover dispositivo a nodo
- Reutilizable: Sí
- Props: `device, nodes, knownNames, onConfirm, onClose`

#### 5. **ApColSelector** (líneas 310-348)
- Selector dropdown para columnas de AP
- Reutilizable: Sí (similar a ColSelector)
- Props: `hidden: Set<string>`, `onChange: (h: Set<string>) => void`

#### 6. **CpeDetailModal** (líneas 351-521)
- Modal detallado de CPE con SSH
- Reutilizable: Sí
- Props: `mac, apId, cpeIp, sshPort, sshUser, sshPass, onClose`

#### 7. **ApDetailModal** (líneas 524-697)
- Modal detallado de AP con estadísticas
- Reutilizable: Sí
- Props: `dev, onClose, onSave`

#### 8. **CpeRow** (líneas 702-890)
- Fila de tabla CPE
- Reutilizable: Sí
- Props: `cpe, idx, onDetail, hiddenCols, gridCols`

#### 9. **StationTable** (líneas 893-1031)
- Tabla completa de estaciones/CPEs
- Reutilizable: Sí
- Props: `poll, onCpeDetail, dev`

#### 10. **ApRow** (líneas 1034-1225)
- Fila de tabla AP (memoizado)
- Reutilizable: Sí
- Props: `dev, pollResult?, expanded, hiddenApCols, onToggle, onCpeDetail...`

#### 11. **ApGroupCard** (líneas 1228-1338+)
- Tarjeta de grupo AP
- Reutilizable: Sí
- Props: `group, expandedAps, pollResults, activeNodeName, tunnelActive...`

### Main Component
- **ApMonitorModule** - Orquestador principal (resto del archivo)

## Proposed Structure

```
src/components/Monitor/
├── ApMonitorModule.tsx (orquestador principal)
├── components/
│   ├── ApRow.tsx
│   ├── ApGroupCard.tsx
│   ├── StationTable.tsx
│   ├── CpeRow.tsx
│   ├── StatCard.tsx
│   ├── modals/
│   │   ├── DeviceCardModal.tsx
│   │   ├── MoveToNodeModal.tsx
│   │   ├── CpeDetailModal.tsx
│   │   └── ApDetailModal.tsx
│   └── selectors/
│       ├── ColSelector.tsx
│       └── ApColSelector.tsx
├── hooks/
│   ├── useApMonitorLogic.ts (lógica principal)
│   ├── useColumnPrefs.ts (gestión de preferencias)
│   └── usePolling.ts (polling de datos)
├── utils/
│   ├── formatters.ts (todas las funciones fmt*)
│   ├── colors.ts (sigColor, ccqColor)
│   ├── columnDefs.ts (CPE_COL_DEFS, AP_COL_DEFS)
│   ├── statusHelpers.ts (getApStatus)
│   └── types.ts (tipos locales)
├── README.md
└── APMONITOR_BREAKDOWN.md (este archivo)
```

## Benefits

✅ **Modularidad**: Cada componente responsable de una tarea  
✅ **Reutilización**: Componentes como ColSelector, StatCard reutilizables  
✅ **Mantenibilidad**: ApMonitorModule se reduce de 1925 a ~200 líneas  
✅ **Testing**: Componentes y hooks fáciles de testear  
✅ **Sin cambios**: Todo el código preservado exactamente igual  

## Implementation Strategy

1. **Phase 1**: Extraer utils (formatters, colors, columnDefs, statusHelpers)
2. **Phase 2**: Extraer componentes simples (StatCard, ColSelector, ApColSelector)
3. **Phase 3**: Extraer modals (DeviceCardModal, MoveToNodeModal, CpeDetailModal, ApDetailModal)
4. **Phase 4**: Extraer tablas (CpeRow, StationTable, ApRow, ApGroupCard)
5. **Phase 5**: Extraer hooks
6. **Phase 6**: Refactorizar ApMonitorModule

**Actualizado**: 2026-05-30
