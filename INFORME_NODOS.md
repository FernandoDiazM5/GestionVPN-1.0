# 🔎 Informe técnico — Vista "Nodos" (alta + acciones)

> Auditoría de ingeniería sobre el flujo de **agregar nodo** y las **8 acciones del kebab**.
> Alcance: UI/UX + backend + lógica. Fecha: 2026-06-15. Rama: `dev`.
> Estado del informe: **análisis, sin cambios de código** (a la espera de priorización).

Archivos revisados:
- Frontend: `NuevoNodo.tsx`, `ScriptModal.tsx`, `NodeCardKebabMenu.tsx`, `useServerSettings.ts`, `utils/`.
- Backend: `routes/nodes/{provision,listing,editing,credentials,history,tags,_shared}.js`, `routes/core/tunnel-repair.routes.js`, `auth.middleware.js`, `lib/routeGuards.js`, `index.js`.

---

## 0) Resumen ejecutivo

| # | Severidad | Área | Hallazgo | Estado |
|---|-----------|------|----------|--------|
| H1 | 🔴 **Crítico** | Backend / RBAC | Las rutas de mutación de nodos (`provision`, `deprovision`, `edit`, `creds/save`, `tag/save`, …) **no tienen guard de rol**. Un usuario MEMBER (View) puede crear/editar/eliminar nodos vía API directa. La protección es solo de UI. | ✅ **Corregido** |
| H2 | 🟠 Alto | UX / Datos | La **IP pública del servidor** se pide repetidamente y se guarda en **dos llaves distintas** (`wg_wan_ip` en NuevoNodo vs `server_public_ip` canónica). Es un dato global del sistema → no debería pedirse en cada nodo. *(Tu observación.)* | ✅ **Corregido** |
| H3 | 🟠 Alto | Backend / Lógica | `POST /node/next` calcula `nextNode`/`nextRemote` al abrir el modal y **no se re-valida al provisionar** → condición de carrera (TOCTOU): dos altas simultáneas colisionan en mismo `ND`/IP. | ✅ **Corregido** (queda residual: 2 provisiones 100% simultáneas — ver nota) |
| H4 | 🟡 Medio | Backend | Provisión **sin rollback transaccional** en MikroTik: si falla un paso intermedio, el router queda en estado parcial y nada se persiste en BD. | ✅ **Corregido** (rollback best-effort scoped + aviso en UI) |
| H5 | 🟡 Medio | Backend / Aislamiento | `GET /node/tags` **no filtra por workspace** → expone `ppp_user` + etiquetas de **todos** los workspaces. | ✅ **Corregido** |
| H6 | 🟡 Medio | Backend | Validación débil en `/node/provision` (`nodeNumber` puede ser `NaN`, `nodeName` vacío genera `VRF-NDNaN-`). | ✅ **Corregido** |
| H7 | 🟢 Bajo | UX | Numeración `ND` nunca reutiliza huecos; el menú no diferencia acciones de **lectura** vs **destructivas**; faltan confirmaciones server-side. | 🟡 Parcial (menú agrupado vía H11; ND monótono documentado a propósito; autorización reforzada por H1) |
| H11 | 🟢 Bajo | UX / Diseño | Menú kebab sin separar lectura/configuración/peligro + colores ámbar duplicados (SSH/reparar/etiquetas) → "color como decoración". | ✅ **Corregido** (3 secciones + neutro 80% + color solo intencional: violeta WG, ámbar reparar, rosa eliminar). `audit:design` 0 errores, total 23→21 |
| H8 | 🟢 Bajo | Frontend | `ScriptModal` persistía la IP con un POST **por cada tecla**. | ✅ **Corregido** (`onBlur`) |
| H12 | 🟢 Bajo | Frontend | Alta WG no exigía IP pública (comandos CPE incorrectos); no se detectaba solape LAN contra otros nodos. | ✅ **Corregido** (bloqueo WG sin IP + aviso de solape) |
| H10 | 🟢 Bajo | Frontend | Barra de progreso del alta **simulada** con `setInterval` (no refleja el router real). | ✅ **Corregido** (progreso real por SSE + `provisionId`) |
| H13 | 🟠 Alto | Frontend / Bug | **`cidrOverlaps` rota para redes con bit alto** (signo vs unsigned): el solape con **192.168.21.0/24 (gestión)** nunca se detectaba. Descubierto por los tests de H12. | ✅ **Corregido** |
| H14 | 🔴 **Crítico** | Backend + Frontend / Seguridad | **Credenciales de equipos (Escanear/NetworkDevices):** `/device/antenna`, `/device/auto-login` tomaban **IP y contraseña del body** sin `ownsApUuid` → **SSRF**; el caché cliente (IndexedDB) guardaba las claves SSH en **texto plano**. Inconsistencia vs Monitor AP (§C4). | ✅ **Corregido** (Fases 1-2; resto menor en §6) |

> **Verificación:** **191 tests backend + 73 frontend verde** (backend: 170 base + 15 RBAC `nodesAccessControl.test.js` + 6 provisión `provisionAllocation.test.js`; frontend: 64 base + 9 `utils/subnet.test.ts`). Frontend `tsc -b`: 0 errores nuevos (3 preexistentes ajenos a este trabajo).
> **Nota H3 residual:** se cierra el caso común (preview obsoleto / alta en paralelo no simultánea) recalculando ND/IP autoritativos en el commit. Dos provisiones *exactamente* simultáneas (ventana read→write de segundos) aún podrían colisionar; cerrarlo del todo requiere serializar las altas con un lock/cola (follow-up sugerido).

---

## 1) El punto que señalaste — IP pública del servidor (H2)

Tienes razón: **la IP pública es un dato único del sistema** (un solo MikroTik core compartido) y hoy se trata como si fuera por-nodo.

### Lo que pasa actualmente
- En **`NuevoNodo.tsx`** (solo cuando el protocolo es WireGuard) hay un campo *"IP Pública WAN del Servidor"* que:
  - Se guarda **solo en `localStorage`** bajo la llave **`wg_wan_ip`** (`NuevoNodo.tsx:36,469`).
  - **No** se persiste en backend ni se comparte entre navegadores/usuarios del workspace.
- En **`ScriptModal.tsx`** y **`useServerSettings.ts`** se usa otra llave, **`server_public_ip`**, que **sí** está respaldada en BD (`app_settings`) vía `/api/settings/{get,save}` (`ScriptModal.tsx:119`, `useServerSettings.ts:18-27`).

→ Resultado: **dos fuentes de verdad desincronizadas**. Configurar la IP en el Script no prellena el alta de nodo, y viceversa. Además en SSTP el alta no la pide (bien, no la necesita), pero el Script luego sí — experiencia incoherente.

### Recomendación
1. **Una sola fuente de verdad**: usar siempre `server_public_ip` (ya existe en `app_settings`). Eliminar `wg_wan_ip`.
2. **Configurarla una vez** en *Ajustes* (es config del router core → pertenece al admin de plataforma, junto a `MT_IP/MT_USER/MT_PASS`).
3. En `NuevoNodo` y `ScriptModal`: **prellenar de solo lectura** desde ese setting, con un link "editar en Ajustes" en vez de un input editable que dispara guardados en cada tecla (`ScriptModal.tsx:116-120` hace un POST por keystroke — ver H8 abajo).
4. Migración suave: al cargar, si existe `wg_wan_ip` en localStorage y no hay `server_public_ip`, copiarlo una vez.

---

## 2) Backend — hallazgos

### 🔴 H1 — Control de acceso roto en mutaciones de nodos (lo más grave)
En `index.js:198-204` **todas** las rutas de nodos se montan únicamente con `verifyToken`:
```js
app.use('/api', verifyToken, nodeRoutes);
```
`verifyToken` mapea el rol RBAC así (`auth.middleware.js:27-28`): `MEMBER → viewer`, `OWNER/CO_MODERATOR → admin`, e **inyecta `req.mikrotik` para todos** (`injectMikrotik`, línea 40). Es decir, un MEMBER tiene credenciales del router disponibles.

- `/node/provision` y `/node/next`: **sin ninguna guarda** (ni rol ni ownership). Cualquier sesión válida puede crear nodos.
- `/node/deprovision`, `/node/edit`, `/node/label/save`, `/node/tag/save`, `/node/history/add`, `/node/creds/save`, `/node/ssh-creds/save`, `/node/wg/set-peer`: solo validan `nodeBelongsToRequester` (`_shared.js:93`), que comprueba **workspace, no rol**. Un MEMBER pertenece al workspace → **puede eliminar/editar nodos de su propio workspace**.

La UI oculta estas acciones al MEMBER (§33 del handoff), pero **el backend no lo refuerza**: un `curl` con la cookie de un View basta para destruir infraestructura. Es escalada de privilegios / broken access control (OWASP A01).

> Nota: las rutas `creds/get` y `ssh-creds/get` **sí** usan `requireOperator` (`_shared.js:107`), que bloquea a `viewer`. La inconsistencia es justamente que ese mismo guard falta en las rutas de escritura.

**Fix:** introducir `requireOperator`/`requireOwner` (rol `admin`/`operator`, según el modelo) en **todas** las mutaciones de nodos. Idealmente un guard explícito por router en lugar de depender de `nodeBelongsToRequester` para autorización.

### 🟠 H3 — TOCTOU en numeración y direccionamiento
`/node/next` (`provision.routes.js:22-54`) lee VRFs/secrets vivos y devuelve `nextNode = maxNd+1` y `nextRemote = max(10.10.250.x)+1`. Ese valor viaja al frontend y vuelve **sin re-validarse** en `/node/provision`. Dos altas concurrentes (dos operadores, o dos pestañas) obtienen el **mismo `ND` e IP** → se crean `VRF-ND15-A` y `VRF-ND15-B`, o secrets con `remote-address` duplicada. `writeIdempotent` deduplica nombres idénticos, pero no nombres distintos con el mismo número.

Lo mismo aplica al cálculo del bloque `/30` WireGuard (`provision.routes.js:86-101`), que también lee estado vivo y es sensible a concurrencia.

**Fix:** recomputar `nextNode`/`nextRemote`/bloque WG **dentro** de `/node/provision` (ignorar el valor del cliente o usarlo solo como sugerencia), o serializar las altas con un lock/cola.

### 🟡 H4 — Provisión sin rollback en el router
`/node/provision` ejecuta 7 pasos secuenciales en MikroTik y **solo al final** persiste en BD. Si falla, p.ej., el paso VRF tras crear PPP secret + interfaz SSTP, el router queda con objetos huérfanos y la BD vacía. Se devuelve `failedAt` (bien para la UI), pero **no hay limpieza automática**. El `BEGIN/COMMIT` de la línea 194/275 solo cubre MySQL, no el router.

**Fix:** ante fallo, ejecutar un "deprovision parcial" de los pasos ya aplicados (los `steps` acumulados dan la lista exacta), o documentar que "Verificar y reparar" es el camino de recuperación (hoy lo es de facto, pero no se le dice al usuario).

### 🟡 H5 — `GET /node/tags` sin aislamiento multi-tenant
`tags.routes.js:14-30` hace `SELECT ... FROM nodes` **sin `WHERE workspace_id`**. Devuelve el mapa `ppp_user → tags` de **todos** los nodos del sistema. Un moderador puede enumerar nombres de túnel/etiquetas de otros workspaces. Fuga menor pero rompe el principio de aislamiento que el resto del proyecto respeta.

**Fix:** filtrar por `n.workspace_id = req.account.workspace_id` (y dejar pasar al platform_admin).

### 🟡 H6 — Validación de entrada débil en provisión
`/node/provision` valida CIDRs e IP remota, pero **no** valida `nodeNumber` (un `NaN` produce `VRF-NDNaN-NOMBRE`) ni que `nodeName` quede no vacío tras limpiar (`nameUpper` podría ser `''` → `VRF-ND15-`). Confía en que el frontend siempre manda valores correctos.

**Fix:** validar `Number.isInteger(parseInt(nodeNumber)) > 0` y `nameUpper.length >= 2` server-side (con Zod, coherente con F5.B).

### Observaciones menores backend
- `history.routes.js` y `tags.routes.js` siguen con el shape legacy `{ success, ... }` y `res.status().json()` manual, no migrados a `sendOk/AppError` como el resto (deuda de consistencia F5.A).
- `/node/script` para WG mezcla `distance=2` (frontend, `NuevoNodo.tsx:312`) vs `distance=20` (backend, `listing.routes.js:249`) en la ruta de retorno MGMT del CPE. No es bug funcional pero es **inconsistencia** que confunde al operador que compara ambos.
- En `editing.routes.js:130`, el recálculo del peer IP WG asume bloque `/4` derivado del octeto guardado; si `ip_tunnel` en BD quedó desincronizado, el `allowed-address` del peer se actualiza con una IP incorrecta.

---

## 3) Frontend — hallazgos

### 🟠 H8 — `ScriptModal` guarda el setting en cada keystroke
`ScriptModal.tsx:116-120`: el `onChange` del input de IP hace `localStorage.setItem` **y** un `POST /api/settings/save` **por cada carácter tecleado**. Escribir una IP dispara ~13 requests. Debe ser `onBlur` o con debounce.

### 🟡 H9 — Doble fuente de la IP (ver H2) en el cliente
`NuevoNodo` lee `wg_wan_ip`; `ScriptModal`/`useServerSettings` leen `server_public_ip`. Unificar.

### ✅ H10 — Barra de progreso "fake" → progreso REAL por SSE
Antes: los 7 pasos avanzaban con un `setInterval` de 1800 ms, sin reflejar el router real. **Corregido:** el backend publica cada paso completado por SSE (`sse.publish(workspace, 'node-provision', { provisionId, step })`) reutilizando el stream `/api/events/stream`; `NuevoNodo` genera un `provisionId`, se suscribe durante la provisión y avanza la barra con el **conteo real** de pasos (filtrado por `provisionId`). Degradación segura: si el stream falla, la barra no avanza pero el resultado sigue llegando por la respuesta del POST. Helper `pushStep` evita tocar las 31 llamadas a `steps.push` una a una.

### 🟢 H11 — UX del menú kebab (acción por acción, ver §4)
- No hay separación visual entre acciones **de lectura** (Script, Historial, Diagnosticar, Etiquetas) y **destructivas/mutadoras** (Reparar, Editar, Eliminar). Solo "Eliminar" está en rojo.
- "Credenciales SSH" y "Verificar y reparar" comparten color ámbar → señal de color ambigua (el sistema de diseño pide *un estado = un color*).
- No hay `aria-label` explícito en los items (son `<button>` con texto, aceptable, pero el toggle del kebab `MoreVertical` sí debería tener label descriptivo además de `title`).

### 🟢 H12 — Validaciones del formulario de alta
- `canSubmit` (`NuevoNodo.tsx:111`) **no** bloquea WireGuard por falta de IP pública WAN, aunque esa IP es necesaria para los comandos del CPE que se muestran después. Se permite crear el nodo y luego el bloque CPE muestra `<IP-servidor>` o cae a `credentials?.ip` (la IP de gestión, **no** la pública) → comando incorrecto.
- El conflicto de subred (`getSubnetConflicts`) solo compara contra la red de gestión; **no** detecta solापamiento contra subredes de **otros nodos ya existentes** (colisión LAN entre torres), que es un error operativo común.

---

## 4) Análisis acción por acción (kebab)

| Acción | Endpoint | Estado | Riesgo / nota |
|--------|----------|--------|---------------|
| **Configurar peer WireGuard** | `/node/wg/set-peer` | OK | Solo aparece si WG sin `wg_public_key`. Tiene ownership check. ✔ |
| **Verificar y reparar** | `/tunnel/repair` | OK funcional | **Sin `nodeBelongsToRequester`** (a diferencia del resto). Idempotente y útil; es el recovery de facto de H4. Sin guard de rol (H1). |
| **Credenciales SSH** | `/node/ssh-creds/{save,get}` | OK | `get` protegido por `requireOperator`; **`save` no** (H1). |
| **Editar nodo** | `/node/edit` | OK funcional | Sin guard de rol (H1). Recálculo WG frágil (H6 menor). |
| **Script de configuración** | `/node/script` | OK | `distance` inconsistente vs alta. Guardado por-keystroke (H8). |
| **Gestionar etiquetas** | `/node/tags`, `/node/tag/save` | ⚠ | `GET` sin aislamiento (H5); `save` sin guard de rol (H1). |
| **Historial de conexión** | `/node/history/{add,get}` | OK | Shape legacy; `add` sin guard de rol. Append-only correcto. |
| **Diagnosticar (ping/trace)** | `/api/diagnostics/*` | Fuera de foco | Cubierto en §28 del handoff (rate-limit existente). No auditado en profundidad aquí. |
| **Eliminar nodo** | `/node/deprovision` | ⚠ | Cascada correcta y robusta (2 conexiones, removes secuenciales). Pero **un MEMBER podría invocarlo** (H1). Falta confirmación server-side / doble verificación. |

---

## 5) Mejoras propuestas (priorizadas)

**P0 — Seguridad (hacer ya)**
1. **H1**: añadir guard de rol (`requireOperator`/owner) a todas las mutaciones de nodos + a `/tunnel/repair`. Test de regresión: un MEMBER recibe 403 en provision/deprovision/edit.
2. **H5**: filtrar `/node/tags` por workspace.

**P1 — Tu pedido + robustez**
3. **H2/H9**: unificar la IP pública en `server_public_ip` (BD), configurable en *Ajustes*, prellenada read-only en NuevoNodo y ScriptModal. Eliminar `wg_wan_ip`.
4. **H3**: recomputar `nextNode`/IP/bloque WG dentro de `/node/provision` (cerrar TOCTOU).
5. **H6**: validación server-side de `nodeNumber`/`nodeName` (Zod).

**P2 — Calidad / UX**
6. **H8**: debounce/onBlur en el guardado de IP del ScriptModal.
7. **H4**: rollback parcial en provisión fallida (o mensaje explícito "usa Verificar y reparar").
8. **H12**: validar IP pública antes de crear nodo WG; detectar solapamiento LAN contra otros nodos.
9. **H11**: agrupar el kebab en secciones (lectura / configuración / peligro) y corregir colores duplicados.
10. Consistencia: migrar `history`/`tags` a `sendOk/AppError`; alinear `distance` WG entre alta y script.

---

## 6) H14 — Almacenamiento y uso de credenciales de equipos (Escanear → Monitor)

> 🔴 **Crítico** · Backend + Frontend · **Documentado, pendiente de implementar** (decisión del usuario: solo documentar por ahora).

### Contexto
Las credenciales SSH de los equipos Ubiquiti **se usan en todo el sistema**: se descubren al **escanear**, luego se reutilizan para **monitorear** (Monitor AP), para el **diagnóstico/Estado** de antena y para **ping**. La auditoría revela que la mitad del sistema se endureció (Monitor AP, §C4 del HANDOFF) y la otra mitad (Escanear/NetworkDevices) **no**.

### Mapa real de la credencial (verificado)

| Flujo | Endpoint | Credencial | IP destino | Propiedad |
|---|---|---|---|---|
| Monitor AP (poll/enrich) | `poll-direct`, `cpes/enrich-batch` | **server-side** DB cifrada (ignora body) ✅ | DB ✅ | `ownsApUuid` ✅ |
| Guardar/editar/borrar device | `POST/PUT/DELETE /db/devices` | cifra al guardar (AES-GCM) ✅ | — | `ownsApUuid` ✅ |
| **Estado/diagnóstico antena** | `POST /device/antenna` | **prefiere body** (caché plano); cae a DB solo si body vacío ⚠️ | **`deviceIP` del body** ⚠️ | **ninguna** ⚠️ |
| **Auto-login (escaneo)** | `POST /device/auto-login` | body; **devuelve el pass que funcionó** ⚠️ | body ⚠️ | **ninguna** ⚠️ |
| Ping device | `POST /device/ping` | — | `ip` del body ⚠️ | ninguna |

### Almacenamiento
- **Server (autoritativo, bien):** `aps.clave_ssh_enc`, `aps.wifi_password_enc`, `node_ssh_creds.ssh_pass_enc` → **AES-256-GCM** (`encryptPass`). `GET /db/devices` solo devuelve `sshUser` + `hasSshPass` (nunca el claro).
- **Cliente (texto plano) ⚠️:**
  - IndexedDB `device_credentials_cache` (`store/deviceDb.ts:23`, localforage) → `{ user, pass, port }` sin cifrar.
  - `sessionStorage` `SESSION_SCAN_KEY` (`useDeviceScan.ts:154`) → `results` incluye `sshUser`/`sshPass` sin cifrar.
  - Inconsistencia: el **JWT sí se cifra** en IndexedDB (`store/db.ts` `encryptText`), las claves SSH de equipos no.

### Riesgos
1. **SSRF (lo más serio):** `/device/antenna`, `/device/auto-login`, `/device/ping` aceptan **IP del body sin `ownsApUuid`**, montados solo con `verifyToken` → cualquier sesión autenticada (incluido un **MEMBER**) puede hacer que el servidor haga SSH/ping a **cualquier IP** con **cualquier credencial**. Misma clase que C2/C4 (cerrada en Monitor AP, abierta aquí).
2. **Dependencia del caché plano:** `/device/antenna` prefiere `devicePass` del cliente; el navegador siempre lo manda (sacado del caché plano). Por eso existe el caché en claro.
3. **`/device/auto-login` devuelve la contraseña** que funcionó al cliente → alimenta el caché plano.
4. **Comentario inexacto:** `deviceDb.ts:7,15` ("NO viaja al servidor") es falso: `saveSingle` paso 3 envía `sshPass` a `/api/db/devices` (donde sí se cifra).

### Fix aplicado (convergencia con Monitor AP, no parche)
**✅ Fase 1 — Backend / SSRF (P0) — HECHO:**
- Nuevo helper `ipInOwnedSubnet(db, req, ip)` en `lib/tenantScope.js` (admin → libre; resto → la IP debe caer en una subred `segmento_lan`/`lan_subnets` del workspace).
- `/device/antenna`: con `deviceId` resuelve **IP + credencial server-side** del `aps` propio (`ownsApUuid`), **ignora** `deviceIP`/`devicePass` del body; sin `deviceId` (escaneo) exige `ipInOwnedSubnet(deviceIP)`. Cae al pass del body solo si el AP no tiene credencial guardada.
- `/device/auto-login`: exige `ipInOwnedSubnet(ip)` antes de sondear SSH.
- `/device/ping`: **no existe como ruta** (llamada legacy en `deviceService.ts`); sin acción.

**✅ Fase 2 — Caché cliente — HECHO (parcial):**
- `credCache` (IndexedDB) **cifra la contraseña en reposo** con `encryptText` (AES-GCM, mismo esquema que el JWT) + migración compat de entradas legacy en claro. `deviceDb.ts`.
- Comentario inexacto ("NO viaja al servidor") corregido.
- ⏳ *Pendiente menor:* el caché de escaneo en `sessionStorage` (`SESSION_SCAN_KEY`) aún guarda el `sshPass` del resultado en claro (dato transitorio por sesión). Strippearlo/cifrarlo requiere volver async el persist/load de `useDeviceScan` — follow-up de bajo riesgo.

**✅ Fase 3 — Tests — HECHO:** `deviceSecurity.test.js` (6 tests, espejo de `apMonitorSecurity`): resolución server-side + ignora body, AP ajeno → 404, escaneo fuera de subred propia → 403 en `/device/antenna` y `/device/auto-login`.

---

### Apéndice — ¿reutilizar ND libres?
Hoy `nextNode = maxNd+1` nunca reutiliza huecos (borrar ND3 deja el 3 muerto para siempre). Es defendible para trazabilidad histórica, pero si el catálogo crece y se borran nodos, conviene decidir explícitamente: ¿numeración monótona (actual) o reutilización del menor libre? Recomiendo **mantener monótona** y documentarlo, para no reciclar identificadores que aparecen en logs/comentarios del router.
