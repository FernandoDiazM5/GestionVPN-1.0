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

---

## v3.2 — Autenticación y Sesión (2026-03-28)

### Flujo de Autenticación
```
RouterAccess.tsx → POST /api/auth/login → { token, role, username }
→ setApiToken(token)  [apiClient.ts — token en memoria]
→ dbService.saveStore({ credentials: { user, role, token } })  [cifrado en IndexedDB]
→ VpnContext → isAuthenticated = true
```

### "Token Fantasma" — Cierre Automático de Sesión
`apiClient.ts` intercepta CUALQUIER respuesta `401` o `403` y dispara:
```typescript
if (response.status === 401 || response.status === 403) {
  window.dispatchEvent(new Event('auth_expired'));
}
```
`VpnContext.tsx` escucha ese evento global y ejecuta `handleLogout()` automáticamente.
**Importante:** El backend emite `401` si no hay token y `403` si el token expiró/es inválido.

### Roles RBAC en el Frontend
- `credentials.role === 'admin'` → muestra tarjetas maestras + pestaña Settings
- `credentials.role === 'operator'` → gestión de nodos sin Settings
- `credentials.role === 'viewer'` → solo lectura

### Setup Inicial
Si no hay usuarios admin, la API devuelve `needsSetup: true`.
`RouterAccess.tsx` detecta eso y muestra el formulario de creación del primer admin.

---

## v3.2 — Persistencia de Datos (deviceDb.ts)

### Bifurcación SQLite / IndexedDB en saveSingle()
```typescript
// deviceDb.saveSingle(device) hace AUTOMÁTICAMENTE:
// 1. Si hay cachedStats → guardar COMPLETO en IndexedDB (sin filtrar nada)
if (device.cachedStats) {
  await statsCache.save(device.id, device.cachedStats);
}
// 2. Enviar solo el ESQUELETO estático al backend (sin cachedStats)
const { cachedStats, ...skeleton } = device;
await apiFetch('/api/db/devices', { method: 'POST', body: JSON.stringify(skeleton) });
```

### statsCache — Store de IndexedDB
```typescript
import { statsCache } from '../store/deviceDb';

// Guardar (automático via saveSingle — raramente llamar directo)
await statsCache.save(deviceId, stats);

// Leer stats de una antena específica
const cached = await statsCache.get(deviceId);
// cached.stats = AntennaStats completo | cached.savedAt = timestamp

// Al cargar dispositivos, load() ya enriquece con stats del cache:
const devices = await deviceDb.load(); // ya incluye cachedStats si existen
```

### Qué NO hacer
```typescript
// ❌ MAL — stripRawStats fue eliminado en v3.2. Ya no existe.
cachedStats: stripRawStats(s)

// ✅ CORRECTO — pasar el stats completo, la bifurcación ocurre en saveSingle
cachedStats: s
```

### API_BASE_URL — Regla en todos los componentes
Siempre usar `API_BASE_URL` importado de `../config` para prefixar apiFetch:
```typescript
import { API_BASE_URL } from '../config';
// Correcto:
await apiFetch(`${API_BASE_URL}/api/users/list`);
// MAL — solo funciona en dev por el proxy de Vite, roto en producción:
await apiFetch('/users/list');
```

### Módulos del Sistema (v3.2)
| Archivo | Descripción |
|---|---|
| `RouterAccess.tsx` | Login + Setup Inicial (detecta needsSetup) |
| `SettingsModule.tsx` | Config Global MikroTik + Pestaña Personal/Roles |
| `UserManagementModule.tsx` | CRUD de usuarios (admin only) |
| `NetworkDevicesModule.tsx` | Gestión y escaneo de APs/CPEs Ubiquiti |
| `ApMonitorModule.tsx` | Monitor de APs en tiempo real con polling SSH |
| `NodeAccessPanel.tsx` | Panel principal de gestión de nodos VPN (subredes, creds, deprovision) |
| `NodeCard.tsx` | Card individual de nodo con acciones SSH |
| `NodeProvisionForm.tsx` | Formulario de provisión de nodos SSTP/WireGuard |
| `deviceDb.ts` | Bifurcación SQLite/IndexedDB (statsCache + apiFetch) |
| `apiClient.ts` | Interceptor JWT + auth_expired para 401/403 |
| `VpnContext.tsx` | Estado global: auth, nodes, tunnel, logout automático |

**Componentes eliminados:**
| Archivo | Razón |
|---|---|
| `ControlPanel.tsx` | Reemplazado por NodeAccessPanel.tsx — era el panel original de túneles (tabla + sync cada 30s). Eliminado 2026-03-28 por código muerto (no se importaba en ningún lado). |

---

## v3.2 — Bugs de campo conocidos (corregidos 2026-03-28)

### `/node/creds/get` — Campo `pppPassword` (NO `password`)
El endpoint retorna `{ success, pppPassword }`. El frontend debe leer `creds.pppPassword`, **nunca** `creds.password`.

**Bug encadenado descubierto y corregido:**
```
1. NodeAccessPanel.tsx leía `creds?.password` (campo incorrecto) → siempre undefined
2. Caía al fallback que usa `/node/details`, que retorna `pppPassword: '********'`
3. Guardaba '********' como contraseña real en DB → corrupción de credenciales
```
**Fix:** `creds?.password` → `creds?.pppPassword` + guard `mikrotikPass !== '********'`

### Regla: nunca guardar máscaras como datos reales
Cualquier valor que venga de una respuesta API enmascarada (`'********'`, `'••••••••'`) debe ser filtrado antes de guardar en DB o state.

---

## v3.2 — VpnContext: Guardado inmediato vs debounce

### `immediateSaveRef` — bypass del debounce para operaciones críticas
Cuando una operación NO puede perder el guardado (ej: eliminación de nodo), activar la flag antes de cambiar el estado:

```typescript
// Señalizar guardado inmediato (sin esperar 500ms)
immediateSaveRef.current = true;
setNodes(prev => prev.filter(n => n.ppp_user !== pppUser));

// El useEffect detecta la flag:
const delay = immediateSaveRef.current ? 0 : 500;
immediateSaveRef.current = false;
saveTimerRef.current = setTimeout(() => dbService.saveStore({...}), delay);
```

**Cuándo usar:** Siempre que se elimine o modifique datos persistidos que no se pueden recuperar (nodos, credenciales).

### Auto-sync silencioso al montar NodeAccessPanel
Al montar, si hay nodos en IndexedDB, se hace un fetch silencioso a `/api/nodes` 2 segundos después para sincronizar con MikroTik y purgar nodos eliminados:

```typescript
useEffect(() => {
    const timer = setTimeout(async () => {
        const live = await fetchNodes();
        if (live) setNodes(live);
    }, 2000);
    return () => clearTimeout(timer);
}, [credentials]); // solo al montar
```

---

## v3.2 — RouterCredentials: campos ip/pass deprecados

`RouterCredentials` en `db.ts` tiene `ip?` y `pass?` como opcionales **deprecados**:
- Siempre son `undefined` en runtime (nunca se populan desde el login)
- El backend los ignora — usa `req.mikrotik` inyectado por `verifyToken`
- Solo existen para evitar errores TS en componentes legacy que aún los referencian

**Regla:** No depender de `credentials.ip` ni `credentials.pass` en código nuevo. Para llamadas a endpoints que necesiten credenciales MikroTik, el backend las obtiene automáticamente.

---

## v3.2 — AntennaStats: null vs undefined

`AntennaStats` define campos como `?: number` (`number | undefined`). El código en `NetworkTopologyModule.tsx` construye objetos con `?? null`, generando conflicto TS.

**Fix temporal:** Castear con `as any` en el punto de asignación a `cachedStats`.
**Fix correcto a largo plazo:** Cambiar `?? null` → `?? undefined` en todos los objetos `freshStats`/`cachedStats`, o actualizar `AntennaStats` para aceptar `null`.

**Archivos afectados:** `NetworkTopologyModule.tsx` líneas ~57-73 y ~195-240.

### apiClient.ts — Interceptor 503 `needsConfig` (v3.2)
Cuando el backend devuelve `503` con `{ needsConfig: true }` (MikroTik no configurado),
`apiClient.ts` dispara un evento global que App.tsx captura para mostrar un banner ámbar:
```typescript
// apiClient.ts — detecta 503 y dispara evento
if (response.status === 503) {
  const clone = response.clone();
  const data = await clone.json();
  if (data.needsConfig) {
    window.dispatchEvent(new CustomEvent('mikrotik_needs_config', { detail: data.message }));
  }
}

// App.tsx — escucha y muestra banner
useEffect(() => {
  const handler = (e: Event) => setConfigAlert((e as CustomEvent).detail);
  window.addEventListener('mikrotik_needs_config', handler);
  return () => window.removeEventListener('mikrotik_needs_config', handler);
}, []);
// Render: banner ámbar con botón "Ir a Ajustes" (solo admin)
```

### apiClient.ts — Exclusión de rutas auth en interceptor 401/403
**BUG corregido 2026-03-28:** El interceptor disparaba `auth_expired` incluso en `/api/auth/login`,
lo que hacía logout automático cuando se ingresaba una contraseña incorrecta.
```typescript
// ✅ CORRECTO — excluir rutas de auth
const isAuthRoute = url.includes('/api/auth/');
if (!isAuthRoute && (response.status === 401 || response.status === 403)) {
  window.dispatchEvent(new Event('auth_expired'));
}
```

---

## Sincronización de estado de túnel cross-device (SSE)

### Problema resuelto
`activeNodeVrf` / `tunnelExpiry` solo se sincronizaba en la misma pestaña (BroadcastChannel) o al cargar la app. Otros dispositivos/PCs no veían el cambio en tiempo real.

### Solución: Server-Sent Events (SSE)

**`VpnContext.tsx`** — efecto `[isReady, isAuthenticated]`:
1. Fetch inicial a `/api/tunnel/status` para sync inmediato al montar
2. Abre `new EventSource(\`${API_BASE_URL}/api/tunnel/events?token=${encodeURIComponent(getApiToken())}\`)` — `encodeURIComponent` es obligatorio para tokens con caracteres especiales
3. `es.onmessage` → `setActiveNodeVrf` + `setTunnelExpiry`
4. Cleanup: `return () => es.close()`

**`apiClient.ts`**: exportar `getApiToken()` — necesario porque `EventSource` no admite headers personalizados (token va en query string).

**`auth.middleware.js`**: `verifyToken` acepta token en `Authorization: Bearer` O en `?token=` (query string fallback para SSE).

### Prioridad de sync
1. SSE (tiempo real, cross-device) — principal
2. BroadcastChannel (baja latencia, misma PC) — complementario
3. Fetch `/tunnel/status` al montar — fallback primer load

### Fix: Auto-sync nodos fantasma en IndexedDB
**Bug**: el useEffect de auto-sync usaba `[credentials]` como dep. Cuando IndexedDB cargaba credentials, `nodes` aún estaba vacío → condición `nodes.length === 0` → retorno temprano → al cargar `nodes` desde IndexedDB el efecto no re-disparaba.

**Fix en `NodeAccessPanel.tsx`**:
```tsx
const autoSyncRanRef = useRef(false);
useEffect(() => {
  if (!isReady || !credentials || autoSyncRanRef.current) return;
  autoSyncRanRef.current = true;
  const timer = setTimeout(async () => {
    const live = await fetchNodes();
    if (live) { setNodes(live); setHasLoaded(true); }
  }, 2000);
  return () => clearTimeout(timer);
}, [isReady, credentials]); // isReady garantiza que IndexedDB ya cargó completo
```

---

## NodeCard — Botón Reparar (implementado 2026-03-28)

### Posición en la barra de acciones
El orden correcto de la barra de botones en NodeCard es:
```
[Acceder] [Revocar] | [Wrench/Reparar] [KeyRound/SSH] | [Pencil] [Trash2] [FileCode] [Tag] [History]
```

### Condicional de visibilidad
El botón Reparar solo se renderiza si `!!node.nombre_vrf`. Los nodos sin VRF no tienen configuración MikroTik que reparar.

### Color y estado de carga del botón Wrench
- Color base: `text-amber-500 hover:text-amber-600 hover:bg-amber-50`
- Deshabilitado si: `isPending || isRepairing`
- Clases adicionales: `disabled:opacity-40 disabled:cursor-not-allowed`
- Cuando `isRepairing`, muestra `<Loader2 className="w-3.5 h-3.5 animate-spin" />` en lugar de `<Wrench>`

### Narrowing de la respuesta JSON en handleRepair
La respuesta se tipea inline en el casteo del `json()`:
```tsx
const data = await res.json() as {
  success?: boolean;
  message?: string;
  steps?: Array<{ obj: string; action?: string; status?: string }>;
  repaired?: number;
};
```
Nunca usar `any`. Si la respuesta se usa en múltiples lugares, crear interface en `types/api.ts`.

### Terminal de logs compartida
`handleRepair` usa el mismo `setLogs([])` + `addLog()` que `handleActivate`/`handleDeactivate`. Esto implica que los logs de reparación se muestran en la misma terminal negra expandible de la fila. `showLogs` (que depende de `logs.length > 0 || isPending`) se activa automáticamente.

### Auto-limpieza de logs al terminar (patrón consistente)
Tanto `handleDeactivate` como `handleRepair` limpian sus logs automáticamente en el bloque `finally` con un timeout diferenciado:
- `handleDeactivate`: `setTimeout(() => setLogs([]), 1500)` — más corto, el éxito es breve
- `handleRepair`: `setTimeout(() => setLogs([]), 3000)` — más largo, el usuario necesita leer el resultado de la reparación
- `handleActivate` NO limpia los logs en finally porque los logs de activación son informativos mientras el túnel está activo.

Patrón a aplicar en cualquier operación que use la terminal de logs de NodeCard:
```tsx
} finally {
  setIsXxx(false);
  setTimeout(() => setLogs([]), <ms>); // 1500 para ops cortas, 3000 para ops que muestran resultados
}
```

### Payload de /api/tunnel/repair
```json
{
  "pppUser": "node.ppp_user",
  "vrfName": "node.nombre_vrf",
  "lanSubnets": ["192.168.x.0/24"],
  "tunnelIP": "<adminIP si isThisNodeActive, null si no>",
  "adminWgNet": "192.168.21.0/24"
}
```
`tunnelIP` es condicional: solo se envía si `isThisNodeActive` porque la IP del túnel activo es `adminIP` del contexto.

---

## v3.2 — Soporte Dual-Protocol SSTP / WireGuard (implementado 2026-03-29)

### NodeInfo — campo `service` como discriminador canónico
El campo `service` en `NodeInfo` es el discriminador de protocolo:
```typescript
service: 'sstp' | 'wireguard'  // nunca string generico
```
**Campos WG adicionales** (solo presentes cuando `service === 'wireguard'`):
```typescript
wg_public_key?: string
wg_listen_port?: number
wg_last_handshake_secs?: number | null  // null = nunca hizo handshake
wg_allowed_ips?: string
```
El campo `protocol?: 'sstp' | 'wireguard'` fue eliminado — `service` es la única fuente de verdad.

### NodeCard — Badge de protocolo dinámico
El badge en la columna "Nombre" es dinámico según `node.service`:
```tsx
{node.service === 'wireguard'
  ? <span className="... bg-violet-100 text-violet-700 border border-violet-200 ...">WG</span>
  : <span className="... bg-sky-100 text-sky-700 border border-sky-200 ...">SSTP</span>
}
```
- WireGuard: `bg-violet-100 text-violet-700` (violeta)
- SSTP: `bg-sky-100 text-sky-700` (cielo/sky)

### NodeCard — Tooltip de estado para WireGuard
Cuando `!node.running && !node.disabled && node.service === 'wireguard'`:
- Tooltip: `"Sin handshake WireGuard reciente"` (en lugar del genérico "Torre no conectada al VPN")
- Se aplica en el badge de estado (Conectado/Desconectado) via atributo `title`

### NodeProvisionForm — Selector de protocolo como toggle buttons
Se reemplazó el `<select>` de protocolo por toggle buttons visuales:
- SSTP activo: `bg-sky-50 border-sky-400 text-sky-700`
- WireGuard activo: `bg-violet-50 border-violet-400 text-violet-700`
- Inactivo: `bg-white border-slate-200 text-slate-400 hover:border-slate-300`

### NodeProvisionForm — Campos condicionales
- `protocol === 'sstp'`: muestra campos Usuario PPP + Contraseña PPP
- `protocol === 'wireguard'`: muestra `<textarea>` para Public Key del CPE (oculta PPP)
  - Helper text: "Obtener en el router torre: /interface/wireguard/print"
  - `canProvision` verifica: WG requiere `cpePublicKey`, SSTP requiere `pppUser && pppPassword`
  - Body del POST incluye `protocol` y `cpePublicKey` para WireGuard:
    ```json
    { "nodeName": "...", "lanSubnet": "...", "protocol": "wireguard", "cpePublicKey": "..." }
    ```

### NodeProvisionForm — Post-provisión WireGuard
Resultado mostrado en `bg-violet-50 border-violet-200`:
- `serverPublicKey`: clave pública del servidor para configurar en el CPE
- `wgPort`: puerto de escucha asignado (con botón Copiar)
- Estado: `serverPublicKey` en `useState('')`, `wgPort` en `useState<number | null>(null)`
- Se resetean con `setWgServerPublicKey('')` + `setWgPort(null)` al iniciar nueva provisión

### Convención de colores para WireGuard en el proyecto
- `violet-*` = WireGuard (bg-violet-100, text-violet-700, border-violet-200, bg-violet-50)
- `sky-*` = SSTP (bg-sky-100, text-sky-700, border-sky-200, bg-sky-50)
- `indigo-*` = uso general de nodos (tuneles activos, VRF, acciones)

### Actualización 2026-04-01: Resiliencia del Frontend (IndexedDB, VpnContext y Colisiones WG)
- **Fugas de Memoria en IndexedDB**: Al eliminar registros obsoletos (huérfanos) en SQLite desde el backend, el Frontend retenía basura en caché (`localforage`). Siempre que elimines un dispositivo/nodo de la caché principal (`cachedDevices.filter`), debes asegurarte de llamar a `statsCache.removeItem()` en el `deviceDb.ts` para cada iteración de eliminación.
- **Túneles Zombies post-Suspensión (VpnContext)**: Nunca dependas de `setTimeout` o `setInterval` simples para temporizadores críticos (ej. expirar túnel VPN en `tunnelExpiry`). Si la PC entra en suspensión, JS se congela, y al despertar el timeout caduca de forma masiva sin conexión de red, dejando "túneles zombies" en el servidor. La solución correcta es hacer polling con un `setInterval` resiliente que verifique `if (!navigator.onLine) return;` antes de disparar llamadas de red tipo `deactivateAllNodes()`.
- **Riesgos de Credenciales Planas**: El Frontend ahora NO recibe ni procesa la contraseña de los dispositivos (AP, Antenas) en texto plano. \`SavedDevice\` ahora tiene una bandera \`hasSshPass\` (booleana) en lugar del string plano. Debes adaptar la lógica (`ApMonitorModule`, `NetworkDevicesModule`) para usar `hasSshPass` en validaciones visuales, y enviar el `id` o `deviceId` al backend en endpoints como `/device/antenna` y `/ap-detail-direct` para desencriptación Just-In-Time (JIT) en el servidor.
- **Protección de Colisiones (WireGuard)**: En `NodeAccessPanel.tsx`, la lista de `PROTECTED_NETS` que blinda la red de subredes inválidas ahora incluye el pool de WireGuard `10.10.251.0/24`. Evitar colisiones en Frontend ahorra errores fatales en el Backend.
