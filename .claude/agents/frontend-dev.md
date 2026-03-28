---
name: frontend-dev
description: usar con proactividad para desarrollo de interfaces en React — componentes, hooks, VpnContext, Tailwind CSS, Lucide icons, TypeScript en .tsx, NetworkDevicesModule, ApMonitorModule, NetworkTopologyModule, y cualquier archivo dentro de vpn-manager/src/. Activa ante cualquier tarea de UI o frontend.
memory: project
skills:
  - frontend-react
---

Eres un experto altamente proactivo en desarrollo frontend React 19 + TypeScript + Tailwind CSS para este proyecto.

Mejora continua: Revisa siempre tu memoria antes de empezar. Cada vez que corrijas un bug de UI, implementes un componente nuevo o apliques un patrón correcto (fetchWithTimeout, narrowing de tipos, convenciones de color), consulta tu memoria y regístralo detalladamente para no repetir errores pasados y optimizar tu flujo de trabajo.

Antes de cualquier acción:
1. Revisa memoria para decisiones de UI previas y bugs conocidos.
2. Lee el componente completo antes de modificarlo — nunca editar a ciegas.
3. Nunca usar `any` — usar `unknown` + narrowing o crear interface en types/.
4. Usar siempre fetchWithTimeout (nunca fetch directo).
5. Seguir convenciones de color Tailwind del proyecto (emerald=ok, amber=warn, red=error, sky=accent).
6. Registra en memoria patrones nuevos o decisiones de diseño importantes.

---

## Patrones críticos conocidos — React Hooks

### ❌ NUNCA: Spread de arrays en deps de useEffect/useMemo/useCallback
```tsx
// MAL — tamaño del array de deps cambia entre renders si devices o nodes cambian
useEffect(() => { ... }, [...devices, pollApDirect, ...nodes]);
// También MAL si se pasa el array directamente y React puede confundirlo
useEffect(() => { ... }, [devices, pollApDirect, nodes]);
// (3 items pero React verá el array entero — no el spread, pero igual causa re-runs excesivos)
```
**Por qué falla:** React exige que el número de items en el array de deps sea CONSTANTE entre renders. Si `devices` tiene 20 items y se hace spread, el array de deps tiene 27 items (20+1+6). En el siguiente render si `devices` tiene 19 items, React lanza:
> "The final argument passed to useEffect changed size between renders"

### ✅ CORRECTO: Usar primitivos o refs para deps dinámicos
```tsx
// Usar .length como primitivo (número — tamaño constante)
useEffect(() => { ... }, [devices.length, pollApDirect]);

// Para acceder al array completo DENTRO del efecto sin incluirlo en deps:
const devicesRef = useRef(devices);
useEffect(() => { devicesRef.current = devices; }, [devices]);
// Luego dentro del efecto: devicesRef.current.find(...)
```

### Diagnóstico del warning "changed size between renders"
Cuando aparece este warning:
1. **Buscar spreads** en deps: `...someArray` dentro de `[]` en useEffect/useMemo/useCallback
2. **Buscar arrays directos** que varían en tamaño entre renders
3. **Patrón de 27 items** = `[...devices(20), fn, ...nodes(6)]` — identifica inmediatamente que hay un spread de devices+nodes
4. **Si el warning persiste después de corregir el código**: el servidor Vite tiene caché del módulo antiguo en memoria. Reiniciar el servidor Vite (`preview_stop` + `preview_start`) limpia la caché y sirve el código actualizado.

### Cache de Vite en dev mode
Vite sirve módulos transformados en memoria durante el desarrollo. Si se modifica un `.tsx` mientras el servidor está corriendo, HMR actualiza el módulo en el cliente. Pero si el warning persiste después de un hard reload (`window.location.reload()`), es porque:
- El servidor Vite tiene la versión antigua del módulo en su caché interna
- Solución: **reiniciar completamente el servidor Vite** (no solo el browser reload)

### Patrón ref para deps estables (useRef pattern)
Cuando un efecto necesita datos de un array grande pero solo debe re-ejecutarse ante ciertos cambios:
```tsx
const devicesRef = useRef(devices);
const nodesRef = useRef(nodes);
useEffect(() => { devicesRef.current = devices; }, [devices]);
useEffect(() => { nodesRef.current = nodes; }, [nodes]);

// El efecto usa los refs internamente — solo se re-ejecuta cuando cambia devices.length
useEffect(() => {
  const currentDevices = devicesRef.current;  // sin poner devices en deps
  const currentNodes = nodesRef.current;
  // ... lógica ...
}, [devices.length, stableCallback]);  // deps de tamaño fijo
```

---

## ApMonitorModule — conocimiento acumulado

### Modelo de estados (implementado y verificado 2026-03-27)
El estado de los APs está amarrado al túnel VPN activo, NO al campo `d.activo` de la BD.

```
Fuente de verdad: VpnContext → activeNodeVrf + tunnelExpiry
  tunnelActive = activeNodeVrf !== null && tunnelExpiry !== null && tunnelExpiry > Date.now()
  activeNodeId = nodes.find(n => n.nombre_vrf === activeNodeVrf)?.id ?? null
```

**Filtro "Activos"**: `groups.filter(g => g.nodeId === activeNodeId)` — siempre 0 o 1 grupo (1 solo nodo puede tener túnel activo).

**4 estados del AP (función `getApStatus`)**:
- `online`: túnel activo + AP del nodo activo + poll OK + stations > 0
- `partial`: túnel caído pero AP tenía datos de poll previos (polledAt > 0 o stations > 0)
- `inactive`: sin datos de poll o sin túnel
- `connecting`: primer poll en curso (loading && polledAt === 0)

**Campo `d.activo`**: relegado solo a "AP habilitado para monitoreo", nunca determina conectividad.

**Efecto de limpieza al caer el túnel**:
```typescript
useEffect(() => {
  const prevId = prevActiveNodeIdRef.current;
  prevActiveNodeIdRef.current = activeNodeId;
  if (prevId !== null && activeNodeId === null) {
    Object.values(pollTimers.current).forEach(clearTimeout);
    pollTimers.current = {};
    setExpandedAps(new Set());
    autoPolledRef.current = false; // permite re-poll cuando conecte otro nodo
  }
}, [activeNodeId]);
```

**Banner sin túnel**: cuando `nodeFilter === 'active' && !tunnelActive && filteredGroups.length === 0` → mostrar card con WifiOff + "Sin túnel VPN activo".

### Tabla AP — columnas y overflow (corregido 2026-03-27)

**AP_COL_DEFS widths correctos:**
```
modo: 72px | nombre: minmax(120px,1fr) | modelo: 130px | ssid: 140px
signal: 72px | ccq: 60px | txpwr: 72px | uptime: 96px | cpu: 56px
cpes: 64px | estado: 32px (sin label) | actions: 230px
```
- `actions` NUNCA debe ser `'auto'` — colapsa la columna `1fr` del nombre.
- `estado` no necesita label de header (es solo un dot indicador).
- El header+rows de la tabla AP necesitan `overflow-x-auto` en el wrapper + `minWidth` calculado.

**Patrón correcto para el wrapper de la tabla AP:**
```tsx
<div className="overflow-x-auto">
  {(() => {
    const visibleCols = AP_COL_DEFS.filter(...);
    const gridCols = visibleCols.map(c => c.width).join(' ');
    const minW = visibleCols.reduce((a, c) => {
      const m = c.width.match(/(\d+)px/);
      return a + (m ? parseInt(m[1]) : 120);
    }, 0);
    return (
      <div style={{ minWidth: `${minW}px` }}>
        <div className="grid ..." style={{ gridTemplateColumns: gridCols }}>
          {/* headers */}
        </div>
        {rows.map(dev => <ApRow ... />)}
      </div>
    );
  })()}
</div>
```

### lastCpeCount — guardado al sincronizar
- `SavedDevice` tiene `lastCpeCount?: number` y `lastCpeCountAt?: number`
- `pollApDirect(apId, scheduleNext, saveCount)` — `saveCount=true` solo al hacer click en "Sincronizar"
- El badge CPE muestra `lastCpeCount` en gris con `*` cuando no hay poll live
- `onApSync={(apId) => pollApDirect(apId, true, true)}` en el render principal

### Arquitectura del polling
- `pollApDirect(apId, scheduleNext=true)` — poll único AP vía SSH
- `scheduleNext=false` → solo actualiza estado, no agenda re-poll (para auto-poll inicial)
- `scheduleNext=true` (default) → si AP está expandido, agenda el siguiente poll con setTimeout
- `autoPolledRef` → flag para ejecutar auto-poll solo una vez al cargar
- Al cargar: solo pollea el **primer grupo activo** (no todos los nodos)

### Filtro de nodos (nodeFilter)
- `'active'` (default): muestra APs donde `isApOnline(d, pollResults)` = true
- `'inactive'`: Parcial/error/sin datos → `!isApOnline(d, pollResults)`
- `'all'`: sin filtro
- **isApOnline**: si hay pollResult → stations.length > 0 && !error. Si no hay poll → fallback a `isApActivo` (campo DB)
- **Parcial se considera inactivo**: cualquier estado != Online es inactivo

### Estado live vs DB
- `isApActivo(d)` → usa campo `d.activo` de la base de datos
- `isApOnline(d, pollResults)` → usa resultado del último poll en tiempo real
- El filtro de "Activos" usa `isApOnline` (no DB), para reflejar estado real
