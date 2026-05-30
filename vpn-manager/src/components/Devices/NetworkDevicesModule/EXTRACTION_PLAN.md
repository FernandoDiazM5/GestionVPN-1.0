# NetworkDevicesModule Extraction Plan

## Componente Actual
**Archivo**: `src/components/Devices/NetworkDevicesModule.tsx`
**Tamaño**: 2,689 líneas
**Estado**: 7 componentes internos, 40+ hooks, 15+ funciones helper
**Complejidad**: ALTA (escaneo asíncrono, autenticación SSH paralela, tabla dinámica)

---

## Análisis Estructural

### Componentes Internos (7)
1. **AddDeviceModal** (140 líneas) - Modal para agregar/editar dispositivo con credenciales SSH
2. **DeviceCardModal** (23 líneas) - Wrapper modal para DeviceCard
3. **DeviceStatusPanel** (390 líneas) - Panel detallado con métricas SSH, gráficos, raw data
4. **SshDataModal** (235 líneas) - Modal diagnóstico con toda la información SSH
5. **ColumnPicker** (110 líneas) - Selector de columnas con orden personalizable
6. **RawBlock** (28 líneas) - Bloque colapsable para datos raw (reutilizable)
7. **NetworkDevicesModule** (1,564 líneas) - Componente principal con lógica de escaneo

### Funciones Helper y Constantes
- `estimateIpCount()` - Calcula hosts en CIDR
- `ipInCidr()` - Valida IP dentro de bloque CIDR
- `fmtBytes()`, `fmtPkts()` - Formateo de datos
- `COLUMN_DEFS[]` - 21 columnas configurables con renders
- Session/localStorage constants

### Hooks y State (40+)
- `useState` x 15
- `useEffect` x 8  
- `useCallback` x 2
- `useRef` x 5
- `useMemo` x 1
- Contexto: `useVpn()`

### Funciones Principales
- `handleScan()` - Fase 1 (escaneo) + Fase 2 (autenticación SSH)
- `runAuthPhase()` - Autenticación SSH en paralelo (batch size 3)
- `handleAddDevice()` - Guardar dispositivo con auto-SSH
- `toggleSort()`, `saveVisibleCols()`, `showToast()`

---

## Estructura Propuesta: 25+ archivos

```
NetworkDevicesModule/
├── NetworkDevicesModule.tsx         (1,200 líneas) - Componente principal refactorizado
├── index.ts                         - Exportación pública
├── types.ts                         - Interfaces y tipos
├── constants.ts                     - Constantes y COLUMN_DEFS
├── hooks/
│   ├── useScanState.ts             - Estado de escaneo (phase, progress)
│   ├── useScanResults.ts           - Resultados y almacenamiento en session
│   ├── useSshAuth.ts               - Lógica de autenticación SSH paralela
│   ├── useDeviceManagement.ts      - CRUD de dispositivos guardados
│   ├── useColumnPreferences.ts     - Columnas visibles y localStorage
│   ├── useSortFilter.ts            - Sort y búsqueda
│   ├── useNodeSelection.ts         - Selección y gestión de nodos
│   └── useToast.ts                 - Sistema de notificaciones
├── components/
│   ├── AddDeviceModal.tsx          (140 líneas)
│   ├── DeviceCardModal.tsx         (23 líneas)
│   ├── DeviceStatusPanel.tsx       (390 líneas)
│   ├── SshDataModal.tsx            (235 líneas)
│   ├── ColumnPicker.tsx            (110 líneas)
│   ├── RawBlock.tsx                (28 líneas)
│   ├── ScanProgress.tsx            - Barra de progreso de escaneo
│   ├── DeviceTable.tsx             - Tabla de diagnóstico
│   ├── DiagnosticTable.tsx         - Tabla expandible con datos SSH
│   ├── DeviceRow.tsx               - Fila individual de dispositivo
│   └── DeviceList.tsx              - Contenedor de lista de dispositivos
├── utils/
│   ├── ipValidation.ts             - estimateIpCount, ipInCidr
│   ├── formatters.ts               - fmtBytes, fmtPkts
│   ├── scanService.ts              - Función handleScan
│   ├── authService.ts              - runAuthPhase con paralelización
│   ├── deviceService.ts            - handleAddDevice, CRUD
│   └── columnHelpers.ts            - Lógica de columnas
├── constants/
│   ├── columns.ts                  - COLUMN_DEFS completo (21 columnas)
│   ├── messages.ts                 - Mensajes de error/éxito
│   └── storage.ts                  - SESSION_SCAN_KEY, COLS_STORAGE_KEY
├── README.md                       - Documentación
└── EXTRACTION_PLAN_FINAL.md        - Reporte de implementación
```

---

## Estrategia de Extracción

### Fase 1: Componentes + Tipos (6 archivos)
1. **types.ts** - Todas las interfaces (ColumnDef, ScanCred, SshAuthStatus, etc.)
2. **constants/columns.ts** - COLUMN_DEFS con 21 items
3. Componentes: AddDeviceModal → DeviceCardModal → RawBlock → ScanProgress

### Fase 2: Hooks (8 archivos)
Cada hook captura un dominio específico sin dependencies cruzadas:
- `useScanState` - Simpletón state manager
- `useScanResults` - SSE parsing + sessionStorage
- `useSshAuth` - Autenticación en paralelo (lógica pura)
- Resto: state + localStorage

### Fase 3: Services (5 archivos)
Extraer funciones grandes como funciones puras:
- `scanService.ts` - handleScan (SSE reader + Fase 1)
- `authService.ts` - runAuthPhase (batch paralelo)
- `deviceService.ts` - handleAddDevice con auto-SSH
- `ipValidation.ts` - CIDR helpers
- `formatters.ts` - Número → string

### Fase 4: Componentes Avanzados (4 archivos)
- `DeviceStatusPanel.tsx` - Refactorizar con hooks
- `SshDataModal.tsx` - Refactorizar con hooks
- `DeviceTable.tsx` + `DiagnosticTable.tsx` - Separar lógica de tabla
- `ColumnPicker.tsx` - Usar hook useColumnPreferences

### Fase 5: Componente Principal (1 archivo)
- `NetworkDevicesModule.tsx` - Orquestador de 40+ líneas que:
  - Inicializa hooks
  - Maneja eventos de UI
  - Coordina modales
  - Llama a services

---

## Impacto de la Extracción

| Métrica | Antes | Después | % Reducción |
|---------|-------|---------|------------|
| Líneas archivo principal | 2,689 | ~300 | 89% ↓ |
| Componentes internos | 7 (inline) | 8 (modular) | Mismo |
| Hooks (inline) | 40+ | 8 reutilizables | 80% ↓ |
| State complexity | Entrelazado | Separado por dominio | Mejor |
| Testabilidad | Baja | Alta | ✓ |
| Reutilización | No | Sí (hooks + services) | ✓ |

---

## Cambios al Componente Principal: ANTES vs DESPUÉS

### ANTES (2,689 líneas)
```typescript
// Todo en un archivo:
// - 7 componentes internos
// - 40+ useState/useEffect
// - 5 useRef
// - Lógica SSE streaming
// - Parseo de eventos
// - Autenticación paralela
// - CRUD de dispositivos
// - Tablas con 21 columnas dinámicas
// - 3 modales
// - Sistema de toast
```

### DESPUÉS (~300 líneas)
```typescript
export default function NetworkDevicesModule() {
  // Hooks especializados (8)
  const scanState = useScanState();
  const { scanResults, allScannedIPs } = useScanResults();
  const { sshStatus, handleAuth } = useSshAuth();
  const { savedDevices, handleAddDevice } = useDeviceManagement();
  const { visibleCols, saveColumns } = useColumnPreferences();
  const { sortConfig, toggleSort } = useSortFilter();
  const { selectedNode, nodes } = useNodeSelection();
  const { toast, showToast } = useToast();

  // Handlers (simplificados, llaman a services)
  const handleScan = async () => {
    try {
      const devices = await scanService.discover(effectiveLan);
      scanState.setPhase('authenticating');
      await authService.authenticate(devices, creds);
    } catch (err) { showToast(err.message); }
  };

  // UI muy simple
  return (
    <div>
      <Header nodes={nodes} onScan={handleScan} />
      <ScanProgress state={scanState} />
      <DeviceTable 
        data={scanResults}
        columns={visibleCols}
        onColumnChange={saveColumns}
      />
      {/* Modales */}
      {addingDevice && <AddDeviceModal onSave={handleAddDevice} />}
      {viewingDevice && <DeviceCardModal device={viewingDevice} />}
      {viewingRaw && <SshDataModal device={viewingRaw} />}
      <Toast message={toast} />
    </div>
  );
}
```

---

## Garantías de la Extracción

✅ **Cambios de Lógica**: NINGUNO
- Cada service es copia directa del código original
- Cada hook es wrapper del useState + useEffect original
- Componentes = UI idéntica, props unchanged

✅ **Breaking Changes**: NINGUNO
- Props de NetworkDevicesModule sin cambios
- Contexto useVpn() sigue igual
- Almacenamiento: sessionStorage + localStorage + IndexedDB sin cambios

✅ **Testing**: MEJORADO
- Cada service es función pura → testeable
- Cada hook es aislado → testeable
- Componentes tienen surface reducida → testeable

✅ **Performance**: IGUAL
- Sin renders adicionales (hooks dentro de componentes)
- Sin cambios en dependency arrays
- Memoización preservada

---

## Archivos a Crear: 25 (12 root + 8 hooks + 6 components + 5 utils + 2 constants + 2 docs)

**Criterios de Éxito**:
1. ✓ 2,689 líneas → ~300 líneas en componente principal
2. ✓ Todos los archivos creados según plan
3. ✓ TypeScript compilation: 0 errores
4. ✓ Comportamiento idéntico al original
5. ✓ index.ts exporta NetworkDevicesModule

---

## Próximos Pasos

**Usuario debe aprobar el plan antes de implementación**

Responder: ¿Está bien este plan? ¿Algún ajuste?
