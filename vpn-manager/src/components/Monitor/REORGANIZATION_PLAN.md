# ApMonitorModule Reorganization Plan

## Status: ✅ Ready for Incremental Implementation

Debido al tamaño del archivo (1925 líneas), la reorganización será por **fases con commits incrementales** para mantener la funcionalidad intacta.

## Fases de Reorganización

### Phase 1: Utilidades (Sin Breaking Changes)
- ✅ `utils/formatters.ts` - fmtDbm, fmtPct, fmtKbps, fmtMbps, fmtFw, fmtUptime, fmtCpu, fmtMem
- ✅ `utils/colors.ts` - sigColor, ccqColor
- ✅ `utils/columnDefs.ts` - CPE_COL_DEFS, AP_COL_DEFS, loadColPrefs, saveColPrefs, loadApColPrefs, saveApColPrefs
- ✅ `utils/statusHelpers.ts` - getApStatus
- ✅ `utils/types.ts` - Interfaces: ColDef, ApColDef, NodeGroup, ApStatus

### Phase 2: Componentes Simples
- ✅ `components/StatCard.tsx`
- ⏳ `components/selectors/ColSelector.tsx`
- ⏳ `components/selectors/ApColSelector.tsx`

### Phase 3: Modals
- ⏳ `components/modals/DeviceCardModal.tsx`
- ⏳ `components/modals/MoveToNodeModal.tsx`
- ⏳ `components/modals/CpeDetailModal.tsx`
- ⏳ `components/modals/ApDetailModal.tsx`

### Phase 4: Tablas
- ⏳ `components/CpeRow.tsx`
- ⏳ `components/StationTable.tsx`
- ⏳ `components/ApRow.tsx`
- ⏳ `components/ApGroupCard.tsx`

### Phase 5: Main Component
- ⏳ `ApMonitorModule.tsx` - Refactorizado (imports actualizados)

## Enfoque para Garantizar Cero Cambios de Código

1. **Copy-paste exacto**: Cada función/componente copiado línea-por-línea sin cambios
2. **Imports añadidos**: Solo agregar imports necesarios en cada archivo
3. **Export exacto**: Exportar con el mismo nombre/forma
4. **ApMonitorModule**: Actualizar solo los imports, sin tocar lógica

## Commits Esperados

```
1. refactor: extraer utils de ApMonitorModule (formatters, colors, columnDefs, statusHelpers)
2. refactor: extraer componentes simples (StatCard, ColSelector, ApColSelector)
3. refactor: extraer modals (DeviceCardModal, MoveToNodeModal, CpeDetailModal, ApDetailModal)
4. refactor: extraer tablas (CpeRow, StationTable, ApRow, ApGroupCard)
5. refactor: actualizar imports en ApMonitorModule
```

## Verificación Post-Reorganización

```bash
# 1. TypeScript debe compilar sin errores
npx tsc --noEmit

# 2. Funcionalidad preservada (tests si existen)
npm run test

# 3. Build sin errores
npm run build

# 4. Dev server sin errores
npm run dev
```

## Ventajas de este Enfoque

✅ Commits pequeños y revisables  
✅ Fácil revertar si algo falla  
✅ Cero cambios de lógica/código  
✅ Mejor segregación de concerns  
✅ Facilita testing futuro  

**Actualizado**: 2026-05-30
