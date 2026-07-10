# 🔧 02 — Referencia de funciones

> Qué hace **cada función** relevante, su entrada/salida y dónde vive. Organizado por archivo. Las funciones marcadas con ✓ fueron verificadas leyendo el código; las de módulos auxiliares se describen a nivel de export.
> Volver al [índice](./00_Indice_y_Trazabilidad.md) · ver también [01 — Tipos de usuario](./01_Tipos_de_Usuario.md).

---

## A) Núcleo de conexión al router — `server/routeros.service.js`

La **única** puerta al MikroTik. Todo módulo que toque el router pasa por aquí. ([routeros.service.js](../../server/routeros.service.js))

| Función | Firma | Qué hace |
|---|---|---|
| ✓ `connectToMikrotik` | `(host, user, password) → Promise<api>` | Conecta a la API RouterOS. Intenta **:8728** (plain); si es rechazado activamente (`ECONNREFUSED`), reintenta **:8729** (SSL, `rejectUnauthorized:false` por el cert autofirmado de fábrica). Devuelve la conexión con un guard de errores adjunto. |
| ✓ `connectWithDeadline` | `(opts) → Promise<api>` | Envuelve `new RouterOSAPI().connect()` en un **deadline duro de 9s** (`CONNECT_DEADLINE_MS`): si vence, **destruye el socket** y rechaza. Necesario porque el `timeout` de `node-routeros` NO dispara durante el login (§4.17). |
| ✓ `safeWrite` | `(api, commands, timeoutMs=6000) → Promise<rows>` | Ejecuta un comando con timeout propio. Normaliza `!empty` (print sin filas) a `[]`. Actualiza la señal de salud y las métricas (`routeros_writes_total`, `routeros_errors_total`). |
| ✓ `writeIdempotent` | `(api, commands, timeoutMs=8000) → Promise` | Como `safeWrite` para `/add`, pero **ignora** errores de duplicado (`already have`, `already exists`). ⚠️ NO sirve para `/ip/route/add` (RouterOS no lanza "already have" en rutas → usar `addRouteOnce`, §4.26). |
| ✓ `getErrorMessage` | `(error, ip, user) → string` | Traduce errores crudos a mensajes accionables (puerto rechazado, timeout, host inalcanzable, credenciales). |
| ✓ `isUnreachable` | `(error) → boolean` | ¿El router no es alcanzable (vs error de lógica)? Cubre timeout, refused, host/red caída y cortes transitorios (`ECONNRESET`/`EPIPE`/`EHOSTDOWN`/`socket hang up`). La capa HTTP lo usa para devolver **503** y mostrar el overlay "Reintentar" (§4.11). |
| ✓ `cleanTunnelRules` | `(api) → number` | Borra mangles legacy globales (`ACCESO-ADMIN`/`ACCESO-DINAMICO`). Devuelve cuántas eliminó. |
| ✓ `parseHandshakeSecs` | `(str) → number` | Convierte `last-handshake` ("1m30s") a segundos (`Infinity` si nunca). |
| ✓ `getLastSafeWriteOkAt` | `() → number\|null` | Epoch ms del último `safeWrite` OK — lo usa `/api/health` para clasificar `routeros: ok/stale/down`. |
| ✓ `classifyError` (interna) | `(err) → 'timeout'\|'refused'\|'login'\|'network'\|'unknown'` | Etiqueta para la métrica de errores. |
| ✓ `attachErrorGuard` (interna) | `(api, host) → api` | Adjunta un handler `error` para que un corte del socket **después** del connect no escape como `uncaughtException`. |

**Parches a `node-routeros` v1.6.9** (al cargar el módulo): redirige replies desconocidos (`!empty`, `!xxx`) y tags ya cerrados (`UNREGISTEREDTAG`) a un `trap` sintético, en vez de lanzar síncronamente y tumbar el proceso. Cubierto por `test/unit/routerosPatches.test.js`.

---

## B) Mangle y aislamiento por-usuario — `server/lib/tunnelProvisioner.js`

Crea/lee/borra las reglas mangle que aíslan a cada usuario y al escaneo. **Lecturas y escrituras en conexiones separadas** (disciplina node-routeros). ([tunnelProvisioner.js](../../server/lib/tunnelProvisioner.js))

| Función | Qué hace |
|---|---|
| ✓ `userTag(userId)` | Etiqueta corta y estable del usuario para el comment. |
| ✓ `mangleComment(userId)` | `ACCESO-USER-<tag>` — comment único de la mangle de acceso del usuario. |
| ✓ `scanMangleComment(workspaceId)` | `SCAN-WS-<tag>` — comment de la mangle de escaneo del workspace (namespace separado). |
| ✓ `vrfExists(api, vrfName)` | ¿Existe el VRF? **Lanza** si el print falla (fail-closed). |
| ✓ `readMangles(api)` | Lee la tabla mangle una vez (para combinar búsquedas sin N prints). |
| ✓ `findUserMangleIds(api, userId)` | `.id` de las mangle del usuario (por comment). |
| ✓ `findScanMangleIds(api, workspaceId)` | `.id` de las mangle de escaneo del workspace. |
| ✓ `findLegacyGlobalMangleIds(api)` | `.id` de mangles GLOBALES legacy (`ACCESO-ADMIN`/`ACCESO-DINAMICO`) — se eliminan para que no rompan el aislamiento (§4.3). |
| ✓ `hasUserMangle(api, {userId,mgmtIp,vrfName})` | ¿Existe ya la mangle del usuario para ese VRF? (usado por keepalive). |
| ✓ `removeMangleIds(api, ids)` | Borra una lista de `.id`. Si **algún** borrado falla, **lanza** (con `.failed`/`.removed`) para que el caller no asuma que revocó el acceso. |
| ✓ `addUserMangle(api, {userId,mgmtIp,vrfName})` | Crea la mangle de acceso: `chain=prerouting action=mark-routing src-address=<mgmtIp> dst-address-list=LIST-NET-REMOTE-TOWERS new-routing-mark=<vrf> comment=ACCESO-USER-<tag>`. |
| ✓ `addScanMangle(api, {workspaceId,scanIp,vrfName})` | Igual pero `src-address=<scanIp>` y `comment=SCAN-WS-<ws>` (Opción C). |

> Filtros puros (testables sin router): `filterUserMangleIds`, `filterLegacyGlobalMangleIds`. Cubiertos por `test/unit/mangleFilters.test.js`.

---

## C) Ciclo de vida del escaneo — `server/lib/scanMangle.js` + `scanTarget.js`

**`scanMangle.js`** ([archivo](../../server/lib/scanMangle.js)):
- ✓ `setup({workspaceId, scanIp, vrfName, mikrotik})` — antes de escanear: verifica que el VRF existe, borra la scan-mangle previa del workspace y crea la nueva (`src=scanIp → VRF`). **Lanza** si el VRF no existe o el router falla → el caller aborta el escaneo.
- ✓ `teardown({workspaceId, mikrotik})` — al terminar: borra la scan-mangle del workspace. **Best-effort** (no lanza; el próximo `setup` la reemplaza igual).

**`scanTarget.js`** ([archivo](../../server/lib/scanTarget.js)):
- ✓ `resolveScanTargetVrf({db, sessionRepo, workspaceId, userId, nodeLan})` → `{owns, vrf}` — resuelve **qué VRF escanear** para una LAN. Con LANs solapadas entre nodos, **prefiere el VRF de la sesión activa del usuario**; si no hay, cae al primer nodo que posee la subred. `owns=false` → la LAN no pertenece a ningún nodo del workspace (→ 403).
- ✓ `lanSetOf(row)` — normaliza `segmento_lan` + `lan_subnets` (JSON) a un `Set`.

---

## D) Baja de nodo — `server/lib/nodeDeprovision.js`

✓ `deprovisionNodeOnRouter(creds, {pppUser, vrfName, protocol})` → `{steps}` ([archivo](../../server/lib/nodeDeprovision.js)). Fuente de verdad **única** de la limpieza en el router, usada por `POST /node/deprovision` y por la cascada de borrado de moderador. Detecta WG vs SSTP, lee todo en una conexión y borra en otra (best-effort, cada fallo se loguea y continúa). Orden de borrado:

1. **Mangle** (`new-routing-mark === vrfName`).
2. WG: **peers** → **IP address** → **interfaz WG** → **interface-lists** (`LIST-VPN-TOWERS`+`LIST-VPN-WG`). · SSTP: **sesión PPP activa** → **PPP secret** → **interfaz SSTP** → **interface-lists** (`+LIST-VPN-SSTP`).
3. **Rutas** del `routing-table` del VRF (ida + retorno).
4. **VRF**.

⚠️ NO toca `LIST-NET-REMOTE-TOWERS` (§4.13) ni la BD (el caller borra las filas).

---

## E) Plano de red — `server/lib/mgmtNet.js` + `mgmtAllowedIps.js`

**`mgmtNet.js`** — fuente de verdad del plano `10.x` ([archivo](../../server/lib/mgmtNet.js)). Exporta los objetos `vps`/`clients`/`admin`/`nodes` (cada uno con `iface`/`net`/`base`/`port`, parametrizables por env) y:
- ✓ `nodeMgmtIp(ndNum, isWG)` → IP única del nodo: WG `10.11.250.<ND>` / SSTP `10.11.251.<ND>`. `null` si ND<2.
- ✓ `returnRoutes()` → `[{subnet, gateway, tag}]` de las 3 rutas de retorno de gestión (CLIENTES/ADMIN/VPS) que cada VRF necesita.
- ✓ `isMgmtIp(ip)` → ¿la IP pertenece a un plano de gestión reclamable (CLIENTES/ADMIN)?
- Constantes: `mgmtAllowedIps` (base RFC1918, **nunca** `0.0.0.0/0`), `ifaces`, `userIfaces`, `allNets`.

**`mgmtAllowedIps.js`** ([archivo](../../server/lib/mgmtAllowedIps.js)):
- ✓ `mgmtAllowedIpsFor(workspaceId, {addressList})` → string de AllowedIPs split-tunnel = base RFC1918 + LAN **públicas** de torre (las privadas ya las cubre la base). Lee las LAN del workspace en BD y, opcionalmente, del address-list del router.
- ✓ `readTowerLans(api, safeWrite, listName)` → CIDRs de `LIST-NET-REMOTE-TOWERS` (autoritativo, incluye nodos sin `workspace_id`).

---

## F) Provisión (alta/baja) — `server/routes/nodes/provision.routes.js`

Orquesta el alta server-side ([archivo](../../server/routes/nodes/provision.routes.js)). Endpoints: `POST /node/next` (preview), `POST /node/provision` (alta WG/SSTP), `POST /node/deprovision` (baja). Helpers:

| Función | Qué hace |
|---|---|
| ✓ `computeNextAllocation(api)` | Calcula el **siguiente ND libre** y la IP remota leyendo los VRF vivos. Lo comparten preview y commit (cierra el TOCTOU). |
| ✓ `addRouteOnce(api, {dst,gateway,routingTable,comment,distance})` | Añade una ruta **solo si no existe** (verifica `?dst-address`+`?routing-table`). Imprescindible: RouterOS trata `/ip/route/add` duplicado como ECMP (§4.26). |
| ✓ `addMgmtReturnRoutes(api, vrf, ndComment)` | Añade las 3 rutas de retorno de gestión al VRF (`distance=2`). |
| ✓ `addScanReturnRoute(api, vrf, ndComment)` | Añade la ruta de retorno del scan-pool al VRF (`distance=2`, best-effort). |
| ✓ `addTowerEntries(api, addresses, comment)` | Añade direcciones a `LIST-NET-REMOTE-TOWERS` **sin duplicar** (lee la lista una vez). |
| ✓ `rollbackProvision(creds, {...})` | Rollback H4: si un paso del alta falla, borra **solo** lo que esta llamada creó (por nombre/comment); el VRF solo si `vrfCreatedByUs`. |
| ✓ `autosyncWg0(subnets)` | Registra la(s) LAN nueva(s) en la intención del `wg0` (best-effort, `setImmediate`, §4.27). |

**Pasos del alta WG** (resumen): interfaz WG → (sin IP de transporte) → peer (allowed = IP/32 + LAN) → interface-lists → VRF (crea o merge) → rutas (LAN dist 1 + retorno/scan dist 2 + IP/32) → address-list → guardar en BD (con `wg_cpe_private_enc` AES-GCM) → script CPE → autosync wg0.
**Pasos del alta SSTP:** PPP secret → interfaz SSTP → interface-lists → address-list → VRF → rutas (LAN + retorno; **sin** /32, el PPP la da dinámica) → BD (con `ppp_password_enc`) → script CPE → autosync wg0.

---

## G) Generador del script del CPE — `server/lib/cpeScript.js`

Única fuente del `.rsc` que se pega en el MikroTik de la torre ([archivo](../../server/lib/cpeScript.js)):
- ✓ `buildCpeWgScript({nodeNum, nodeMgmt, serverPublicKey, serverPublicIP, wgPort, returnNets, cpePrivateKey})` → `{script, cpeSteps}`. Crea la interfaz `WG-CORE-ISP` (con la privada embebida si se autogeneró), asigna la IP `/32` del nodo, agrega el peer (endpoint del Core + `persistent-keepalive=25s`) y una ruta de retorno por cada red de gestión/scan.
- ✓ `buildCpeSstpScript({pppUser, pppPassword, serverPublicIP, sstpPort})` → `{script, cpeSteps}`. Bloque idempotente que crea/actualiza `sstp-out1` (`connect-to`, `mschap2`, `tls-version=only-1.2`). Solo añade `:<puerto>` si difiere de 443.

---

## H) Seguridad y sesión

| Archivo | Funciones |
|---|---|
| `server/lib/jwt.js` | ✓ `signSession(payload)` (firma JWT 8h) · `verifySession(token)` · `setSessionCookie(res, token)` / `clearSessionCookie(res)` (mismos atributos para que borre) · `cookieBaseOptions()` (HttpOnly, sameSite=lax, secure en prod). ([archivo](../../server/lib/jwt.js)) |
| `server/auth.middleware.js` | ✓ `verifyToken(req,res,next)` (cookie → Bearer → 401/403; pone `req.account`) · `injectMikrotik(req)` (carga `MT_*` cifradas a `req.mikrotik`) · genera/lee `.jwt_secret` en `DATA_DIR`. ([archivo](../../server/auth.middleware.js)) |
| `server/lib/crypto.js` | ✓ `encrypt(plaintext)` / `decrypt(stored)` — envoltura de `encryptPass`/`decryptPass` (AES-256-GCM `iv:authTag:ciphertext`, clave `.db_secret`). ([archivo](../../server/lib/crypto.js)) |
| `server/lib/ipAlloc.js` | ✓ `lowestFreeOctet(used, start, end=254)` — **menor** octeto libre (reutiliza huecos, §4.14). ([archivo](../../server/lib/ipAlloc.js)) |
| `server/lib/rateLimit.js` | Rate limit de login (`RL_MAX_FAILS`/`RL_WINDOW_MS`, tabla `auth_attempts`). |
| `server/lib/routeGuards.js` | `requireMikrotik(req)` (exige `req.mikrotik` o lanza) y guards de ruta. |
| `server/lib/tenantScope.js` | Helpers de aislamiento por `workspace_id` (lectura). Cubierto por `tenantScope.test.js`. |

---

## I) Resolución de IPs y detección — `mgmtIpResolver.js`, `wgDetect.js`, `wg0Sync.js`, `wgkeys.js`, `sstpCreds.js`

| Archivo | Qué expone |
|---|---|
| `lib/mgmtIpResolver.js` | Resuelve la `mgmt_ip` del usuario desde su **peer vivo** (admin→ADMIN, OWNER/MEMBER→su `member_wireguard` en CLIENTES) cuando falta el mapeo — auto-cura del 409 `NO_MGMT_IP` (§4.23). Cubierto por `mgmtIpResolver.test.js`. |
| `lib/wgDetect.js` | Detección **read-only** de IPs WireGuard locales por plano (vía `mgmtNet`). Alimenta la alerta de scan-IP obsoleta en modo local (`409 LOCAL_SCAN_IP_STALE`). |
| `lib/wg0Sync.js` | `appendWg0Intent(path, cidrs)` → escribe CIDRs nuevos en el archivo de intención del `wg0` (idempotente: solo si la LAN es nueva). El watcher root del host la aplica. Cubierto por `wg0Sync.test.js`. |
| `lib/wgkeys.js` | `generateKeyPair()` → `{publicKey, privateKey}` WireGuard. Cubierto por `wgkeys.test.js`. |
| `lib/sstpCreds.js` | `generatePppUser(name, nd)` (usuario determinístico) + `generatePppPassword()` (segura). Cubierto por `sstpCreds.test.js`. |

---

## J) Servicios de integración

- **`server/ubiquiti.service.js`** — SSH a antenas airOS (`ssh2` con kex legacy) + probe del scanner. Funciones clave: `sshExec(opts)` (acepta `localAddress` para atar a la scan-IP), `probeUbiquiti` / `probeStatusCgi` / `getSSHBanner`, `CIDR_REGEX`. Detecta **solo** Ubiquiti airOS (§4.28).
- **`server/db/mysql.js`** — pool `mysql2` (`connectionLimit`, `acquireTimeout` con `Promise.race`), `query()`, `withTransaction()`, `startMonitor(ms)` (salud de MySQL para `/api/health`).
- **`server/db.service.js`** — `initDb()` (aplica `schema_ops.sql`), `getDb()`, `getAppSetting`/`saveNode`/`deleteNode`, y la cripto base `encryptPass`/`decryptPass` (AES-256-GCM, clave `.db_secret`).

---

## K) Repositorios — `server/db/repos/`

Un repo por agregado. Patrón: params `?`, transacciones `*InTx`, asignación por menor octeto libre.

| Repo | Responsabilidad / funciones notables |
|---|---|
| `scanIpRepo.js` | scan-IP por workspace. `allocateInTx(...)` (asigna al crear el workspace), `resolveForWorkspace(ws)` (server-side, anti-spoofing), `poolSubnet()`, `poolStart/End`. |
| `sessionRepo.js` | Sesiones de túnel. `createSession(...)` (tx: cierra ACTIVE previa), `getActiveByUser(ws, user)`. |
| `mgmtIpRepo.js` | `user_mgmt_ips`. `upsert(...)` (gate de `tunnel/activate`; `source` es ENUM — §4.23), getters por usuario. |
| `memberWgRepo.js` | Peers WG de members/moderadores (`member_wireguard`). |
| `memberRepo.js` | Miembros del workspace (`workspace_members`). |
| `workspaceRepo.js` | `createForOwner(...)` (crea workspace + amarra scan-IP), getters. |
| `invitationRepo.js` | Invitaciones (crear, listar pendientes, regenerar enlace). |
| `assignmentRepo.js` | `tunnel_assignments` (qué túneles ve un MEMBER). |
| `userRepo.js` / `auditRepo.js` / `notificationRepo.js` / `monitoringRepo.js` / `passwordResetRepo.js` | Usuarios, auditoría append-only, notificaciones, monitoreo, reset de contraseña (`passwordResetRepo.test.js`). |

---

## L) Jobs de fondo (arrancan en `index.js` → `app.listen`)

| Job | Archivo | Qué hace | Toggle |
|---|---|---|---|
| Expiración de túneles | `lib/expirationJob.js` | Cierra sesiones de túnel vencidas. | `EXPIRATION_JOB_ENABLED` |
| Monitoreo | `lib/monitoringJob.js` | Recolecta señal/estado periódico. | `MONITORING_ENABLED` |
| Polling de APs | `lib/apPollJob.js` | Monitor AP: agrupa APs por VRF, conmuta la mangle de la scan-IP por grupo, SSH atado a `localAddress`; usa `scanLock.tryAcquire` (no bloqueante, §4.16). | `AP_POLL_ENABLED` |
| Métricas de dashboard | `lib/dashboardMetrics.js` | Agrega métricas para el dashboard del admin. | — |
| Bot Telegram | `lib/telegramBot.js` | Long-polling; vinculación `/link CODE`. | `TELEGRAM_BOT_ENABLED` |

Observabilidad: `lib/metrics.js` (prom-client, `GET /metrics` loopback-only) · `lib/logger.js` (pino, redacta `Authorization`/`Cookie`).

---

## M) Frontend — `vpn-manager/src/`

| Pieza | Archivo | Qué hace |
|---|---|---|
| Bootstrap | `App.tsx` | `VpnProvider` + `WorkspaceSessionProvider` + Suspense único; decide módulo por rol (`SettingsModuleRouter`). |
| Estado global | `context/` (`VpnContext`, `WorkspaceSession`) | Sesión, módulo activo, credenciales; cachés por workspace. |
| Permisos | `utils/permissions.ts` | `visibleModules`, `isPlatformAdmin`, `isModerator`, `roleLabel`, `canInvite`… (ver doc 01). |
| Config de red | `config.ts` | Espejo en frontend del plano `10.x` (fuente de verdad: `mgmtNet.js`). |
| Tipos | `types/*` | Re-export de `@gestionvpn/contracts`. |
| Módulos (lazy) | `components/<Dom>/<Modulo>/` | `AdminDashboard`, `ModeratorsModule`, `NodeAccessPanel`, `TeamModule`, `NetworkDevicesModule`, `ApMonitorModule`, `Settings*`. |
| Deep-links del bot | `context/hooks/useDeepLinks.ts` | Captura `?activate=VRF` / `?deactivate=1` del bot y los ejecuta tras login. |

> Patrón de extensión (módulo nuevo): `React.lazy` en `App.tsx` dentro del Suspense único; lógica en `hooks/`, presentación en `components/`, dropdowns sobre tablas en **portal** (`useKebabMenu`, §4.22).

---

> Siguiente: [03 — Configuración del servidor VPN (MikroTik)](./03_Config_Servidor_VPN_MikroTik.md).
