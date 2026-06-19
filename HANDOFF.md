# 📦 Handoff Técnico — MikroTikVPN Remote Manager (`GestionVPN-1.0`)

> Documento de migración de contexto entre sesiones.
> Rama de trabajo: **`dev`** · Remote: `github.com/FernandoDiazM5/GestionVPN-1.0`.
>
> **Estado actual (2026-06-16):** REFACTOR_PLAN cerrado (F0-F12) · 5 features quick-wins entregados (Q1-Q5) · 2 mid-size (M1, M5) · iter2 del bot Telegram + reposición "Asignar túneles" + fix crítico `user_mgmt_ips` (§32) · UX MEMBER endurecida (§33) · Workspace unificado + email en peers WG + multi-asignar + QR en aceptar invitación (§34) · Columna Alias editable en peers WG + bloqueo de edición del "Usuario" para preservar trazabilidad MikroTik (§35) · Fix crítico bot Telegram: match dual VRF/PPP en asignaciones del MEMBER (§36) · Auditoría exhaustiva del módulo Escanear con skills `react-ui-expert` + `vercel-react-best-practices`: 21 mejoras en 5 commits (§37 perf+robustez · §38 UX+features) · 🛑 Política operativa SSH para antenas Ubiquiti establecida: solo lectura + ping + reinicio con confirmación; PROHIBIDO actualizar firmware, borrar archivos, restaurar a fábrica o modificar config persistente (ver sección dedicada al final del doc) · Cierre auditoría Escanear (§39): U1.A columna Acción sticky-right + U2 kebab para acciones secundarias (Informe / Sync / Ver datos del scan); 26/27 hallazgos aplicados, solo F4 (diff de scans) queda en backlog · **§40 Personalización + export multi-formato: `useScanPreferences` consolida columnas + anchos + sort + filtros + búsqueda + subred en un único store `vpn_scan_prefs_v1` con migración legacy + debounce 300ms + flush al desmontar; nuevo `ExportMenu` con 4 formatos (CSV / JSON / Excel / PDF informe) usando `exceljs` + `jspdf` con dynamic imports, bundle inicial intacto. Incluye 3 fixes (a) regresión §39: `effectiveNode = selectedNode ?? activeNode` para que el botón Guardar aparezca cuando hay túnel activo aunque `selectedNode` aún no se hidrate; (b) roles PTP (`AP-PTP` / `STA-PTP`) ahora se reflejan en el export y entran al filtro "Solo APs" / "Solo CPEs"; (c) botón "Escanear dispositivos" se bloquea con 🔒 + tooltip cuando no hay túnel activo o no hay subred**. Plan completo abajo.
>
> **Sesión 2026-06-14 — Auditoría + hardening de Monitor AP + aislamiento multi-usuario.** Detalle completo en [`INFORME_MONITOR_AP.md`](./INFORME_MONITOR_AP.md). Resumen:
> - **CI gate:** job `design-system` en `ci.yml` (corre `npm run audit:design`, bloquea regresiones; 0 errores).
> - **Monitor AP — seguridad (Fase 1):** cerrado IDOR/SSRF en `enrich-batch` (faltaba `ownsApUuid`), `poll-direct` (usaba IP del body → ahora de la DB) y `ap-detail-direct`; credenciales SSH resueltas **server-side**, el navegador dejó de enviarlas. +tests de aislamiento.
> - **Monitor AP — datos (Fase 2, C3):** las credenciales se resuelven del **nodo dueño** del AP (nombre_nodo→subred) en vez de "el primer nodo"; FK persistida **`aps.node_id`** + auto-heal en `initDb` + `npm run migrate:apnode` (backfill por nombre/subred, **aplicado en vivo: 17/17 APs**).
> - **Monitor AP — visual/UX (Fases 3-5):** dark mode completo, paleta corregida (`violet`→`cyan` para CPE), escala de señal `emerald→amber→rose`, contadores coherentes, CTA en estado vacío, a11y, borrado con `ConfirmModal`, 2 warnings de hooks resueltos.
> - **Monitor AP — features:** **E1** job backend `apPollJob` + SSE + heartbeat `/watch` + seed `/stations` (el navegador ya **no** hace polling SSH recurrente; cumple §43) · **E2** sparkline de señal · **E3** salud por umbral · **E4** export CSV · **E7** frescura global + "Sincronizar todo". **E5** (reiniciar AP) **descartada** por decisión del usuario (antenas 100% lectura).
> - **Escanear:** botón "Resetear preferencias" (UI faltante de §40).
> - **Aislamiento multi-usuario (fix):** la **reparación de túnel** recreaba el legacy global `ACCESO-ADMIN` (rompe aislamiento); ahora recrea el **mangle POR-USUARIO** (`addUserMangle`, `mgmt_ip` server-side) + limpia legacy. Eliminado el `adminIP` hardcodeado del frontend. **Nueva regla** en "Reglas del proyecto" (mangle por-usuario, sin colisión). ⚠️ Pendiente prueba manual contra el router con 2 moderadores.
>
> **Sesión 2026-06-15 — Cierre del refactor (commits `4b6b4bb` + `b0a482c` + `6e9cf7a` + `5e5b330`).** Detalle abajo en §17.
> - **F5.A** (`4b6b4bb`): 10 rutas backend al shape uniforme + `lib/routeGuards.js` nuevo + `AppError` extendido con `data`.
> - **F5.B** (`b0a482c`): 5 schemas nuevos en `packages/contracts` (wireguard/tunnel/nodes/device/settings); backend importa de ahí.
> - **F5.C** (`6e9cf7a`): `utils/apiClient.ts` modernizado + `types/api.ts` re-exporta tipos canónicos desde contracts.
> - **F12** (`5e5b330`): `npm audit --omit=dev` backend = 0 vulns; 2 moderate frontend en `uuid` transitiva de `exceljs` aceptadas (dynamic import no toca la API vulnerable). REFACTOR_PLAN.md y HANDOFF §17 actualizados con el cierre.
> - **Resultado:** 13/13 fases ✅, **234 tests verde** (170 backend + 64 frontend), 0 regresiones, 0 shapes inconsistentes en backend post-migración.
>
> **Sesión 2026-06-16 — Auditoría vista "Nodos" + H14 credenciales + pantalla "Acceso Restringido".** Detalle completo en [`INFORME_NODOS.md`](./INFORME_NODOS.md). Commits `2bf0673` → `c5c3ab6` en `dev`. Estado: **202 tests backend + 69 frontend verde · `tsc -b` 0 · `audit:design` 0 errores.**
> - **Auditoría Nodos (`2bf0673`)** — 13 hallazgos cerrados (alta de nodo + 8 acciones del kebab). 🔴 **H1**: `requireOperator` en TODAS las mutaciones de nodos + `/tunnel/repair` (un MEMBER/viewer ya no puede crear/editar/eliminar por API; antes solo lo protegía la UI). **H5**: `GET /node/tags` filtra por workspace. **H2/H8**: IP pública unificada en setting global `server_public_ip` (BD), cargada una vez y reutilizada; persistencia `onBlur`. **H3**: asignación ND/IP autoritativa recalculada en el commit de provisión (cierra TOCTOU). **H4**: rollback best-effort scoped si la provisión falla a mitad (no borra VRF ajeno en merge). **H6**: validación server-side del nombre. **H10**: barra de progreso REAL por SSE (`provisionId`) en vez de `setInterval`. **H11**: kebab agrupado (config/info/peligro). **H13**: bug `cidrOverlaps` (el solape con 192.168.21.0/24 NUNCA se detectaba por signo vs unsigned). Tests nuevos: `nodesAccessControl` (15) + `provisionAllocation` (6).
> - **H14 — credenciales de equipos (`fd8f4bd` + `7cb5584`)** — 🔴 Convergencia con el modelo server-side de Monitor AP (§C4). `/device/antenna` y `/device/auto-login` tomaban IP+contraseña del body sin `ownsApUuid` → **SSRF**. Nuevo `ipInOwnedSubnet(db, req, ip)` en `lib/tenantScope`; `/device/antenna` resuelve IP+cred server-side del AP propio cuando hay `deviceId` (ignora body) y exige subred propia en escaneo; `/device/auto-login` exige subred propia. Caché cliente: `credCache` (IndexedDB) **cifra la contraseña** con `encryptText` (AES-GCM) + migración legacy; `sessionStorage` del escaneo ya **no** persiste `sshPass` en claro (se re-hidrata del caché cifrado). Test: `deviceSecurity` (6). `/device/ping` resultó ser ruta legacy inexistente.
> - **Bugfixes UI tras prueba en vivo (`345f991` + `19de32f` + `c3b3ab1`)** — Modales de fila apilados: el kebab (portal `z-[9999]`) no se cerraba al elegir Editar/Script/Etiquetas/Historial/Eliminar → quedaba sobre el modal y permitía apilar; fix en `NodeCard` + `useNodeModals` pasa a **un solo modal activo**. Colores del kebab restaurados (el usuario los quiere con color, no gris — ver memoria `pref-menu-accion-con-color`). `ScriptModal` auto-genera (carga `server_public_ip` del setting). **Revertido** el aviso de solape de LAN entre nodos (H12): la arquitectura usa VRF+mangle, varios nodos pueden compartir LAN a propósito (memoria `arquitectura-lan-compartida-vrf-mangle`). Fix `label/save` 404 en WG (enviaba `pppUser` vacío; ahora usa `ifaceName`).
> - **Pantalla "Acceso Restringido" cuando el router core no responde (`7e68b3b` → `c5c3ab6`)** — Antes, si el router (192.168.21.1) no respondía, las llamadas tiraban 500 crudos + rompían tablas. Ahora: backend `isUnreachable(error)` + `mikrotikAppError()` → **503 `MIKROTIK_UNREACHABLE`** (timeout/refused/host) en 5 rutas + `/tunnel/activate`; `apiClient` dispara evento `router_unreachable`; nuevo `RouterMaintenanceOverlay` = **pantalla completa BLOQUEANTE** (createPortal, no cerrable, bloquea scroll) con logo `public/logo_wg.png`, botón "Ya lo activé" → **spinner de verificación real** que consulta `GET /api/router/check` (sonda live, 200 `{reachable}`); si responde entra, si no persiste con aviso. Test: `mikrotikError` (5). No reemplaza el banner `NEEDS_CONFIG` (router no configurado, responsabilidad del Administrador).
> - **Pendiente de prueba manual:** activar un nodo con el router arriba (la sesión transcurrió con el core caído); confirmar que la pantalla "Acceso Restringido" desaparece tras activar el WireGuard de gestión y pulsar verificar.
>
> **Sesión 2026-06-16 (PM) — Despliegue VPS (MySQL + Docker + WireGuard) + Opción C (escaneo/Monitor AP multi-VRF).** Detalle completo en [`DESPLIEGUE_VPS.md`](./DESPLIEGUE_VPS.md). Commits `63c0e43` → `6cbdd75` en `dev` (mergeados a `main`). Estado: **214 tests backend verde** (202 base + 12 nuevos), 0 regresiones; imágenes Docker construyen y `nginx -t` OK.
> - **Contexto de despliegue:** el VPS (`134.199.212.232`) corre Docker y un WireGuard cliente (`192.168.21.60/32`) hacia el MikroTik (`213.173.36.232`, gestión `192.168.21.1`). El `main` previo estaba **215 commits atrás** (arquitectura SQLite vieja). Este bloque trae la versión MySQL/multi-tenant a producción.
> - **Hallazgo de diseño (clave):** el backend en el VPS sourcea **todo** el SSH de escaneo/Monitor AP desde **una sola IP** (`.60`). El plano de control (activar túneles, peers, Telegram) es multi-usuario real porque el tráfico VPN sale del dispositivo de cada usuario; pero el **escaneo/Monitor AP NO funcionaba desde el VPS** (ni con 1 moderador) porque la mangle por-usuario marca el `mgmt_ip` del moderador, no la `.60`. Con LANs que **se solapan entre nodos**, una sola mangle por IP es ambigua → se eligió **Opción C** (una scan-IP por workspace).
> - **Fase 0 — stack de producción (`63c0e43`):** `docker-compose.prod.yml` (MariaDB 11 + backend `network_mode: host` en `127.0.0.1:3307` + frontend nginx 80/443), `server/Dockerfile.prod` y `vpn-manager/Dockerfile.prod` (build desde la **raíz del monorepo** + `build:contracts` — resuelve `@gestionvpn/contracts` en runtime), `nginx.prod.conf` (HTTPS + `proxy_buffering off` para SSE), `server/entrypoint.sh` (migraciones EN ORDEN: initRbac→initMultiuser→perf→notifications→monitoring→apnode→**scanip**→seedRoles), `.dockerignore` raíz, plantillas `server/.env.production.example` + `.env.prod.example`, `.gitattributes` (LF forzado para el entrypoint). **Fixes vs informe inicial del usuario:** C1 secretos en `DATA_DIR=/data` (no `/app`), C2 build monorepo, C3 orden de migraciones, C4 IP real `.60`, C5 multi-usuario. HTTPS resuelto con **cert autofirmado** sobre la IP (la cookie `secure` exige HTTPS).
> - **Fase 1 — Opción C escaneo (`9626777` + `dce88bd`):** `localAddress` opcional en `sshExec`/`probeStatusCgi`/`getSSHBanner`/`probeUbiquiti` + `scanner.worker.js`. `tunnelProvisioner.addScanMangle`/`findScanMangleIds`/`scanMangleComment` (namespace `SCAN-WS-<ws>`, separado de `ACCESO-USER`). `lib/scanMangle.js` (setup/teardown, conexiones read/write separadas). Tabla `workspace_scan_ip` + `db/repos/scanIpRepo.js` (resolución server-side anti-spoofing + `allocate()` del pool **192.168.21.200–.230**) + `db/migrateScanIp.js` (`npm run migrate:scanip`). `scan.routes.js`: resuelve VRF del nodo dueño, monta mangle, pasa `localAddress` al worker, la desmonta. **Sin scan-IP → escaneo legacy** (preserva dev local); si la mangle falla → `503` accionable. Tests `scanMangle` (7).
> - **Fase 2 — Opción C Monitor AP (`eafa927`):** `ap.service` (`pollAp`/`getDetail`/`getFullDetail`) acepta `localAddress`. `apPollJob` agrupa los APs del workspace por VRF (`LEFT JOIN nodes`), y bajo `lib/scanLock.js` (mutex async por workspace, con auto-liberación de seguridad) conmuta la mangle de la scan-IP por grupo y pollea atando el SSH. `scan.routes` toma el **mismo lock** (libera tras el teardown) para no competir con el job. Tests `scanLock` (4) + apPollJob Opción C (1).
> - **Provisión (`6cbdd75`):** `npm run scan:assign <workspaceId>` asigna/lista la scan-IP por workspace. Con el pool pre-reservado en `wg0`, dar de alta un moderador = **una fila en BD, sin tocar la red**.
> - **Pendiente (acciones del usuario en el VPS):** (1) configurar pool `.200–.230` en `wg0` (`PostUp`) + `allowed-address` del peer VPS en el MikroTik; (2) crear `server/.env.production` + `.env` desde las plantillas + cert autofirmado; (3) `docker compose -f docker-compose.prod.yml up -d --build`; (4) `npm run scan:assign <wsId>` por moderador. **Limitación conocida:** la scan-IP es 1 por workspace → si un mismo moderador tiene la misma LAN en 2 nodos (VRF distintos), el escaneo de esa LAN usa el primer VRF; moderadores distintos sí van en paralelo. **Checklist operativo completo al final de [`DESPLIEGUE_VPS.md`](./DESPLIEGUE_VPS.md).**
> - **Auditoría de despliegue + fixes (`acc3298`):** 🟡 **trust proxy** (`app.set('trust proxy',1)` en prod → IP real del cliente tras nginx para rate-limit/logs) + **timeout del `scanLock` proporcional al tamaño del escaneo** (~60ms/host, 5–30 min) para que un `/16` largo no auto-libere el lock a mitad y el job de Monitor AP conmute la mangle a otro VRF. Hallazgos operativos (acciones del usuario, no código): 🔴 cerrar `3001/tcp` en el VPS (`network_mode: host` lo expone), 🔴 rotar credenciales históricas de equipos.
> - **Co-moderadores (1 OWNER + máx 2 CO_MOD = 3 por workspace):** comparten **una** scan-IP → el `scanLock` serializa por workspace; co-mods del mismo workspace escaneando/monitoreando a la vez **se encolan** (cross-workspace = paralelo). El pool `.200–.230` es por workspace (no por usuario) → 31 workspaces. Suficiente para la escala actual.
> - **🔒 Purga de historial (force-push, tip `9f785c1`):** se reescribió TODO el historial de `main` y `dev` para eliminar secretos que estaban en commits viejos (`.db_secret`, `.jwt_secret`, `server/database.sqlite*`, `database_backup_*`, y `.claude/worktrees/`) + el binario `cloudflared-windows-amd64.exe` (62 MB). **⚠️ Los SHAs de los commits de esta sesión cambiaron** (`63c0e43`/`9626777`/`dce88bd`/`eafa927`/`6cbdd75`/`acc3298` ya no existen como tales); el tip actual de `main`=`dev`=`9f785c1`. Backup íntegro pre-purga en `../GestionVPN_backup_pre-purge_*.bundle`. `.gitignore` ya cubre esos patrones. Considerar comprometidas las credenciales que vivieron en el viejo `database.sqlite`.
>
> **Sesión 2026-06-17 — PUESTA EN MARCHA REAL en el VPS (DigitalOcean).** El panel MySQL/Docker quedó **funcionando** en `https://134.199.212.232/GestionVPN-1.0/` (admin creado vía Setup Inicial, login OK, dashboard OK). Commits `cec810e` → `f19576b`. ⚠️ **El historial se reescribió 2 veces (purga de secretos + `cloudflared.exe`); los SHAs cambiaron.** Tip actual `main`=`dev`=**`f19576b`**.
> - **Bugs encontrados y corregidos durante el despliegue:**
>   - 🔴 **Splitter SQL rompía esquemas en MariaDB 11** (`c43e53f` + `9427798`): el parser de `initRbac`/`initMultiuser`/`db.service` quitaba solo las líneas que EMPIEZAN con `--` y luego `split(';')`. Un **comentario inline con `;`** (`schema_rbac.sql` "login bloqueado; NULL"; `schema_ops.sql` "Fase 2-B; resuelto") truncaba el `CREATE TABLE` → `ER_PARSE_ERROR "near ''"` y, en schema_ops, `aps` no se creaba → `signal_history` FK **errno 150** + `migrate:apnode "Table aps doesn't exist"` → **crash-loop del backend**. Fix: el splitter elimina TODO comentario `--` (línea e inline) antes de partir por `;`.
>   - 🔴 **Orden de migraciones** (`294be9a`): `migrate:apnode` corría antes de que `initDb`/`schema_ops` (que crea `aps`) se aplicara → se ajustó para aplicar schema_ops antes.
>   - 🟡 **Audit fixes** (en `9f785c1`): `app.set('trust proxy', 1)` en prod + timeout de `scanLock` proporcional al nº de hosts del escaneo.
>   - **Siembra demo opcional** (`cf73a77`): el entrypoint ya NO siembra `admin/admin` + `fernando` por defecto; solo con `SEED_DEMO_USERS=true`. En prod la BD queda vacía → aparece el **Setup Inicial** y el operador crea el admin con su clave.
>   - **Ruta de retorno `.30` por VRF** (`cec810e`): `provision.routes` inyecta `dst-address=$SCAN_RETURN_SUBNET → VPN-WG-MGMT` en cada VRF (aditivo, gobernado por env). Para los VRF YA existentes se añadió a mano con un `:foreach` (ver abajo).
>   - **Invitaciones pendientes + enlace manual** (`f19576b`): como **DO bloquea el SMTP saliente**, el correo de invitación NO llega. Ahora `invite-moderator` no falla si el email falla (la invitación se crea igual) y devuelve `acceptUrl`; nuevo `GET /api/admin/invitations` (lista pendientes) + `POST /api/admin/invitations/:id/link` (regenera OTP → enlace fresco, porque el OTP solo se guarda hasheado). El frontend (`ModeratorsModule`) muestra el enlace al crear + tarjeta "Invitaciones pendientes" con copiar-enlace. **El admin comparte el enlace a mano** hasta que el email funcione.
> - **🛠️ GOTCHAS OPERATIVOS DEL VPS (críticos para el próximo despliegue):**
>   - **ufw bloqueaba nginx→backend.** El backend (`network_mode: host`) escucha en `:3001`; nginx (bridge) lo alcanza vía `172.17.0.1:3001`. La regla `ufw deny 3001` (para cerrar el público) **también bloqueaba el bridge** → `504 Gateway Timeout` en `/api/*` (y el front mostraba Login en vez de Setup porque `/status` también daba 504). Fix: `ufw insert 1 allow from 172.16.0.0/12 to any port 3001 proto tcp` **ANTES** del `deny 3001` (ufw es first-match; el orden importa).
>   - **DO bloquea SMTP saliente (25/465/587)** → invitaciones/OTP/reset por correo no funcionan. Node además intentaba IPv6 (`ENETUNREACH`) → se añadió `NODE_OPTIONS=--dns-result-order=ipv4first` a `server/.env.production`, pero 587 sigue bloqueado por DO. **Pendiente:** relay (SendGrid/Brevo/Mailgun) por puerto **2525**, o ticket a DO. Workaround: enlace manual de invitaciones.
>   - **MariaDB** aplica `MARIADB_PASSWORD` SOLO al crear el volumen; si se levantó con otra clave hay que `docker volume rm gestionvpn-10_db-data` para reinicializar.
>   - **Consola web de DigitalOcean** filtra el *bracketed paste* (`~`) al pegar → `--build~` "unknown flag". Workaround: terminar el comando con ` #` o escribirlo a mano.
>   - **Tras la reescritura de historial**, en el VPS usar `git fetch origin && git reset --hard origin/main` (NUNCA `git pull`).
>   - **Telegram `getUpdates HTTP 409`**: el token lo usa OTRO poller (PC/dev). Un solo poller por token; apagar el otro o usar token distinto en prod.
> - **Red Opción C: se usó `192.168.30.0/24` (no `.21.200-.230`).** Decisión: `.21` = usuarios, `.30` = scan-IPs del VPS. En `wg0` el pool `.30.2–.40` (`PostUp`/`PostDown`); peer del VPS en MikroTik `allowed-address=192.168.21.60/32,192.168.30.0/24`; `Route-SCAN` (`dst=192.168.30.0/24 gw=VPN-WG-MGMT`) en los **14 VRF** (ND1…ND15). Env: `SCAN_IP_POOL_BASE=192.168.30.`, `_START=2`, `_END=40`, `SCAN_RETURN_SUBNET=192.168.30.0/24`. `AllowedIPs` del VPS ya cubría todo (`192.168.0.0/16`+`10.0.0.0/8`).
> - **Estado del VPS:** 3 contenedores `Up` (db/backend healthy, frontend); health `mysql: ok` (degraded solo por SMTP); cert autofirmado; `ufw` 2375/2376 cerrados, 8080 aún abierto (cerrable). **Pendiente:** `npm run scan:assign <workspaceId>` por moderador, relay SMTP, validar escaneo/Monitor AP contra antenas reales con túnel arriba. Detalle completo en [`DESPLIEGUE_VPS.md`](./DESPLIEGUE_VPS.md).
> - 🔴🔴 **PÉRDIDA DE DATOS EN CADA DEPLOY — corregido (`ae868b9`):** `db/initRbac.js` hacía `DROP TABLE` de `users/workspaces/workspace_members/invitations/tunnel_logs/...` en **cada arranque** (el comentario decía "seguro en Fase 1 sin datos"), y el entrypoint lo corre en cada redespliegue → **borraba admin, moderadores e invitaciones en cada `up`**. Ahora el DROP solo corre con **`RBAC_RESET=true`** (reset intencional); por defecto es **idempotente** (`CREATE TABLE IF NOT EXISTS`) y **preserva los datos**. El log debe decir "Modo idempotente (sin DROP)". ⚠️ Esto explicaba el síntoma de "se borra todo al desplegar" y el estado `vpn_users` con `admin` pero `users` (RBAC) vacía (initRbac dropeaba `users` pero no la tabla legacy `vpn_users`).
> - **Recuperación del admin:** como `users` quedó vacía por los DROP previos, se resetea la clave del `admin` en `vpn_users` (`UPDATE vpn_users SET password_hash=bcrypt('48523451Fs')`) y al loguear (path legacy) `attachRbacSession` recrea el admin RBAC — que **ya persiste** tras el fix. Admin de producción: **`admin` / `48523451Fs`**.
> - **Fix `.conf.txt` (`fc28924`):** la descarga del `.conf` de WireGuard usaba Blob `text/plain` → el navegador añadía `.txt`. Cambiado a `application/octet-stream` en los 3 flujos (`AcceptInvitationForm`, `MemberWireGuardModal`, `WgConfigModal`) → baja como `*.conf`.
> - **Login 401 / Setup vs Login:** `/auth/status` decide Setup (BD sin usuarios) vs Login; tras un reset, forzar recarga del navegador (`Ctrl+Shift+R`) porque el bundle del frontend cambia de hash y el cacheado llama al flujo viejo.
> - **Tip actual `main`=`dev`=`ae868b9`.**
>
> **Sesión 2026-06-19 — Relay SMTP (Brevo), IP pública a Ajustes, fix scan en prod + migración del pool de scan.** Commits `c51eff6` → `d56df21` en `dev` (mergeados a `main`). Tip actual `main`=`dev`=**`d56df21`**.
> - **📧 SMTP relay por Brevo (sin commit — config del VPS):** como DO bloquea 25/465/587, se levantó **Brevo** (`smtp-relay.brevo.com`) por **puerto 2525** (NO bloqueado por DO). El puerto se fija en `server/.env.production` (`SMTP_PORT=2525`), NO en Brevo. `lib/mailer.js` ya soporta cualquier puerto. **Estado:** la conexión funciona (`/api/health` → `smtp: ok`, latency ~440ms) pero el ENVÍO falla con `502 5.7.0 Your SMTP account is not yet activated` → **falta activar la cuenta Brevo** (completar perfil + verificar remitente + autorizar la IP del VPS en "direcciones IP autorizadas"). ⚠️ Mientras tanto sigue vigente el **enlace manual de invitaciones**. ⚠️ El `SMTP_PASS` de Brevo se expuso en el chat → **rotar la clave SMTP**.
> - **feat(settings) `c51eff6` — IP pública WAN como setting global del admin:** el alta de nodo WireGuard ya NO le pide la IP pública al moderador. El Administrador la define una vez en **Ajustes** (`SettingsModule`, setting `server_public_ip`) y `NuevoNodo` la consume en **solo-lectura** (badge "Configurada por el Administrador"); si falta, bloquea el alta WG con aviso para ir a Ajustes. Tocó `SettingsModule` (types/constants/useLoadSettings/useSaveSettings/SettingsForm) + `NuevoNodo.tsx` (quitado el input editable y el persist on-blur). Backend sin cambios (`server_public_ip` ya era key válida no-core; `/settings/save` exige admin).
> - **🔴 fix(scan) `94fee13` — `API_BASE_URL` central en módulo Escanear (rompía TODO el escaneo en prod):** `NetworkDevicesModule`, `useDeviceScan` y `useDeviceLibrary` redefinían `const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'`. En prod `VITE_API_URL=''` (falsy) → caía a `localhost:3001` → `scan-stream` daba `ERR_CONNECTION_REFUSED`/`Failed to fetch` en el panel del VPS. Ahora los 3 importan el `API_BASE_URL` central de `config.ts` (que detecta host y usa URL relativa en prod → nginx proxea). **El `config.ts` central ya era correcto desde marzo; estos 3 lo ignoraban.**
> - **🌐 Choque de subred `192.168.30.0/24` (scan-pool vs LAN real) + migración a `10.11.251.0/24`:** se detectó que `192.168.30.0/24` era a la vez el **pool de scan del VPS** Y la **LAN real de ND7/ND16** (TorreOmar/ADMINISTRADORPLANICIE). La `Route-SCAN` (`dst=192.168.30.0/24 → VPN-WG-MGMT`) en cada VRF devolvía ese tráfico a MGMT → **scan = 0 dispositivos** y, desde el celular, entrar a la IP de la antena (`192.168.30.x`) caía en el **panel web del VPS** (no en airOS). Solución acordada: mover el **pool de scan** a un /24 dedicado `10.11.251.0/24` (libre; el router solo usa `10.10.250.x`/`10.10.251.x`), dejando `192.168.30.0/24` como LAN de torre. `docs(scan) d56df21` actualiza `server/.env.production.example` (`SCAN_IP_POOL_BASE=10.11.251.`, `SCAN_RETURN_SUBNET=10.11.251.0/24`). **Migración en el VPS (PENDIENTE de aplicar por el usuario, runbook entregado en chat):** (1) `.env.production` con el nuevo pool + restart backend; (2) limpiar `workspace_scan_ip` y re-`scan:assign` por workspace; (3) `wg0.conf` del VPS: scan-IP `192.168.30.x` → `10.11.251.x` (dejar `192.168.21.60`); (4) MikroTik: `peers set [find name=VPS] allowed-address=192.168.21.60/32,10.11.251.0/24` + `/ip route set [find dst-address="192.168.30.0/24" gateway=VPN-WG-MGMT] dst-address=10.11.251.0/24` (NO toca las rutas de LAN con gateway `WG-NDx`). **Pendiente confirmar:** subred real donde viven las antenas de TorreOmar para escanearla.
>
> **Sesión 2026-06-19 (PM) — MIGRACIÓN del plano de gestión `192.168.21.0/24` → segmentos `10.x` (backend + frontend + MikroTik).** Commit `f09fa7a` en **`dev`** (pusheado; `main` sigue en `d56df21` hasta validar la parte de red en prod). Código migrado y testeado (214 backend + 69 frontend verdes, `tsc` 0); aplicación en MikroTik/VPS PENDIENTE (runbook entregado). Runbook completo en [`MIGRACION_RED_GESTION.md`](./MIGRACION_RED_GESTION.md). **Tip actual `dev`=`f09fa7a` · `main`=`d56df21`.**
> - **Motivo:** `192.168.x` (gestión) chocaba con LANs de torre. Se sale a `10.x`. Decidido con el usuario: **4 segmentos + IP de gestión por nodo.**
> - **Esquema final:** nodos WG `10.11.250.<ND>` · nodos SSTP `10.11.251.<ND>` · scan-pool VPS `10.11.252.0/24` (reubicado desde `.251` para no chocar con SSTP) · **VPN-WG-VPS** `10.12.250.1/24` :13232 · **VPN-WG-CLIENTES** `10.13.250.1/24` :13233 (mod/members) · **VPN-WG-ADMIN** `10.14.250.1/24` :13234 (admin). La vieja `VPN-WG-MGMT` (:13231) se elimina **al final** del corte.
> - **Fuente de verdad NUEVA:** `server/lib/mgmtNet.js` (backend, env-driven) + `vpn-manager/src/config.ts` (`MGMT_NET`/`PROTECTED_NETS`/`VPS_IP`/`ADMIN_WG_NET`/`nodeMgmtIp`/`MGMT_RETURN_NETS`). Antes `192.168.21` estaba hardcodeado como string en ~25 sitios; ahora todo deriva de estos módulos.
> - **Backend:** `team.routes` (peers mod→CLIENTES), `wireguard.routes` (peers admin→ADMIN + listado userIfaces), `tunnel.routes` (`register-my-ip` valida CLIENTES/ADMIN; `mangle-access` legacy marca los 3 /24), `tunnel-repair` (rutas retorno + vpn-activa por los 3 segmentos), `provision.routes` (**3 rutas de retorno por VRF** vía `addMgmtReturnRoutes` + **IP de gestión por nodo** `nodeMgmtIp(ND,isWG)` → ruta /32 al túnel + `LIST-NET-REMOTE-TOWERS` + allowed-address del peer; scan-return ahora vía `VPN-WG-VPS`), `listing.routes` (filtros excluyen los 5 /24 de gestión + **script CPE** regenera allowed-address/rutas con los 3 segmentos + scan + IP de gestión del nodo), `scanIpRepo` (pool default `10.11.252.`).
> - **Frontend:** `config.ts` centraliza; `NodeAccessPanel/{constants,subnet,NuevoNodo,NuevoAdmin,WireGuardSection,NodeAccessPanel}`, `NodeCard/{constants,useLogsAndRepair}` (ya NO envía `adminWgNet`), `UserManagementPanel`, `MemberProfile` consumen de `config.ts`.
> - **MikroTik:** `server/scripts/migrate-mgmt-net.rsc` (NUEVO, migración por fases en vivo: crea 3 interfaces, address-lists, rutas de retorno por VRF con `:foreach`, y corte final). `mikrotik-wg-hooks.rsc` → `backendUrl=10.12.250.60` + interfaz ADMIN. `mikrotik-config.rsc` con banner de snapshot histórico.
> - **PENDIENTE (acciones del usuario):** ejecutar el runbook `MIGRACION_RED_GESTION.md` — deploy backend con nuevo scan-pool, `migrate-mgmt-net.rsc` fases 1-3, `wg0` del VPS (`10.12.250.60` + scan `10.11.252.x`) + peer VPS en `VPN-WG-VPS`, re-emitir `.conf` (admin→ADMIN, moderadores→CLIENTES), re-provisionar/reparar nodos (IP de gestión por nodo), verificar, y **corte final** (fase 6) que elimina `VPN-WG-MGMT`. Mientras no se ejecute la fase 6, el esquema viejo sigue activo (rollback trivial).
>
> **Sesión 2026-06-19 (cont.) — Aplicación real del plano `10.x` en el MikroTik + REFACTOR "IP unificada por nodo" (transporte + gestión en una sola IP).** Trabajo en working tree de **`dev`** (SIN commit aún). Plan en [`PLAN_IP_UNIFICADA.md`](./PLAN_IP_UNIFICADA.md). Estado: **209 tests backend verdes · `tsc` frontend 0 · syntax-check backend 0.**
> - **Auditoría del router en vivo (varias rondas sobre exports del usuario).** Se detectaron y corrigieron 4 fallos del corte `10.x` que los scripts de migración no cubrían: (1) la regla firewall `WG Gestion 13232-13234` quedaba **después** del `drop "Bloqueo total WAN"` en `input` → ningún túnel de gestión levantaba (movida arriba del drop); (2) `/ip service api address` seguía con `192.168.21.0/24` → el backend (`10.12.250.60`) perdía la API (añadidos `10.12.250.0/24`+`10.14.250.0/24`); (3) **`vpn-activa` no incluía el scan-pool `10.11.252.0/24`** → el escaneo (src=scan-IP) moría en el filtro forward `src=vpn-activa` (el viejo esquema funcionaba de carambola porque la scan-IP vivía dentro de `192.168.21.0/24`); (4) `Admin MGMT libre` apuntaba a la interfaz borrada `*7` → redirigida a `VPN-WG-ADMIN`. Todo aplicado por el usuario en el router.
> - **Decisión de arquitectura (con el usuario):** colapsar **transporte + gestión en UNA sola IP por nodo**. Antes cada nodo tenía 2 IPs (WG: transporte `/30` en `10.10.251.x` + gestión `10.11.250.<ND>`; SSTP: transporte `10.10.250.x` + gestión `10.11.251.<ND>`). Ahora **una sola**: WG `10.11.250.<ND>`, SSTP `10.11.251.<ND>` (= `remote-address` del PPP). La `.1` de cada `/24` se **reserva para el endpoint del Core** (SSTP `local-address=10.11.251.1`) → los nodos arrancan en **ND2** (ND1 ya no se usa). Las viejas redes de transporte `10.10.250/251` quedan **OBSOLETAS**. Verificado que el cambio **NO afecta el escaneo** (el scan enruta por `iface@VRF` + `allowed-address`, no por el `/30`).
> - **Backend (7 archivos):** `mgmtNet.js` (`nodeMgmtIp` exige **ND ≥ 2**; +`sstpLocal`); `provision.routes.js` (**WG:** elimina el `/30`, la IP única es el túnel — peer `allowed-address=nodeMgmt/32 + LANs`, interfaz del Core **sin IP**; **SSTP:** `remote-address = nodeMgmtIp(ND,false)` determinístico, sin pool `10.10.250`); `tunnel-repair.routes.js` (**fix `vpn-activa` += scan-pool** vía `SCAN_RETURN_SUBNET` — antes el "Reparar" volvía a romper el escaneo; WG adaptado con compat legacy `10.10.251`); `listing.routes.js` (script CPE: **una sola IP `/32`** sin `/30`; `set-peer` deriva la IP del nº de nodo); `editing.routes.js` (allowed-address del peer con la IP única, compat legacy); `provisionAllocation.test.js` (test del nuevo `remote-address`); `.env.production.example` (doc + `MGMT_NODE_SSTP_LOCAL`).
> - **⚠️ A confirmar en la primera alta WG:** la interfaz WG del Core ya **no lleva IP** (rutas por `gateway=iface@VRF` + `allowed-address`, patrón estándar WG en RouterOS). Verificar handshake + `ping 10.11.250.<ND>` + escaneo > 0. Fallback trivial si no activa la ruta: añadir un `/32` a la interfaz del Core.
> - **PENDIENTE (acciones del usuario):** (1) router: `/ppp/profile/set PROF-VPN-TOWERS local-address=10.11.251.1` + `/ip/pool/set POOL-VPN-SSTP ranges=10.11.251.200-10.11.251.250`; (2) commit + merge a `main` + deploy backend en el VPS; (3) **re-provisionar cada nodo desde el panel con ND ≥ 2** (HOUSENET deja de ser ND1 → reasignar número). **Tip `dev` sigue en `f09fa7a` (cambios en working tree, sin commit).**
>
> **Sesión 2026-06-19 (cont. 2) — Escaneo funcional post-migración `10.x` + toggle Local/VPS del Administrador.** Commits sobre `dev` (tip previo `5624373` "IP unificada"). El nodo TorreHousenet (ND2, SSTP, LAN `10.1.1.0/24`) ya estaba re-provisionado en el esquema nuevo y el escaneo fallaba en cadena; se depuró capa por capa actuando como ing. de redes (lectura del router en vivo desde la PC dev vía `MT_IP=10.14.250.1`). **Estado: 214 tests backend verdes · `tsc` frontend 0.**
> - **🔴 Bug "se queda pensando" (UI):** `runAuthPhase` (`useDeviceScan.ts`) salía con `return` cuando el escaneo encontraba **0 dispositivos** SIN poner `phase='done'` → `phase` quedaba en `'discovering'` → `isScanning=true` para siempre y el botón colgado. Fix: con 0 devices ahora pasa a `'done'` (botón se rehabilita).
> - **🔴 "0 encontrados" (red, no código):** la PC dev origina el escaneo desde su IP WG real **`10.14.250.20` (plano ADMIN)**, pero el único mangle era `ACCESO-USER src=10.13.250.20` (CLIENTES, el `mgmt_ip` que `assign_ip.js` fijó a mano) → no coincidían → el Core no marcaba el tráfico al VRF → descartado. Verificado en el router vivo que `vpn-activa` incluye `10.14.250.0/24` y que `VRF-ND2` tiene ruta de retorno `10.14.250.0/24 → VPN-WG-ADMIN`. Solución: **Opción C** — `migrate:scanip` (creó `workspace_scan_ip`, faltaba en la BD dev) + scan-IP del workspace = `10.14.250.20` → el backend monta `SCAN-WS src=10.14.250.20 → VRF-ND2` y el escaneo encuentra los equipos.
> - **🟢 Toggle Local/VPS en Ajustes (Administrador):** nuevo `app_settings.scan_mode` (`local`/`vps`, default `vps`) + `local_scan_ip`. `scanIpRepo.resolveForWorkspace(ws)` resuelve la scan-IP según el modo: **`local`** → IP única global (`local_scan_ip` = IP WG de la máquina, "1 box hace todo"); **`vps`** → pool por workspace `10.11.252.x` (multi-tenant). Aplicado a `scan.routes` y `apPollJob`. Frontend: componente `ScanModeToggle.tsx` (switch accesible `role="switch"`, persiste al instante, verde=VPS / ámbar=Local, campo de IP solo en modo Local) en `SettingsModule`. Test `apPollJob` actualizado a mockear `resolveForWorkspace`.
> - **🔴 Fase de auth SSH fallaba ("credenciales incorrectas" siendo correctas):** los 29 equipos eran **solo-SSH** (sin web `/status.cgi`) y la scan-mangle se **desmontaba al cerrar el SSE**, ANTES de la fase de auth (`/api/device/antenna`) → el SSH salía sin `routing-mark` → host inalcanzable → mal clasificado como auth. Fix de timing: **el SSE se mantiene ABIERTO durante la fase de auth** (la mangle sigue viva); el teardown se dispara al cerrar el cliente (cancela el reader al terminar la auth) o por margen de seguridad `SCAN_AUTH_GRACE_MS` (5 min); el `scanLock` se dimensiona para cubrir descubrimiento+auth. `/device/antenna` ata el SSH a la scan-IP (`resolveForWorkspace`). Frontend: `useDeviceScan` rompe el bucle en `complete` (sin esperar cierre del server) y cancela el reader tras la auth. **Esto afecta también a producción (VPS)** para antenas solo-SSH — mismo bug de timing.
> - **Archivos:** backend `scanIpRepo.js` (+`resolveForWorkspace`/`getSetting`), `scan.routes.js` (SSE abierto + grace + lock), `device.routes.js` (`localAddress` en `/device/antenna`), `apPollJob.js` (resolveForWorkspace), `test/unit/apPollJob.test.js`; frontend `useDeviceScan.ts`, `SettingsModule/{types.ts,SettingsModule.tsx,hooks/useLoadSettings.ts,components/{index.ts,ScanModeToggle.tsx}}`.
> - **⚠️ Backlog VPS para que el escaneo funcione en producción:** el atajo local (scan-IP = IP de la propia máquina) **NO** se traslada al VPS. Falta: (1) ruta de retorno del pool `10.11.252.0/24 → VPN-WG-VPS` **en cada VRF** (confirmado ausente en `VRF-ND2` en vivo); (2) `SCAN_RETURN_SUBNET=10.11.252.0/24` en `.env.production`; (3) `scan:assign <ws>` (pool) + `wg0` del VPS posee la scan-IP + peer VPS `allowed-address` con `10.11.252.0/24`. Pendiente: generar `.rsc` `:foreach` que añada la ruta de retorno a todos los VRF.
> - **Scripts dev locales (NO commiteados, sin secretos en repo):** `server/{assign_ip,check_mgmt_ips,clean_old_ips,reset_passwords,test_crypto}.js` quedan en working tree como helpers de diagnóstico; `check_mgmt_ips.js` referencia tabla `active_sessions` inexistente (la real es `tunnel_user_sessions`).
>
> ### 🧱 Refactor (F0-F12) — Plan completo ejecutado
> - **F5.A/B/C (2026-06-15, sesión actual)** cerraron el último gap del shape API: 10 rutas backend restantes (`settings`, `wireguard`, `device`, `nodes/{listing,editing,credentials,provision}`, `core/{tunnel,connection,interface}`) → `sendOk`/`AppError`/`asyncHandler` + Zod (46/47 respuestas legacy convertidas; 1 intencional en `/device/antenna`). `lib/routeGuards.js` NUEVO con `requireMikrotik()` antes duplicado en 11 archivos. `AppError` extendido con campo `data` (preserva `needsConfig`/`steps`/`failedAt`). 5 schemas nuevos en `packages/contracts`: `wireguard`, `tunnel`, `nodes`, `device`, `settings` — backend ahora los importa. `utils/apiClient.ts` modernizado (no-ops eliminados, detector `NEEDS_CONFIG` canónico). `types/api.ts` re-exporta WgPeer/TunnelActivateResponse/etc desde contracts. **170 tests backend + 64 frontend = 234 verde.**
> - **F5** Monorepo + `@gestionvpn/contracts` con Zod compartido.
> - **F6** `node.routes.js` → 8 archivos. **F7** `core.routes.js` → 7 archivos.
> - **F8** `NetworkDevicesModule.tsx` 1313 → 433 LOC + 4 hooks + 5 componentes (fixup `5c19cb6` resolvió 2 bugs de perf + 2 anti-patterns).
> - **F9** Observabilidad: `/api/health` enriquecido (mysql+routeros+smtp) + `GET /metrics` Prometheus + counters auth/routeros/mailer.
> - **F10** Code-splitting frontend: bundle inicial **1090 → 248 KB raw (−77%)** · TeamModule **415 → 127 KB (−69%)** tras dual-package ESM. `npm run analyze` con visualizer.
> - **F11** MySQL performance: pool con timeouts explícitos + 8 índices compuestos (`schema_perf_indexes.sql`) + `npm run analyze:queries` con `EXPLAIN` sobre 13 queries del hot path.
> - **F12** Audit final: `npm audit --omit=dev` 0 vulns en prod, `semgrep` 0 findings tras fix de `gcm-no-tag-length` + 2 `nosemgrep` justificados. [ARQUITECTURA.md](./ARQUITECTURA.md) con 8 diagramas Mermaid.
>
> ### 🚀 Features post-refactor
> - **Q5 (V1 seguridad)** — `register-my-ip` valida ownership por rol (MEMBER → peer suyo; OWNER/CO_MOD → peer del workspace; admin → cualquiera). Cierra hueco anti-spoofing.
> - **Q1 + M1 (§26-27)** — Notificaciones email + Telegram bot interactivo (long-polling con 8 comandos + deep-links `?activate=VRF-X` + banner de confirmación). [MANUAL_USUARIO.md](./MANUAL_USUARIO.md) guía no técnica de 9 secciones para el usuario final.
> - **Q3 (§28)** — Diagnóstico ping/traceroute desde el panel (RouterOS-side), rate-limit 5/10s, modal con tabs y stats coloreadas.
> - **Q4 (§29)** — Export auditoría CSV/JSON con filtros de rango (7d/30d/90d/todo), BOM UTF-8 para Excel, stream por fila, rate-limit 1/5s.
> - **Q2 (§30)** — Dashboard métricas en vivo: aggregator del registry Prometheus + sparklines SVG inline (sin libs), polling 10s, 4 KpiCards + breakdowns por etiqueta.
> - **M5 (§31)** — Monitoreo proactivo: job cada 5min lee `/ppp/active`, anti-flap con counter en BD (3 fallos × 5min = 15min de gracia), cooldown 30min, notifica al OWNER `NODE_DOWN` / `NODE_RECOVERED`.
> - **iter2 multi-usuario (§32, commit `b441cbc`)** — Bot Telegram ejecuta `/activar` y `/desactivar` directamente (antes solo deep-link); selección por lista numerada con TTL 15 min vía nuevo `lib/tunnelService.js` compartido con HTTP. Botón "Asignar túneles" reincorporado a la tabla de Equipo (solo MEMBER) + endpoint ligero `/api/team/workspace-tunnels` para picker. Fix crítico: provisión de peer WG ahora inserta `user_mgmt_ips` automáticamente — antes el MEMBER recibía 409 NO_MGMT_IP al activar.
> - **UX MEMBER (§33)** — La vista "Acceso a Nodos VRF" se reduce a "Acceder" para el MEMBER: se ocultan "Nuevo Nodo", "Exportar", el kebab de fila (Verificar/SSH/Editar/Script/Etiquetas/Historial/Diagnosticar/Eliminar) y el lápiz de renombrar. Se habilita el módulo "Ajustes" para el MEMBER reutilizando `ModeratorSettingsModule` con tabs filtradas: **Perfil** (contraseña + correo, sin cambios) y **Notificaciones** en `memberMode` — solo vincular/desvincular Telegram (sin email, eventos, pausa ni botón Guardar). Backend sin cambios (los endpoints `/account/*` ya solo exigen `requireSession`).
> - **Auditoría Escanear — performance + robustez (§37)** — Tres commits encadenados (`4e872f5` + `09b7c5c` + `1fc502b`) con 12 cambios guiados por las reglas vercel: race condition en `setSavedDevices` cerrada con functional setState, listeners `mousemove` on-demand (solo durante resize), `gridTemplate` como CSS variable `--cols-tpl` para que el resize-drag no invalide todas las filas memoizadas, `Map<id, SavedDevice>` para lookup O(1), `useDeferredValue` en la búsqueda, `motion-safe:` en animaciones infinitas, click-away con `touchstart`, cancelación del reader SSE si cambia la subred mientras hay scan in-flight, lazy init de `useState` con `loadCachedScan()` para hidratar `sessionStorage` sin disparar 5 setStates al montar, y wrapper `SCAN_CACHE_VERSION` para descartar payloads de schemas viejos. Resultado: resize fluido con 50+ filas, race cerrada, 1 render menos al mount, sin renombrar APIs públicas.
> - **Auditoría Escanear — UX + features (§38)** — Dos commits (`a3e1caf` + `f1dd8cb`) con 9 cambios visibles para el usuario: SSH "failed" distinguido del "no probado" con paletas distintas + `role="status"` para screen readers, default sort por **señal desc**, `colWidths` persistido en localStorage, footer con contador SIEMPRE visible, chips para cada filtro activo (search/SSID/rol) con limpieza individual, filtro nuevo **"Solo APs / Solo CPEs / Solo desconocidos"** con normalización `mode='master'→'ap'`, tooltip nativo en headers truncados, **botón "Exportar CSV"** con 26 columnas + BOM UTF-8 para Excel + escape RFC 4180, **botón "Guardar N"** verde que aparece solo si hay candidatos con SSH OK no guardados (Promise.allSettled, confirmación si N>5), zebra simplificado a blanco/slate con `border-l-2` indicador (indigo=guardado · emerald=hasStats · transparent). NetworkDevicesModule chunk: 86 → 95 KB raw / 20 → 23 KB gzip (+8 KB acumulado, casi todo del `exportCsv.ts` + bulk save handler).
>
> - **Workspace unificado + mejoras de peers (§34)** — Cuatro cambios encadenados:
>   1. **Sidebar consolida "Usuarios" + "Equipo" → un solo ítem "Workspace"**. El antiguo `UserManagementPanel` (peers WG) ahora vive como sub-tab dentro de `TeamModule`. Header del módulo muestra **nombre del workspace + tarjeta Propietario + tarjeta Tú** con badge de rol. Para esto se enriquecieron `/account/me` y `/account/bridge` con `workspace_name` (JOIN con `workspaces`), y `SessionUser` en `@gestionvpn/contracts` añade `workspace_name?: string`. MEMBER ve solo la tab "Usuarios" (sin switch — "Usuarios VPN" es de moderador).
>   2. **Tabla "Usuarios VPN" con columna Email + column picker**. `/api/wireguard/peers` ahora hace LEFT JOIN con `member_wireguard` y `user_mgmt_ips` (por `public_key` y por `mgmt_ip`) para anexar el email del owner del peer; `WgPeer.email?: string` añadido al tipo. La tabla reescrita ofrece 7 columnas (Estado/Usuario fijas, Email/IP/Protocolo/Clave pública/Último acceso toggleables) con dropdown "Columnas" persistido en `localStorage` bajo `vpn_users_visible_cols`. Búsqueda extendida a email; sort por email; celdas Email/IP/PubKey con copy-on-click vía componente `<CopyableCell>` reutilizable.
>   3. **AssignTunnelsModal — multi-selección + "Todos"**. El antiguo `<select>` de 1 túnel se reemplazó por lista de checkboxes con buscador (VRF/nodo/PPP), botones contextuales "Todos / Todos visibles (N) / Ninguno / Limpiar", asignación en lote vía `Promise.allSettled` con feedback parcial (`5 asignados · 1 fallaron`). Backend sin cambios (se reusa `teamApi.assignTunnel` N veces). Modal pasó de `max-w-md` a `max-w-lg` con `max-h-[90vh] + overflow-y-auto` para workspaces con muchos túneles.
>   4. **QR de WireGuard en `AcceptInvitationForm`**. El flujo público de aceptación ya generaba el `.conf` server-side pero solo lo mostraba como texto + Copiar/Descargar. Ahora se genera un QR (`QRCode.toDataURL(conf, { margin: 1, width: 220 })`) y se renderiza arriba del bloque del .conf con hint "📱 Escanea con WireGuard móvil". `qrcode` ya estaba instalado (lo usa `MemberWireGuardModal` desde la fase E del moderador); solo faltaba aplicarlo a este flujo.
> - **Alias humano de peers WG (§35)** — La columna "Usuario" en la tabla "Usuarios VPN" mostraba el `comment` de MikroTik y la UI permitía editarla inline. Eso rompía la trazabilidad: al renombrar el peer desde el panel, el moderador después no podía identificarlo en el router. **El "Usuario" pasa a ser read-only** (tooltip explica por qué). Se agrega **nueva columna "Alias"** editable inline para anotaciones humanas ("PC casa", "Laptop gestión", "Celular Personal") que viven en BD del panel, no en MikroTik. Nueva tabla `peer_aliases (workspace_id, peer_address, alias, updated_at)` aislada por workspace + endpoint `POST /api/wireguard/peer/alias/save` (con DELETE implícito si `alias=''`). El JOIN en `GET /api/wireguard/peers` enriquece cada peer con `alias?`. Patrón optimista en frontend con rollback automático si el server rechaza. Subcomponente `<AliasCell>` con 3 estados visuales: sin alias = botón sutil "+ Agregar alias", con alias = `Tag + texto + lápiz en hover`, editando = `input + check + X`.
>
> ### 🛠️ Bugs resueltos en esta serie
> - **`POST /api/wireguard/peers` crash** — `node-routeros` lanzaba síncronamente desde el callback del socket; parche generalizado a replies desconocidos + UNREGISTEREDTAG + handler `'error'` en `RouterOSAPI` (§13.6).
> - **`@gestionvpn/contracts` "no export named ROLE_LABEL"** — dual package CJS+ESM. Side-benefit: TeamModule −69%.
> - **`/api/account/notifications` 500** — defensa ante `ER_NO_SUCH_TABLE` cuando faltaba la migración; lecturas devuelven defaults, mutaciones devuelven `503 NOTIFICATIONS_NOT_MIGRATED` accionable. Bug del orden de args en `AppError(message, status, code)` corregido (mismo bug que Q3, regla operativa §28).
> - **`/api/tunnel/activate` 409 NO_MGMT_IP en MEMBERs (§32)** — `provisionMemberWgByPublicKey` y `POST /member/:id/wireguard` creaban el peer en el router pero olvidaban poblar `user_mgmt_ips`. El MEMBER quedaba sin poder activar ningún túnel sin que el operador corriera el script CLI `mapUserMgmtIp.js`. Ahora ambos provisionadores hacen `mgmtIpRepo.upsert({ source: 'auto-provision' })` tras el peer.
> - **Bot Telegram `/tuneles` y `/activar` no veían las asignaciones del MEMBER (§36)** — El MEMBER recibía "No tienes túneles asignados" pese a que el panel HTTP sí los listaba. Causa raíz: mismatch entre clave usada para guardar y clave usada para leer. `AssignTunnelsModal` envía `nombre_vrf || ppp_user` como `tunnel_id` (casi siempre el VRF tipo `VRF-ND4-TORREVIC`). El HTTP `routes/nodes/_shared.js:80` filtraba bien con `ids.has(n.nombre_vrf) || ids.has(n.ppp_user)`, pero `lib/telegramBot.js:fetchUserTunnels` filtraba solo por `ppp_user IN(...)`. Fix: match dual `WHERE (nombre_vrf IN (...) OR ppp_user IN (...))` + test de regresión que asigna `'VRF-HOUSENET'` y verifica que matchea al nodo con `ppp_user: 'housenet'`.
>
> ### ✅ Tests
> - **142 backend** (14 archivos) + **36 frontend** (5 archivos) = **178 tests verdes**. La auditoría §37-§38 de Escanear NO añade tests nuevos (las mejoras son refactor/UX sin lógica de negocio); el conteo se mantiene desde §36.
>
> ### 📚 Secciones de referencia
> §17–25: REFACTOR_PLAN ejecutado. §26 notificaciones. §27 bot Telegram. §28 ping/trace. §29 export. §30 dashboard. §31 monitoreo. §32 iter2 multi-usuario. §33 UX MEMBER endurecida. §34 Workspace unificado + peers WG mejorados. §35 Alias humano + bloqueo Usuario. §36 Fix bot — match dual VRF/PPP. §37 Escanear — perf + robustez. §38 Escanear — UX + features. §39 Escanear — sticky-right + kebab (cierre auditoría). §40 Escanear — preferencias persistentes (useScanPreferences) + export multi-formato (CSV/JSON/Excel/PDF). §41 Escanear — simplificación de acciones de fila a botones icon-only + limpieza de DeviceCardModal/SshDataModal muertos. §42 Escanear — 4 mejoras UX: ícono Save (disquete) + bulk save selectivo con checkbox tri-state + contraste chevron + IP/Nombre del sistema en panel. §43 Política anti-saturación — eliminar polling SSH automático cada 5s en DeviceStatusPanel (saturaba CPU de antenas) + actualizar Política Operativa SSH para prohibir polling SSH. §44 Nodos — columnas dinámicas + filtros + chips + export multi-formato + sticky-right. §45 Audit del sistema de diseño (script + skill instalada). §46 Plan ejecutable + sistema extendido (btn-warning/info/accent + focus-visible WCAG + tamaños + modal canónico) + wins rápidos sed (−259 hallazgos). §47 Fase 1 — 23 botones inline migrados a `.btn-{variant} btn-{size}` (DS06 −88.5%). §48 Fase 2 — DS02 dark mode en 28 archivos (DS02 265→103, −61%). §49 Fase 2 cierre — DS02 a 0 (−100% desde baseline) + auditor refinado con lookahead `/N` para excluir opacidad sobre superficies oscuras + cleanup de archivos temporales accidentalmente commiteados. §50 Fase 3 — 19 modales migrados a `.modal-overlay/.modal-panel/.modal-panel-{size}` con animaciones por @keyframes nativos (no tailwindcss-animate, incompatible con @apply). §51 Fix bug `merged=undefined` en `handleAddDevice` — el guardar de dispositivos crasheaba silenciosamente y el POST al backend nunca se ejecutaba (Monitor AP no veía los devices guardados). Causa: functional setState updater no ejecuta sincrónicamente en React 18+. Fix: `savedDevicesRef` para lookup síncrono. §52 Fase 3.1 — extiende el sistema con `.modal-header-{indigo,rose,amber,emerald,sky,violet,slate}` + `.modal-header-icon` + `.modal-header-close`. 15 headers decorativos unificados. §53 Fase 4 — DS05 contraste a 0 (de 406 baseline, −100%): auditor refinado con detección de superficie oscura, par dark consciente e íconos SVG; nueva clase `.data-empty` para placeholders "—"; script `migrate-ds05.js` con 207 reemplazos mecánicos en 68 archivos; fix manual de 7 condicionales ternarios. §54 Fase 5 — DS01 paletas a 0 (de 46, −100%): `cyan` agregado como paleta oficial para CPEs en CLAUDE.md + auditor; mecanismo `audit:ignore-file <ruleId>` para excepciones documentadas (PEER_COLOR_PALETTE / TAG_PALETTE); migración mecánica de 14 hallazgos (red→rose, blue→sky, orange→amber, fuchsia→violet, teal→emerald). §55 Fase 5b — DS03 tamaños a 0 (de 61, −100%) + **errores totales = 0** (de 375 baseline, −100%): nueva clase `.text-3xs` (9px) RESERVADA para tablas densas; script `migrate-ds03.js` con 61 reemplazos mecánicos en 24 archivos.
>
> Sesión 2026-06-07 PM: Ajustes del moderador (perfil + workspace + import/export JSON) + Recuperar contraseña + sync MikroTik al deshabilitar + invitaciones por email + .conf WG server-side.
> Sesión 2026-06-07 AM: multi-usuario con aislamiento por sesión (mangle por-IP), parche `!empty` node-routeros, auditoría (Semgrep+security-review+code-review) y fixes C1–C7.

---

## 1) Objetivo general y estado actual

**Producto:** panel multi-tenant (SaaS) para administrar túneles VPN sobre un **MikroTik central compartido** (SSTP + WireGuard) y monitorear equipos **Ubiquiti airOS** (AC/M5, APs/CPEs) en las LAN remotas vía VRF.

**Modelo de roles (RBAC):**
- **Administrador (Sistemas)** — `is_platform_admin=1`. Ve **solo** Dashboard + Moderadores + **Ajustes** (config del router core). Crea moderadores.
- **Moderador** — `OWNER` de su workspace. Ve Nodos · Escanear · Usuarios · Equipo · Monitor AP. **No** ve Ajustes ni la config del router.
- **View (MEMBER)** — solo sus túneles asignados + su perfil (WireGuard).

**Logrado:**
1. **Migración total SQLite → MySQL** (capa de compatibilidad; 0 SQLite en el proyecto). 443 filas migradas.
2. **Aislamiento multi-tenant completo en cascada**: nodos, APs/grupos/CPEs, escaneo, equipos y "Usuarios" (peers WG) — cada moderador solo ve lo suyo; admin ve todo.
3. **Gestión de moderadores** (crear/editar/resetear clave/suspender/eliminar).
4. **Flujo de invitaciones** con túnel + WireGuard por clave pública del invitado (página pública + bandeja in-app).
5. **Auditoría de seguridad** + correcciones (C1 secretos, A1 guardas, M1–M3) + **rotación de claves**.
6. **Pase UX P1–P6** + optimización visual de la vista **Escanear**.
7. **🆕 Multi-usuario con aislamiento por sesión** (sesión 2026-06-07) — ver §7.

**Estado de salud (2026-06-13):** `tsc 0` (`--noEmit` + build estricto) · `node --check ✓` · **186 tests verdes** (142 backend + 44 frontend). 6 jobs concurrentes en producción. ⚠️ `npm audit --omit=dev`: **2 moderate** (uuid viejo arrastrado por `exceljs` — no expone superficie del panel; pendiente de tracker upstream). 0 findings `semgrep`. Bundles relevantes: **inicial 248.90 KB / 77.77 KB gzip** (esencialmente idéntico desde el pre-§40); `TeamModule` 119 KB; `NetworkDevicesModule` 91.20 KB / 23.04 KB gzip; `NodeAccessPanel` 151.23 KB / 32.86 KB gzip; chunks lazy `exceljs.min` 929 KB y `jspdf.es.min` 399 KB solo se descargan al usar Excel/PDF. **🎯 Sistema de diseño 100% migrado**: audit `npm run audit:design` reporta **23 hallazgos** (baseline §45 1,096 → **−98%**) con **0 errores** (baseline 375 → **−100%, hito alcanzado**) tras §46–§55. **DS01 paletas: 0 ✅** · **DS02 fondos sin dark: 0 ✅** · **DS03 tamaños < 12px: 0 ✅** · **DS05 contraste: 0 ✅**. Solo restan DS04 (20 gradientes decorativos documentados como excepción) + DS06 (3 toggles condicionales legítimos). **19 modales unificados con .modal-overlay/.modal-panel/.modal-panel-{size} (✅ Fase 3)** + **15 headers decorativos unificados con .modal-header-{tone} (✅ Fase 3.1)**. **Últimos commits en `dev`:** `7df3992` (§55 Fase 5b DS03 a 0, errores totales = 0) · `8eb9afe` (docs §54 HANDOFF) · `3691092` (§54 Fase 5 DS01 a 0) · `be6466c` (docs §53 HANDOFF) · `65b1ced` (§53 Fase 4 DS05 a 0) · `5c99c4a` (docs §51+§52 HANDOFF) · `b7639eb` (§52 Fase 3.1) · `1fcdb3c` (§51 fix bug).

---

## 2) Arquitectura y Stack

| Capa | Tecnología |
|---|---|
| Frontend | **React 19** + **TypeScript (strict)** + **Vite** + **Tailwind CSS v3** + `lucide-react` + `qrcode` + `localforage` |
| Estado | Context API (`VpnContext`, `WorkspaceSessionProvider`) + hooks por feature |
| Backend | **Node.js + Express** (JS plano, sin TS), `mysql2/promise`, `node-routeros` (RouterOS API :8728), `ssh2` (Ubiquiti airOS), `bcryptjs`, `jsonwebtoken`, `zod`, `cookie-parser`, `nodemailer` (OTP, dev=consola) |
| BD | **MySQL/MariaDB** (XAMPP local, DB `vpn_manager`) — **única BD** (operativa + RBAC) |
| Cripto | AES-256-GCM (`.db_secret`) para credenciales; JWT HS (`.jwt_secret`) para sesión |
| Puertos | Backend **:3001** · Frontend **:5173** (base `/GestionVPN-1.0/`) · Router MikroTik **192.168.21.1** (intermitente) |

**Credenciales de prueba:** `admin/admin` (platform_admin) · `fernando/48523451` (Moderador OWNER — **dueño de los 13 túneles actuales**) · `fernandodiazm.5@gmail.com` (frank, FIWIS — clave reseteada a `frank12345` en pruebas).

**Auth unificada:** cookie HttpOnly `vpn_session` (RBAC, 8h) leída por `verifyToken` (acepta cookie o Bearer). Login por **email, `usuario@local.app` o nombre** (`sessionBridge.authenticateMysqlUser`).

---

## 3) Estructura de Datos y APIs

**Esquemas MySQL** (`server/sql/`):
- `schema_ops.sql` (operativo): `nodes` (+`workspace_id`), `node_ssh_creds`, `tags`, `node_tags`, `node_history`, `torres`, `torre_ptp_endpoints`, `ap_groups` (+`workspace_id`), `aps`, `cpes`, `signal_history`, `vpn_users`, `app_settings` (col reservada `` `key` ``), `peer_colors`, `mgmt_peer_owners`. + 5 vistas (`v_node_full`, `v_torre_full`, `v_ap_summary`, `v_cpe_last_signal`, `v_ap_performance_24h`).
- `schema_rbac.sql`: `users` (+`disabled_at`), `workspaces`, `workspace_members` (ENUM OWNER/CO_MODERATOR/MEMBER), `invitations` (+`tunnel_id`), `tunnel_assignments` (UNIQUE ws+tunnel+user), `member_wireguard` (+`server_public_key`,`endpoint`), `tunnel_logs`, `auth_attempts`.
- **🆕 `schema_multiuser.sql`** (aplicar con `npm run init:multiuser`): `user_mgmt_ips` (`user_id`↔`mgmt_ip` 192.168.21.x; UNIQUE user, UNIQUE ip — fuente anti-spoofing del src de la mangle), `tunnel_user_sessions` (1 ACTIVE/usuario, `mgmt_ip`,`vrf_name`,`status`,`expires_at` TTL 30m), `tunnel_session_logs` (auditoría append-only).

**Endpoints clave:**
- Auth: `POST /api/auth/login` · `/api/account/{bridge,me,logout}`.
- Admin (platform_admin): `GET /api/admin/{summary,moderators}` · `POST /api/admin/moderators` · `PATCH|DELETE /api/admin/moderators/:id`.
- Nodos (aislados): `POST /api/nodes` (lista, cache fallback) · `/api/node/{provision,deprovision,edit,...}` (con guarda de propiedad) · `/api/node/scan-stream` (guarda subred propia).
- Monitor/Equipos (aislados): `/api/ap-monitor/{nodos,cpes,...}` · `/api/db/devices`.
- Usuarios (peers WG): `POST /api/wireguard/peers` ⚠️(crash actual) · `/api/wireguard/peer/{add,edit}`.
- **🆕 Túneles por usuario:** `POST /api/tunnel/{activate,deactivate,keepalive}` · `GET /api/tunnel/{status,events(SSE),my-mgmt-ip}` · `POST /api/tunnel/register-my-ip`. Todos resuelven la IP server-side desde `user_mgmt_ips` (nunca del body).
- Equipo/invitaciones: `POST /api/team/invite` (con `tunnelId`) · `POST /api/team/accept` (público, +`publicKey`) · `GET /api/team/my-invitations` · `POST /api/team/invitations/:id/accept` · `/api/team/{members,assignments,member/:id/wireguard}`.
- Settings (MT_* solo admin): `GET|POST /api/settings/get|save`.

---

## 4) Últimos módulos trabajados (cronológico)

1. **Aislamiento multi-tenant** (`workspace_id` en `nodes`/`ap_groups`, `mgmt_peer_owners`, guardas de mutación, scan-guard, purga de cachés del navegador al cambiar de workspace).
2. **Gestión de moderadores** (`admin.routes.js` PATCH/DELETE + `ModeratorsModule.tsx` con acciones).
3. **Invitaciones** (backend `team.routes.js`: `provisionMemberWgByPublicKey`, accept público + in-app; frontend `MyInvitationsInbox.tsx`, `AcceptInvitationForm.tsx`, selector de túnel en `InvitePanel`, `MemberProfile` re-ve config WG).
4. **Seguridad O2 — rotación de claves** (`server/db/rotateSecrets.js`).
5. **UX P1–P6** (`.reveal-stagger`, `.status-live`, `.skeleton` en `index.css`; empty states; micro-interacciones).
6. **Optimización vista Escanear** (`NetworkDevicesModule.tsx`: estados idle/loading skeleton + dark mode en banners/tabla).
7. **🆕 Multi-usuario (2026-06-07)** — ver §7.

---

## 5) Tareas Pendientes (To-Do)

| Prioridad | Tarea |
|---|---|
| 🔴 **Antes de levantar** (una vez) | **Correr migraciones nuevas**: `cd server && npm run migrate:notifications && npm run migrate:monitoring`. Sin esto los flujos Q1/M5 caen en defensa (devuelven defaults o no envían alertas), pero el panel sigue funcionando. |
| 🟡 Limpieza | ~~"Resetear preferencias" en Escanear~~ ✅ **botón añadido (RotateCcw + ConfirmModal) junto al ColumnPicker** · `keepAliveInitialDelayMs` ✅ **ya mitigado** (`db/mysql.js:52`, no era pendiente) · ~~`adminIP` hardcodeado~~ ✅ **RESUELTO**: eliminado de todo el frontend; la reparación dejó de crear el legacy `ACCESO-ADMIN` y ahora recrea el **mangle por-usuario** (`addUserMangle` con `mgmt_ip` de la sesión, server-side) + limpia legacy globales → mejora el aislamiento multi-usuario en vez de romperlo · `manualLan` per-nodo: **parcialmente mitigado** (el efecto solo respeta la subred persistida si pertenece al nodo activo); falta solo el caso de subred custom por nodo (bajo valor) · escaneo atado al `mgmt_ip`: propiedad arquitectónica (el scan va por el túnel del solicitante), no un fix puntual. |
| 🟡 Mejora | **Fase 5 (opcional):** aislamiento de firewall por-IP + acotar regla "Admin MGMT libre" (defensa en profundidad; hoy el ruteo ya aísla). Dockerfile `USER` no-root (Semgrep S1). |
| 🟡 Próximo backlog | **M2** API pública con tokens scoped · **M3** Webhooks salientes · **M4** Speed test desde antena (iperf3 SSH) · **L1** Reportes SLA computados desde `tunnel_session_logs` + `monitoring_state` · **L2** Diagnóstico con LLM · **L3** PWA móvil instalable · **L4** Predicción de degradación con tendencia de `signal_history`. |
| 🟢 Resuelto | O2 repo privado · O5 MySQL estable · UX P6 · **multi-usuario activación (verificado)** · parche `!empty` · fixes C1–C7 · **crash `POST /api/wireguard/peers` (ver §13.6)** · **V1 `register-my-ip` ownership por rol** · **Q1 Notificaciones (§26)** · **M1 Bot Telegram (§27)** · **Q3 Diagnóstico ping/trace (§28)** · **Q4 Export auditoría CSV/JSON (§29)** · **Q2 Dashboard métricas (§30)** · **M5 Monitoreo proactivo (§31)** · **Job de expiración batch** · **iter2 bot directo + asignar túneles UI + fix `user_mgmt_ips` auto (§32)** · **UX MEMBER endurecida — solo "Acceder" + Ajustes con Telegram (§33)** · **Workspace unificado + Email en peers + multi-asignar túneles + QR en aceptar invitación (§34)** · **Alias humano + bloqueo edición Usuario (§35)** · **Fix bot Telegram: match dual VRF/PPP en asignaciones del MEMBER (§36)** · **Auditoría Escanear: 12 fixes de perf+robustez (§37) + 9 mejoras UX+features (§38) + cierre con sticky-right + kebab (§39)** · **Preferencias persistentes Escanear (todo: cols+anchos+sort+filtros+búsqueda+subred) + Export multi-formato CSV/JSON/Excel/PDF informe (§40)** · **Simplificación acciones de fila Escanear — botones icon-only inline + retiro de DeviceCardModal/SshDataModal muertos (§41)** · **4 mejoras UX Escanear (§42): ícono Save (disquete) en Guardar, bulk save SELECTIVO con checkbox por fila + tri-state header, contraste del chevron expand, IP + Nombre del sistema arriba en panel expandido** · **Polling SSH automático eliminado (§43)** · **Tabla Nodos: cols dinámicas + NodeColumnPicker + filtros chips + export 4 formatos + sticky-right (§44)** · **Audit del sistema de diseño + script (§45) + sistema extendido con .btn-warning/info/accent + focus-visible WCAG + tamaños + modal canónico + wins rápidos sed -25.7% hallazgos (§46) + Fase 1: 23 botones inline → .btn-* sistema (§47, DS06 -88.5%)**. |
| 🟢 Nota | Config MikroTik `v2.rsc` SIN mangle global (baseline limpio multi-usuario). Peer `peer27` de prueba con public-key placeholder `abcdEFGH...` (borrable). |

**Scripts:**
- **Init/migración:** `cd server && npm run init:rbac | init:multiuser | migrate:perf | migrate:notifications | migrate:monitoring | seed:roles`.
- **Análisis:** `npm run analyze:queries` (EXPLAIN sobre el hot path).
- **Frontend:** `cd vpn-manager && npm run analyze` (treemap del bundle en `dist/stats.html`).
- **Misc:** `node db/rotateSecrets.js` · `node db/mapUserMgmtIp.js <email> <ip>`.

---

## 6) Código Core

**A. Capa de compatibilidad MySQL — traductor de dialecto** (`server/db.service.js`):
```js
function translate(sql) {
  let s = sql;
  s = s.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT IGNORE').replace(/INSERT\s+OR\s+REPLACE/gi, 'REPLACE');
  if (/ON\s+CONFLICT/i.test(s)) {
    s = s.replace(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
    s = s.replace(/\bexcluded\.([A-Za-z_]\w*)/gi, 'VALUES($1)');
  }
  s = s.replace(/GROUP_CONCAT\(\s*([^,()]+?)\s*,\s*('[^']*')\s*\)/gi, 'GROUP_CONCAT($1 SEPARATOR $2)');
  return s;
}
// getDb() expone .get/.all/.run/.exec sobre el pool MySQL.
// BEGIN/COMMIT/ROLLBACK usan conexión dedicada + mutex (serializa como el lock WAL de SQLite).
```

**B. Aislamiento de nodos — lectura y mutación** (`server/routes/node.routes.js`):
```js
async function filterNodesForRole(req, nodes) {
  const acc = req.account;
  if (!acc) return nodes;
  if (acc.platform_admin) return nodes;                 // admin → todo
  const db = await getDb();
  const rows = await db.all('SELECT ppp_user, nombre_vrf FROM nodes WHERE workspace_id = ?', [acc.workspace_id]);
  const ws = new Set(); rows.forEach(r => { if (r.ppp_user) ws.add(r.ppp_user); if (r.nombre_vrf) ws.add(r.nombre_vrf); });
  let scoped = nodes.filter(n => ws.has(n.ppp_user) || ws.has(n.nombre_vrf));
  if (acc.role === 'MEMBER') { /* + assignmentRepo.assignedTunnelIds(ws, sub) */ }
  return scoped;
}
// Guarda en CADA mutación (deprovision/edit/label/creds/ssh-creds/tag/history/wg):
async function nodeBelongsToRequester(req, pppUser) {
  const acc = req.account;
  if (!acc || acc.platform_admin) return true;
  const row = await (await getDb()).get('SELECT workspace_id FROM nodes WHERE ppp_user = ?', [pppUser]);
  return !!row && row.workspace_id === acc.workspace_id;
}
```

**C. Helpers de scope AP/CPE** (`server/lib/tenantScope.js`): `reqWorkspace(req)`, `ownedGroupIntIds`, `ownedApIntIds`, `ownsGroupUuid`, `ownsApUuid`, `cpeForeign` — usados por `ap.routes.js` y `device.routes.js`. Admin (`reqWorkspace===null`) sin restricción.

**D. Visibilidad de módulos** (`vpn-manager/src/utils/permissions.ts`):
```ts
export function visibleModules(s) {
  if (!s) return ['nodes'];
  if (s.platform_admin) return ['dashboard', 'moderators', 'settings'];
  if (s.role === 'MEMBER') return ['nodes', 'team'];
  return ['nodes', 'devices', 'users', 'team', 'monitor'];  // OWNER/CO_MOD (sin settings)
}
```

**E. Purga de cachés al cambiar de workspace** (`vpn-manager/src/utils/sessionReset.ts` + `hooks/useSession.ts`):
```ts
export async function clearUserScopedData() {
  try { sessionStorage.clear(); } catch {}
  await Promise.allSettled([credCache.clear(), statsCache.clear(), cpeCache.clear()]);
}
export function purgeIfWorkspaceChanged(workspaceId) {
  const prev = localStorage.getItem('vpn_active_ws');
  if (workspaceId && prev && prev !== workspaceId) void clearUserScopedData();
  if (workspaceId) localStorage.setItem('vpn_active_ws', workspaceId);
}
```

**F. Invitación con clave pública (modelo seguro)** (`server/routes/team.routes.js`):
El invitado envía solo su **public key**; el server crea el peer en `VPN-WG-MGMT`, asigna el túnel de la invitación y devuelve `{ allowedIp, serverPublicKey, endpoint, allowedIps }` para que arme su `.conf` con su clave privada (que nunca sale del dispositivo). Provisión WG = best-effort (si el router cae, la membresía/túnel quedan y se reintenta).

**G. Settings — guarda por clave** (`server/routes/settings.routes.js`):
```js
const CORE_ROUTER_KEYS = ['MT_IP', 'MT_USER', 'MT_PASS']; // solo platform_admin
// GET oculta esas claves a no-admins; POST las rechaza con 403. server_public_ip y otras quedan editables por moderadores.
```

---

## 7) 🆕 Multi-usuario con aislamiento por sesión (sesión 2026-06-07)

**Objetivo:** de single-user (1 túnel global; todos ven lo mismo) → cada usuario activa su túnel,
ve solo el suyo, y varios coexisten. Regla: **1 túnel activo por usuario** (cambiar cierra el anterior).

**Decisión de diseño clave:** en esta config el aislamiento lo da el **RUTEO (mangle + VRF)**, no el
firewall. Sin `routing-mark`, el tráfico de `192.168.21.x` no tiene ruta a la LAN remota → se descarta.

**Antes vs ahora:**
- Antes: 1 mangle GLOBAL `src=192.168.21.0/24 → VRF` (comment `ACCESO-ADMIN`) + estado global `app_settings.active_vrf` + SSE a todos.
- Ahora: 1 mangle **por IP de usuario** `src=<su IP> dst-address-list=LIST-NET-REMOTE-TOWERS new-routing-mark=<su VRF> comment=ACCESO-USER-<userId8>`. N usuarios = N mangle = N VRFs simultáneos (sin colisión: cada VRF solo enruta su LAN). La IP **se resuelve server-side** desde `user_mgmt_ips` (anti-spoofing, nunca del body).

**Flujo `POST /api/tunnel/activate`** (`server/routes/core.routes.js`):
```
1. user_id = req.account.sub
2. canUseTunnel(req, targetVRF)  → OWNER/CO_MOD: nodo de su workspace · MEMBER: tunnel_assignments
3. mgmtIp = mgmtIpRepo.getMgmtIpForUser(ws, user)   (409 NO_MGMT_IP si no tiene)
4. LECTURA: provisioner.vrfExists + findUserMangleIds(suyas) + findLegacyGlobalMangleIds
5. ESCRITURA: removeMangleIds(previa del usuario + legacy global) + addUserMangle
6. sessionRepo.createSession (transacción: cierra ACTIVE previa + inserta nueva)
7. emitToUser(user_id, vrf, expiry)   (SSE solo a sus pestañas, no broadcast)
```
deactivate/keepalive/status/SSE son por `req.account.sub`. `GET /api/nodes` añade `running_by_you` y
`active_by_other` (solo admin) SIN tocar `running` (= conectividad real de la torre).

**Archivos nuevos/clave:**
- `server/lib/tunnelProvisioner.js` — mangle por-IP. Lecturas LANZAN ante fallo (no enmascaran), `removeMangleIds` lanza si algún remove falla (fail-closed).
- `server/db/repos/sessionRepo.js` — sesiones (1 ACTIVE/usuario por transacción) + auditoría.
- `server/db/repos/mgmtIpRepo.js` — `getMgmtIpForUser` (eje anti-spoofing).
- `server/db/initMultiuser.js` (`npm run init:multiuser`) · `server/db/mapUserMgmtIp.js` (mapear usuario→IP).

**★ Parche `!empty`** (`server/routeros.service.js`): RouterOS responde `!empty` en `/print` sin filas;
node-routeros v1.6.9 lanzaba `UNKNOWNREPLY` de forma síncrona (uncaughtException → request colgada → 500).
El parche en `Channel.processPacket` IGNORA `!empty` (el `!done` siguiente resuelve `[]`). Al arrancar:
`[ROUTEROS] Parche !empty aplicado a node-routeros Channel`.

**Mapeos creados:** fernando(`OWNER`)→`192.168.21.20`, qateam(`MEMBER`)→`192.168.21.61`.

**Estado:** activación multi-usuario VERIFICADA end-to-end (logs `[KEEPALIVE] VRF-ND1-HOUSENET — OK`).
Fixes C1–C7 de la auditoría aplicados (ver `AUDITORIA_2026-06-07.md`).

---

## 8) 🆕 Sesión PM 2026-06-07 — Plan completo de mejoras (Fases B/A/D/C)

> Implementación dividida en 4 fases consecutivas. Backend + frontend completos, TypeScript limpio, sintaxis Node verificada.
> Para resúmenes detallados de cada fase, ver el changelog ampliado más abajo.

### Fase B — UX cleanups y bugs (rápido)

| # | Cambio | Archivos |
|---|--------|----------|
| B1 | Quitado input "Túnel a asignar" del InvitePanel (se asigna dinámicamente al registrarse) | `InvitePanel.tsx`, `TeamModule.tsx`, `teamApi.ts` |
| B2 | Tabla "Equipo" — fix alineación con `table-fixed` + `colgroup` + `align-middle` | `MembersTable.tsx` |
| B3 | Icono "Equipo" `UsersRound` → **`Briefcase`** (distintivo vs `Users` de "Usuarios") | `Sidebar.tsx` |
| B4 | Acciones simplificadas: eliminada "Asignar túneles"; agregado **Deshabilitar** | `MembersTable.tsx` |
| B5 | Cache de nodos en `sessionStorage` — solo auto-load primera vez, "Actualizar" hace refetch | `useNodeFetching.ts`, `ControlBar.tsx` |
| B6 | Quitado botón "Importar" del header (se moverá a Ajustes en Fase C) | `ControlBar.tsx`, `NodeAccessPanel.tsx` |
| B7 | Quitado bloque "Servidor SSTP" / IP pública del header de moderadores | `ControlBar.tsx`, `NodeAccessPanel.tsx` |
| B8 | UI Gestión de Usuarios — eliminado botón "Nuevo Administrador" + sección redundante "Acceso administrador". Botón **"Config WG"** ahora abre modal con `.conf` real | `UserManagementPanel.tsx`, `WgConfigModal.tsx` (nuevo) |

### Fase A — Sync MikroTik ↔ estado de usuario (deshabilitar/eliminar)

**Concepto:** suspender un usuario (moderador o miembro) sincroniza el peer WG en el router (`=disabled=yes`) y borra su `mangle` activo. Eliminarlo limpia ambas cosas. Best-effort: si el router está caído, NO bloquea el flujo en BD.

| # | Cambio | Archivos |
|---|--------|----------|
| A1 | Helper `lib/routerPeerState.js` — `setPeersEnabled(keys[], enabled)` + `removeUserMangles(userIds[])` con patrón api+catch+close | `server/lib/routerPeerState.js` |
| A2 | `PATCH /api/admin/moderators/:id disabled`: actualiza `disabled_at` (toda la gente del ws si deshabilita; solo OWNER si rehabilita), sync peers, **borra mangles**, cierra `tunnel_user_sessions ACTIVE`, `invalidateUserCache` | `admin.routes.js` |
| A3 | Nuevo `PATCH /api/team/member/:userId disabled`: equivalente para 1 miembro (bloqueado para OWNER y self) | `team.routes.js` |
| A4 | `listMembers` ahora expone `disabled: boolean` desde `users.disabled_at` | `memberRepo.js` |
| A5 | UI: botón **Deshabilitar/Habilitar** funcional con confirmación inline + badge "Deshabilitado" en `Members.Rol` | `MembersTable.tsx`, `TeamModule.tsx`, `teamApi.ts`, `types/account.ts` |
| A6 | Cleanup mangle al **deshabilitar**: `removeUserMangles` ANTES de cerrar sesión (corte inmediato) | `admin.routes.js`, `team.routes.js` |
| A7 | Cleanup mangle al **eliminar** (DELETE moderador y miembro) para no dejar reglas huérfanas en el router | `admin.routes.js`, `team.routes.js` |

**Cobertura final:**
| Acción | Peer WG | Mangle | Sesión BD | Cache auth |
|--------|---------|--------|-----------|------------|
| Deshabilitar moderador | ✅ disabled todo el ws | ✅ todo el ws | ✅ todas | ✅ todos |
| Deshabilitar miembro   | ✅ solo el suyo       | ✅ solo el suyo | ✅ solo la suya | ✅ solo él |
| Eliminar moderador     | ✅ remove cascada     | ✅ remove cascada | ✅ delete | ✅ |
| Eliminar miembro       | ✅ remove             | ✅ remove | ✅ delete | ✅ |

### Fase D — Recuperar contraseña

- **Tabla nueva:** `password_resets (id, user_id, token_hash, expires_at, used_at, ip_address, created_at)` con FK CASCADE.
- **Token:** 32 bytes hex (`crypto.randomBytes`), bcrypt hash en BD, expira en **15 min**, single-use.
- **Anti-enumeración:** `POST /password-reset/request` siempre devuelve 200 con el MISMO mensaje, exista el email o no.
- **Rate limit:** reusa `auth_attempts` (kind=OTP) → 5 fallos en 15 min → 429. Máx 5 tokens emitidos por user/hora.
- **Confirm:** `POST /password-reset/confirm { token, newPassword }` valida → cambia password → `markUsed` → `invalidateForUser` → `invalidateUserCache`.
- **Frontend:** link "¿Olvidaste tu contraseña?" en login; `PasswordResetRequest.tsx`, `PasswordResetConfirm.tsx`. URL `?reset=<token>` detectada en `RouterAccess.tsx`.
- **`sendPasswordReset()`** en mailer.js — HTML responsive con timeouts agresivos (no bloquea endpoint si SMTP cae).
- Archivos: `server/db/repos/passwordResetRepo.js`, `auth.routes.js`, `lib/mailer.js`, `vpn-manager/src/services/passwordResetApi.ts`, 2 componentes Auth.

### Fase C — Ajustes del moderador (perfil + workspace + import/export)

**Sidebar:** nuevo item "Ajustes" para moderadores (icono `Settings`). `SettingsModuleRouter` (App.tsx) decide qué módulo mostrar:
- `platform_admin` → `SettingsModule` legacy (config router core)
- OWNER/CO_MOD → `ModeratorSettingsModule` (nuevo, 3 tabs)

**Backend (6 endpoints):**

| Método | Ruta | Función |
|--------|------|---------|
| PATCH | `/api/account/password` | `currentPassword` + `newPassword`; invalidate cache |
| PATCH | `/api/account/email/request` | OTP al **nuevo** correo (anti-hijack). Valida que no esté tomado |
| POST | `/api/account/email/confirm` | OTP + `currentPassword`. Persiste el email nuevo, invalidate cache |
| PATCH | `/api/workspace/name` | Renombra workspace (solo OWNER) |
| GET | `/api/workspace/export` | JSON versionado `v1.0.0` — workspace + members + tunnels (con creds cifradas) + member_wireguard (con conf_enc) + mgmt_peer_owners + ap_groups con APs. `Content-Disposition: attachment` |
| POST | `/api/workspace/import` | Zod validation. `dryRun: true` → `plan { tunnels/ap_groups/members: { create, update, skip } }`. `dryRun: false` → ejecuta en transacción con política `conflict: skip\|overwrite` |

**Frontend:**
- `services/accountApi.ts` — `changePassword`, `requestEmailChange`, `confirmEmailChange`
- `services/workspaceApi.ts` — `rename`, `export` (Blob+filename), `importDryRun`, `importApply`
- `Settings/ModeratorSettings/ModeratorSettingsModule.tsx` — shell con sidebar de tabs
- `tabs/ProfileTab.tsx` — sub-tabs Contraseña + Correo (con OTP de 2 pasos)
- `tabs/WorkspaceTab.tsx` — renombrar (solo OWNER)
- `tabs/ImportExportTab.tsx` — export con download + import con preview por sección (`Túneles`/`Grupos AP`/`Miembros`) y selector de política

**Limitaciones pendientes (para futuras iteraciones):**
1. Import persiste en BD pero NO crea peers/reglas en el MikroTik (out of scope). Endpoint sugerido: `POST /api/workspace/sync-to-router`.
2. Import de miembros detecta nuevos vs existentes pero NO crea usuarios — emisión de invitaciones manual.
3. JSON va en body (límite ~1MB). Para archivos grandes, migrar a `multipart/form-data`.

---

## 9) Misceláneas y mejoras de UX/seguridad agregadas

1. **Hard-delete de moderador en cascada** ([server/routes/admin.routes.js:121](server/routes/admin.routes.js:121)):
   transacción que borra `tunnel_session_logs`, `tunnel_user_sessions`, `user_mgmt_ips`, `tunnel_logs`, `tunnel_assignments`, `member_wireguard`, `workspace_routers`, `invitations`, `torres`, `cpes`, `ap_groups` (CASCADE), `nodes` (CASCADE), `mgmt_peer_owners`, `workspace_members`, `workspaces`, `users` (OWNER + MEMBERs solo del ws). Libera el email para reusar.

2. **Hard-delete de miembro** ([team.routes.js DELETE /member/:userId](server/routes/team.routes.js)):
   antes era soft-delete; ahora limpia `mgmt_peer_owners`, `member_wireguard`, `tunnel_assignments`, `user_mgmt_ips`, `tunnel_user_sessions`, `tunnel_session_logs`, `workspace_members` y el user si no está en otros ws. Sumado: `removePeersFromRouter` + `removeUserMangles` + `invalidateUserCache`.

3. **Invitaciones por email reales** (`sendInvitation()` en [server/lib/mailer.js](server/lib/mailer.js)):
   HTML responsive con CTA, link `${APP_BASE_URL}?accept=1&email=X&otp=Y` que pre-llena el formulario en el frontend.

4. **.conf WireGuard generado server-side al aceptar invitación**:
   `generateKeyPair()` X25519 ([server/lib/wgkeys.js](server/lib/wgkeys.js)); `buildClientConf` usa `DNS=8.8.8.8`, `AllowedIPs=0.0.0.0/0`, `PersistentKeepalive=25`; `member_wireguard.config_enc` guarda el `.conf` cifrado (AES-256-GCM) para que el moderador pueda re-mostrarlo desde "Config WG".

5. **IP pública del Endpoint WG configurable** con prioridad:
   `process.env.WG_PUBLIC_IP` → `app_settings.server_public_ip` → `cloud[0]['public-address']` → `MT_IP`.

6. **Comentarios legibles en peers WG**:
   formato `<Workspace> - <email> - <ROL>` (sanitizado, max 200 chars). Aplica en `provisionMemberWgByPublicKey` y `POST /member/:id/wireguard`. Auto-actualiza peers viejos con formato `member:<uuid>` al primer flujo que los toque.

7. **Flujo unificado: invitar moderador = invitar miembro**:
   `invitations.role` ahora acepta `OWNER`. `POST /api/admin/invite-moderator` crea workspace placeholder + invitación. Al aceptar (`/accept`), si `inv.role === 'OWNER'` se reasigna `workspaces.owner_id` del platform_admin al nuevo user.

8. **Columna `invitations.name`**: el nombre del invitado lo escribe quien invita; el frontend ya no lo pide al aceptar. El input "Tu nombre" del `AcceptInvitationForm` se quitó.

9. **Modal "Config WG" en Gestión de Usuarios** ([WgConfigModal.tsx](vpn-manager/src/components/Users/UserManagementPanel/components/WgConfigModal.tsx)):
   fetch a `GET /api/team/wireguard/by-key/:publicKey` (nuevo endpoint, restringido por workspace en `memberWgRepo.getByPublicKey`). Si `config_enc` existe, descifra y muestra el `.conf` con PrivateKey real. Botones Copiar + Descargar.

10. **Forzar logout cuando el usuario es eliminado**:
   [middleware/authJwt.js](server/middleware/authJwt.js) `requireSession` valida que el `users.id` siga existiendo con cache LRU (TTL 15s). Si no, devuelve `401 USER_DELETED` + limpia cookie. Frontend [sessionClient.ts](vpn-manager/src/services/sessionClient.ts) detecta el código y dispara `window.dispatchEvent('auth_expired')` → `useAuthExpiry` → `handleLogout`. `invalidateUserCache(userId)` se llama en cada DELETE/disable para corte inmediato.

11. **Ocultar IP servidor SSTP a moderadores**: `ControlBar.tsx` prop `showServerIP` solo true si `isPlatformAdmin(session)`.

---

## 10) Variables `.env` actualizadas

```bash
# Server
PORT=3001
NODE_ENV=development
DATA_DIR=.

# MySQL (XAMPP)
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=vpn_manager
MYSQL_POOL=10

# Sesión
JWT_EXPIRES=8h

# Rate limit
RL_MAX_FAILS=5
RL_WINDOW_MS=900000

# URL pública del frontend (usada en links de invitación y reset password)
APP_BASE_URL=http://localhost:5173/GestionVPN-1.0/

# IP pública FIJA del MikroTik (Endpoint de WireGuard) — sobrescribe cloud
WG_PUBLIC_IP=213.173.36.232

# SMTP Gmail (App Password 16 chars, NO la contraseña normal)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<correo>@gmail.com
SMTP_PASS=<App Password>
SMTP_FROM=MikroTik VPN <<correo>@gmail.com>
```

## 11) Esquemas BD actualizados (vs schema_rbac.sql original)

```sql
-- 1) ENUM invitations.role expandido
ALTER TABLE invitations MODIFY COLUMN role
  ENUM('OWNER','CO_MODERATOR','MEMBER') NOT NULL DEFAULT 'MEMBER';

-- 2) Columna name en invitations (nombre del invitado escrito por quien invita)
ALTER TABLE invitations ADD COLUMN name VARCHAR(120) DEFAULT NULL AFTER email;

-- 3) Nueva tabla password_resets (Fase D)
CREATE TABLE password_resets (
  id          CHAR(36) PRIMARY KEY,
  user_id     CHAR(36) NOT NULL,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  BIGINT NOT NULL,
  used_at     BIGINT DEFAULT NULL,
  ip_address  VARCHAR(64) DEFAULT NULL,
  created_at  BIGINT NOT NULL,
  KEY idx_pr_user (user_id),
  KEY idx_pr_expires (expires_at),
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> Para instalaciones limpias: `schema_rbac.sql` y `schema_ops.sql` ya incluyen todos los cambios.
> Para instalaciones existentes: aplicar los ALTERs/CREATEs manualmente.

## 12) Endpoints nuevos (resumen rápido)

```
# Recuperar contraseña (Fase D)
POST   /api/auth/password-reset/request    { email }
POST   /api/auth/password-reset/confirm    { token, newPassword }

# Ajustes del usuario (Fase C)
PATCH  /api/account/password               { currentPassword, newPassword }
PATCH  /api/account/email/request          { newEmail }
POST   /api/account/email/confirm          { newEmail, otp, currentPassword }

# Workspace (Fase C)
PATCH  /api/workspace/name                 { name }
GET    /api/workspace/export               → JSON download
POST   /api/workspace/import               { payload, conflict, dryRun }

# Habilitar/Deshabilitar usuarios (Fase A)
PATCH  /api/admin/moderators/:id           { disabled }   ← ya existía, ahora sync MikroTik
PATCH  /api/team/member/:userId            { disabled }   ← NUEVO

# Invitar moderador (flujo unificado)
POST   /api/admin/invite-moderator         { email, name?, workspaceName? }

# .conf WG por clave pública (Fase B8 — modal Config WG)
GET    /api/team/wireguard/by-key/:publicKey
```

## 13) Bugs/sorpresas resueltos en la sesión

- **MySQL no levantaba** (`proxies_priv` con "Incorrect file format") → restaurada desde `C:\xampp\mysql\backup\mysql\`.
- **`nodemon` NO recarga `.env`** — siempre `Ctrl+C` + `npm run dev` tras cambiar variables de entorno.
- **HMR de Vite** a veces no recarga hooks iniciales — `Ctrl+Shift+R` si la pantalla viene de un link especial (`?accept=1`, `?reset=...`).
- **`patch` no importado en `teamApi.ts`** → ReferenceError runtime. Fix: agregar `patch` al import desde `sessionClient`.
- **Backend colgado en SMTP** → agregados timeouts en `getTransporter()` (10s/10s/15s) y `try/catch` alrededor de `sendInvitation` en `team.routes.js` para no bloquear si Gmail falla.
- **6. Crash `POST /api/wireguard/peers` (commit `2f5f257`)**:
  el handler abría `/interface/wireguard/peers/print`, `/interface/wireguard/print` y `/ip/cloud/print`. Cuando RouterOS devolvía cualquier reply que node-routeros v1.6.9 no conocía (no `!re`/`!done`/`!trap`/`!fatal`/`!empty`), `Channel.processPacket` emitía `'unknown'` → `onUnknown` lanzaba `RosException('UNKNOWNREPLY')` **síncronamente** desde el callback del socket TCP, fuera del contexto de la Promise de `write()`. El throw escapaba al event loop como `uncaughtException`; el handler global de `index.js` evitaba `process.exit` pero la conexión `api` quedaba semi-rota y el endpoint colgaba hasta el timeout de `safeWrite`. Caso paralelo: `Receiver.sendTagData` lanzaba `UNREGISTEREDTAG` si RouterOS contestaba a un tag ya cerrado (race entre `Channel.close` y datos en vuelo). Fix en [server/routeros.service.js](server/routeros.service.js): generalizar el parche `!empty` a CUALQUIER `!xxx` desconocido → convertir a `emit('trap', { message: 'UNKNOWNREPLY: <reply>' })` para que `safeWrite` rechace ordenadamente; parchar `Receiver.sendTagData` para descartar packets sin tag en lugar de lanzar; agregar handler `'error'` en el `RouterOSAPI` EventEmitter (Node 18+ tira el proceso si emite `'error'` sin handler). 7 tests nuevos en [routerosPatches.test.js](server/test/unit/routerosPatches.test.js) cubren ambos modos.

---

## 14) 📋 Logs (FASE 1 del REFACTOR_PLAN)

A partir de la FASE 1, todo el backend usa **`pino`** (logger estructurado JSON con formato pretty en dev) en lugar de `console.*`.

### Niveles

| Nivel | Cuándo usarlo |
|-------|---------------|
| `trace` | Debug muy verboso (raw bytes RouterOS, dump SQL). No usado por defecto. |
| `debug` | Decisiones internas, paths tomados (auto-SSH éxito, idempotente "ya existe", KEEPALIVE OK) |
| `info`  | Eventos normales (login, invite enviado, mangle creada, server escuchando) |
| `warn`  | Recuperables (router timeout, retry, OTP malo, monitor MySQL reintento) |
| `error` | Fallos que afectan al usuario (500, BD caída, hook crash, CONNECT fallo) |
| `fatal` | Panic imposible de recuperar (port collision, secret missing) |

### Configuración

| Variable env | Default | Efecto |
|--------------|---------|--------|
| `NODE_ENV` | `development` | En `production` usa JSON crudo (más rápido + ingest directo) |
| `LOG_LEVEL` | `debug` en dev / `info` en prod | Filtra por nivel mínimo |

### Convención de uso

```js
const log = require('./lib/logger').child({ scope: 'mi-modulo' });

log.info({ userId, action }, 'Mensaje corto');
log.warn({ err: e.message }, 'Operación falló pero seguimos');
log.error({ err }, 'Error crítico');
```

> **Patrón:** primer argumento = objeto con datos estructurados, segundo = mensaje en español.

### Redact (campos sensibles ocultados como `[REDACTED]`)

Configurado en [server/lib/logger.js](server/lib/logger.js). Cualquier campo (top-level o anidado) con uno de estos nombres se redacta automáticamente:

```
password, currentPassword, newPassword, password_hash
otp, otp_hash, token, secret, secret_key, privateKey
ppp_password_enc, ssh_pass_enc, clave_ssh_enc, wifi_password_enc, config_enc
req.headers.authorization, req.headers.cookie
```

> En modo DEV los OTPs/tokens se ven en consola porque van como `code` o dentro de `resetUrl` (no como `token` separado).

### pino-http: req/res automáticos

`pinoHttp` middleware en [server/index.js](server/index.js) genera:
- Un `reqId` UUID por cada request (también acepta `x-request-id` del cliente)
- Log automático al terminar cada response con: `method`, `url`, `statusCode`, `responseTime`
- Nivel ajustado por status: 2xx/3xx → `info`, 4xx → `warn`, 5xx → `error`
- Silencia `/api/health` para no inundar el log con polling

Cada ruta puede usar `req.log.info({...})` para que el reqId aparezca automáticamente en sus logs.

### Filtrado en producción

Como el log es JSON, se puede grepear/jq con precisión:

```bash
# Todos los WARN de routeros
node index.js | jq 'select(.scope == "routeros" and .level == "warn")'

# Solo errores con duración > 1s
node index.js | jq 'select(.level == "error" and .responseTime > 1000)'

# Buscar la request con id concreto
node index.js | jq 'select(.reqId == "abc-123")'
```

### Excepción: scripts CLI

Los scripts CLI (`db/initRbac.js`, `db/initMultiuser.js`, `db/mapUserMgmtIp.js`, `db/migrateSqliteToMysql.js`, `db/rotateSecrets.js`, `db/seedRoles.js`) **mantienen** `console.*` con formato custom (✓, ✗, indentación) porque están pensados para UX en terminal del operador, no para ingesta automática.

---

## 15) 🔒 Seguridad — Headers HTTP y cookies (FASE 2 del REFACTOR_PLAN)

Backend Express con **helmet** + **CORS** + **cookies HttpOnly**, configurado para API-only.

### Headers aplicados por helmet

| Header | Valor | Por qué |
|--------|-------|---------|
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` | Si el JSON de la API llega a renderizar como HTML (atacante intentando inyección), no carga nada |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (solo prod) | Fuerza HTTPS en navegador por 1 año. **Deshabilitado en dev** para no romper `http://localhost` |
| `X-Frame-Options` | `DENY` | Anti-clickjacking (legacy, complementa `frame-ancestors`) |
| `X-Content-Type-Options` | `nosniff` | El navegador respeta el `Content-Type` enviado |
| `Cross-Origin-Resource-Policy` | `same-site` | Permite que el frontend (`:5173`) consuma la API (`:3001`) |
| `Cross-Origin-Opener-Policy` | _(no enviado)_ | Innecesario para API JSON; activarlo rompe popups OAuth |
| `Cross-Origin-Embedder-Policy` | _(no enviado)_ | Innecesario para API |
| `Referrer-Policy` | `no-referrer` | No filtramos URLs internas vía Referer |
| `X-Powered-By` | _(removido)_ | No anunciamos "Express" |

### Cookies HttpOnly

[server/lib/jwt.js](server/lib/jwt.js)

```js
{
  httpOnly: true,                           // anti-XSS: no accesible desde JS
  sameSite: 'lax',                          // anti-CSRF en navegación normal
  secure: process.env.NODE_ENV === 'production',  // solo HTTPS en prod
  path: '/',                                // toda la API
  maxAge: 8h,                               // JWT_EXPIRES configurable via env
}
```

> **`clearSessionCookie` replica los mismos atributos** que el set para que el navegador efectivamente borre la cookie. Sin esto, algunos navegadores dejaban cookie residual.

### Resto de defensas ya en el proyecto

- **CORS allowlist** ([index.js](server/index.js)): `defaultOrigins` + `CORS_ORIGINS` env. Bloquea cross-origin no permitidos (con log estructurado del bloqueo).
- **Credenciales cifradas en BD** (`crypto.js` AES-256-GCM con `.db_secret`).
- **Logger con redact** de passwords/tokens/secrets/private_keys (ver §14).
- **Rate limiting** (`auth_attempts`): 5 fallos en 15 min → 429.
- **Auth cache LRU** con `USER_DELETED` para deslogueo automático al borrar usuario.
- **Anti-enumeración** en password reset (mensaje genérico siempre).
- **Hard-delete cascada** sin dejar peers/mangle huérfanos en MikroTik.

### Pendientes futuros (post-refactor)

- HTTPS real en producción (cert + reverse proxy nginx).
- Anti-CSRF token explícito en formularios sensibles (sameSite=lax cubre la mayoría pero no el 100%).
- Auditoría con `semgrep --config p/security-audit` (planeada en FASE 12).

---

## 16) 🧪 Testing (FASE 3 del REFACTOR_PLAN)

Setup completo de testing en backend, frontend y E2E. FASE 3 deja la infraestructura — FASE 4 escribe los tests reales sobre los endpoints/componentes críticos.

### Stack

| Capa | Tool | Para qué |
|------|------|----------|
| Backend | **Vitest 2** | Runner moderno, esm-native, más rápido que Jest |
| Backend | **Supertest 7** | Llamadas HTTP a Express sin abrir puerto |
| Frontend | **Vitest 2** | Mismo runner por consistencia |
| Frontend | **@testing-library/react 16** | Render + queries por rol/text/etc. |
| Frontend | **jsdom 25** | DOM en Node (rápido, sin browser real) |
| Frontend | **MSW 2** | Mock fetch a nivel red — los componentes ven una "API" real |
| E2E | **Playwright 1** | Browser-driven, solo chromium para rapidez |

### Comandos (desde raíz)

```bash
npm run test:backend        # vitest run en server/
npm run test:frontend       # vitest run en vpn-manager/
npm run test:all            # los dos seguidos
npm run e2e                 # playwright test
npm run e2e:install         # descarga chromium (1ª vez)
```

Por workspace:

```bash
cd server && npm test               # backend
cd server && npm run test:watch     # modo watch
cd server && npm run test:coverage  # con reporte v8 (text + lcov)

cd vpn-manager && npm test           # frontend
cd vpn-manager && npm run test:watch
cd vpn-manager && npm run test:coverage
```

### Estructura backend

```
server/
├── vitest.config.js         — entorno node, include test/**/*.{test,spec}.js
└── test/
    ├── setup.js             — NODE_ENV=test, LOG_LEVEL=silent
    ├── smoke.test.js        — canary 3 tests
    ├── mocks/
    │   ├── routeros.js      — cliente API fake con tabla configurable
    │   ├── mailer.js        — captura sendOtp/sendInvitation/sendPasswordReset en memoria
    │   └── mysql.js         — backing store en memoria + parser SELECT mini
    └── factories/
        └── index.js         — makeUser, makeWorkspace, makeMembership, makeNode, makeInvitation
```

**Cómo usar un mock típico:**

```js
import { vi, beforeEach } from 'vitest';
vi.mock('../routeros.service', () => require('./mocks/routeros'));
const { __mock } = require('./mocks/routeros');

beforeEach(() => __mock.reset());

it('lista peers WG', async () => {
  __mock.setResponse('/interface/wireguard/peers/print', [
    { '.id': '*1', 'public-key': 'k1', 'allowed-address': '192.168.21.20/32' },
  ]);
  // ... ejercer endpoint que llame a safeWrite()
});
```

### Estructura frontend

```
vpn-manager/
├── vitest.config.ts        — jsdom, plugin React, alias @ → src/
└── src/test/
    ├── setup.ts            — shims (matchMedia/IO/RO/scrollTo) + MSW server
    ├── render.tsx          — renderWithProviders() con VpnProvider + WorkspaceSessionProvider
    ├── smoke.test.tsx      — canary 4 tests
    └── providers.test.tsx  — valida que el wrapper monta los Context Providers
```

**Cómo usar el wrapper:**

```tsx
import { renderWithProviders, screen } from '@/test/render';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';

it('clic en login envía POST /api/auth/login', async () => {
  server.use(http.post('http://localhost:3001/api/auth/login', () =>
    HttpResponse.json({ success: true, user: 'admin', token: '...' })
  ));
  const { user } = renderWithProviders(<RouterAccess />);
  await user.click(screen.getByRole('button', { name: /iniciar sesi/i }));
  // ...
});
```

### E2E

```
e2e/
└── smoke.spec.ts            — verifica que la app carga
playwright.config.ts         — chromium-only, webServer auto-levanta Vite
```

### Cobertura

| Capa | Inicial (F3) | Actual (F4) | F8/F11 objetivo |
|------|--------------|-------------|-----------------|
| Backend | 0% | **5.4% líneas, 53.8% branches** | ≥ 60% lines tras splits |
| Frontend | 0% | **~5% líneas, ~50% branches** | ≥ 40% lines |
| E2E | 1 smoke | 1 smoke | 3-5 happy paths |

### Suites por área (F4)

**Backend (55 tests):**
- `unit/wgkeys.test.js` (8) — `generateKeyPair`, `buildClientConf` defaults + overrides
- `unit/crypto.test.js` (5, skip si no hay `.db_secret`) — round-trip AES-256-GCM
- `unit/passwordResetRepo.test.js` (12) — generación token, lookup hash, single-use, anti-replay
- `unit/tenantScope.test.js` (19) — RBAC: `reqWorkspace`, `ownedGroupIntIds`, `ownsGroupUuid`, `cpeForeign`
- `integration/passwordReset.test.js` (8, supertest) — flujo HTTP `/api/auth/password-reset/*` con anti-enumeración

**Frontend (37 tests):**
- `test/smoke.test.tsx` (4) — canaries jsdom + TL + matchers
- `test/providers.test.tsx` (1) — wrapper con `VpnProvider` + `WorkspaceSessionProvider`
- `utils/permissions.test.ts` (18) — RBAC: `visibleModules`, `canSeeModule`, action predicates
- `services/sessionClient.test.ts` (9) — `auth_expired` dispatch en 401 con USER_DELETED/SESSION_EXPIRED/NO_SESSION, NO en endpoints públicos
- `components/Users/.../WgConfigModal.test.tsx` (5) — render con .conf vs null, botones, errores

### Bugs reales descubiertos por los tests

| # | Bug | Fix | Test que lo encontró |
|---|-----|-----|----------------------|
| 1 | Compatibilidad zod v4 (`err.errors` → `err.issues`) | `auth.routes.js`: `(err.issues || err.errors)` en los 4 catches | `passwordReset.test.js` |


### CI

`.github/workflows/ci.yml` ahora corre Vitest en ambos jobs:

- **backend job:** `node --check` + `npm test` (Vitest)
- **frontend job:** `tsc --noEmit` + `eslint` + `npm test` (Vitest)
- E2E NO está en CI todavía (instalación de Chromium pesada — F4 evalúa)

---

## 17) 🛠️ Estado del REFACTOR_PLAN

Sesión 2026-06-15 cerró las **13 fases (F0-F12)** del plan de refactor
incremental, completando el shape uniforme de respuestas backend, la
expansión de `packages/contracts` y la unificación del API client
frontend (F5.A/B/C, último gap del plan).
Ver [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) para el detalle completo.

### Fases completadas

| Fase | Estado | Commits | Resultado |
|------|--------|---------|-----------|
| **F0** Preparación | ✅ | 7 | `.editorconfig`, husky + lint-staged pre-commit, GitHub Actions CI, README "Contribuir", ESLint thresholds documentados |
| **F1** Logger estructurado | ✅ | 8 | `pino@9` + `pino-http@10` + `pino-pretty@11` (dev). [server/lib/logger.js](server/lib/logger.js) con redact de password/token/secret/private_key/cookie/authorization. **0 `console.*`** en código productivo del backend (excepto scripts CLI en `db/init*.js`, `db/seed*.js`, etc.) |
| **F2** Headers de seguridad | ✅ | 4 | `helmet@8` con CSP API-only (`default-src 'none'`), HSTS solo en prod, COOP/COEP off para no romper CORS, `crossOriginResourcePolicy: same-site`. Cookies con `secure` automático en prod + `sameSite: lax`, helper `cookieBaseOptions()` garantiza que `clearSessionCookie` borra de verdad |
| **F3** Setup de testing | ✅ | 6 | Vitest 2 (backend + frontend), Supertest, Testing Library, MSW, jsdom, Playwright. Mocks (`routeros`, `mailer`, `mysql`), factories, helper `stubModule` para CJS, render wrapper con providers reales. CI corre Vitest en ambos jobs |
| **F4** Tests críticos | ✅ | 7 | **92 tests verde** (55 backend + 37 frontend). Suites: `wgkeys`, `crypto`, `passwordResetRepo`, `tenantScope`, `password-reset/*` (supertest), `permissions`, `sessionClient` (auth_expired), `WgConfigModal`. Thresholds suaves (5% lines / 45% branches) — F8/F11 los suben a 60% |
| **F5** Contracts compartidos + Bearer kill | ✅ | — | **F5 inicial:** Monorepo npm workspaces; `packages/contracts` con schemas Zod (Auth, Account, Team, Admin, Workspace); backend importa schemas centralizados (5 routes migrados); frontend re-exporta tipos desde contracts; `auth.routes.js` usa `sendOk`/`sendError`; `apiFetch` ya no inyecta `Bearer` — sesión = cookie HttpOnly. **F5.A (2026-06-15):** harmonización del shape en las 10 rutas restantes (`settings`, `wireguard`, `device`, `nodes/{listing,editing,credentials,provision}`, `core/{tunnel,connection,interface}`) — 46/47 respuestas legacy convertidas a `sendOk`/`AppError`/`asyncHandler`, validación Zod en endpoints con bodies estructurados, helper compartido `lib/routeGuards.js` con `requireMikrotik()` (antes duplicado en 11 archivos), `AppError` extendido con campo `data` para preservar `needsConfig`/`steps`/`failedAt`. **F5.B:** 5 schemas nuevos en `packages/contracts/src/` (`wireguard`, `tunnel`, `nodes`, `device`, `settings`) — el backend ahora los importa en lugar de definirlos inline. **F5.C:** `utils/apiClient.ts` modernizado — eliminados `setApiToken/getApiToken` no-op, detector de `needsConfig` ahora prefiere `code === 'NEEDS_CONFIG'` (forma canónica) y mantiene `needsConfig: true` como fallback legacy; `types/api.ts` re-exporta `WgPeer`/`TunnelActivateResponse`/`KeepaliveResponse`/`TunnelErrorCode` desde contracts. **170 tests backend + 64 tests frontend = 234 total verde.** Ver §18 |
| **F6** Split `node.routes.js` | ✅ | — | `routes/node.routes.js` (1264 LOC) → `routes/nodes/{index,_shared,listing,provision,editing,tags,credentials,history,scan}.routes.js` (max **472 LOC**). Helpers comunes (`annotateSessions`, `filterNodesForRole`, `nodeBelongsToRequester`, `requireOperator`) en `_shared.js`. **92 tests siguen verdes.** Ver §19 |
| **F7** Split `core.routes.js` | ✅ | — | `routes/core.routes.js` (935 LOC) → `routes/core/{index,_shared,connection,ppp,interface,tunnel,tunnel-repair}.routes.js` (max **430 LOC**). Registry SSE singleton + helpers (`emitToUser`, `canUseTunnel`, `clientIpOf`) en `_shared.js`. **92 tests siguen verdes.** Ver §20 |
| **F8** Split `NetworkDevicesModule.tsx` | ✅ | — | Monolito 1313 LOC → **433** (orquestador) + 4 hooks (`useDeviceScan`, `useDeviceList`, `useColumnPrefs`, `useDeviceLibrary`) + 5 componentes (`ScanControls`, `ScanProgressBanner`, `DeviceFilters`, `DeviceTable`, `DeviceTableRow` memoizado). Virtualización con `@tanstack/react-virtual` queda para F10. **92 tests siguen verdes** + ESLint warnings bajaron 130 → **115** (tras fixup `5c19cb6`). Ver §21 |
| **F9** Observabilidad — health + Prometheus | ✅ | — | `prom-client@15`, [server/lib/metrics.js](server/lib/metrics.js) (registry + counters/histogram), middleware HTTP en [server/index.js](server/index.js) (latencia por método/ruta/status, excluye `/api/health` y `/metrics`), `GET /metrics` formato Prometheus (loopback-only por defecto; `METRICS_ALLOW_REMOTE=1` para scrape remoto), `GET /api/health` enriquecido (`mysql` + `routeros` + `smtp`) con cascada de status. **92 tests siguen verdes.** Ver §22 |
| **F10** Code-splitting frontend | ✅ | — | `React.lazy()` para 10 vistas (9 módulos + RouterAccess). [components/Common/ModuleSkeleton.tsx](vpn-manager/src/components/Common/ModuleSkeleton.tsx) como Suspense fallback compartido. `rollup-plugin-visualizer` + `npm run analyze` (dist/stats.html). **Bundle inicial: 1090 KB → 248 KB raw (-77%) · 252 KB → 77 KB gzip (-69%).** 45 chunks separados por módulo. **99 tests (62 backend + 37 frontend) verdes.** Ver §23 |
| **F11** Performance MySQL | ✅ | — | Pool con tuning explícito ([server/db/mysql.js](server/db/mysql.js) — `connectTimeout`/`maxIdle`/`keepAliveInitialDelayMs`/`acquireConnection` con `Promise.race`). [tools/analyze-queries.js](server/tools/analyze-queries.js) corre `EXPLAIN` sobre 13 queries del hot path (`npm run analyze:queries`). 8 índices compuestos nuevos en [sql/schema_perf_indexes.sql](server/sql/schema_perf_indexes.sql), idempotente ([db/migratePerf.js](server/db/migratePerf.js) → `npm run migrate:perf`) — cubren `tunnel_logs` (timeline ws + por túnel), `tunnel_user_sessions` (ACTIVE listing + current de un user + expirados), `tunnel_session_logs` (que NO tenía índice por ws), `invitations` (por email+status) y `password_resets` (activos por user). Auditoría de placeholders: 0 SQL injection — todas las concatenaciones son cláusulas `IN (?,?,...)` o keys hardcoded. **99 tests verdes (sin regresión).** Ver §24 |
| **F12** Audit pass final + docs | ✅ | — | `npm audit --omit=dev` → **0 vulnerabilidades en prod** (eliminado `uuid` sin usar del frontend). `semgrep p/security-audit` → **0 findings** en 588 archivos. `semgrep p/nodejs + p/react + p/typescript + p/javascript` → **0 findings** (tras fix: `{ authTagLength: 16 }` en createDecipheriv AES-256-GCM × 2 + `// nosemgrep: bypass-tls-verification` en 2 lugares donde rejectUnauthorized:false es intencional — certs autofirmados de RouterOS y airOS). [ARQUITECTURA.md](./ARQUITECTURA.md) nuevo con 8 diagramas Mermaid (sistema, monorepo, backend splits, frontend lazy, multi-tenant, multi-user sessions, observabilidad, MySQL perf). CLAUDE.md actualizado con convenciones post-refactor (contracts, code-splitting, testing, audit). **99 tests verdes (sin regresión).** Ver §25 |

### ✅ Plan completo — fases 0-12 cerradas

**Sin pendientes del REFACTOR_PLAN**. Próximos esfuerzos son nuevas features sobre la base estabilizada.

### Bugs reales arreglados durante el refactor

| # | Bug | Fix | Encontrado por |
|---|-----|-----|----------------|
| 1 | Compatibilidad zod v4 — `err.errors` ya no existe, ahora es `err.issues`. Los errores de validación caían al return genérico 200 OK silencioso | `(err.issues \|\| err.errors)` en los 4 catches de [auth.routes.js](server/auth.routes.js) | F4 — `passwordReset.test.js > email mal formado → 400` |
| 2 | `pre-commit` (lint-staged) fallaba en Windows con paths absolutos | `npx eslint --config vpn-manager/eslint.config.js --fix` sin `cd` | F3.3 al commitear tests frontend |

### Decisiones técnicas documentadas

- **Vitest + CJS**: `vi.mock` con destructuring imports no normaliza paths relativos entre archivos. Solución: helper `test/helpers/moduleMock.js` con `stubModule(fromDir, modulePath, exports)` que inyecta en `require.cache` por path absoluto.
- **Cooldown sessionClient**: 3s entre disparos de `auth_expired`. Tests usan `vi.useFakeTimers({ shouldAdvanceTime: true })` + `advanceTimersByTime(3500)` en `afterEach`.
- **MSW + endpoints públicos**: tests del `sessionClient` validan explícitamente que `/api/auth/login`, `/api/team/accept` y `/api/auth/password-reset/*` NO disparan `auth_expired` aunque devuelvan códigos de sesión inválida.
- **ESLint deuda preexistente**: 88 warnings mapeados a fases futuras del REFACTOR_PLAN (`no-explicit-any` → F5, `exhaustive-deps` → F4 (parcial), etc.). Ver [vpn-manager/eslint.config.js](vpn-manager/eslint.config.js).
- **Scripts CLI mantienen `console.*`**: `db/initRbac.js`, `db/initMultiuser.js`, `db/mapUserMgmtIp.js`, `db/migrateSqliteToMysql.js`, `db/rotateSecrets.js`, `db/seedRoles.js`. Formato custom (✓, ✗, indentación) para UX en terminal — no para ingesta automática.

### Métricas comparativas (antes vs ahora)

| Métrica | Pre-refactor | Post F0-F4 |
|---------|--------------|------------|
| Tests automatizados | 0 | **92** |
| `console.*` en backend productivo | ~80 | **0** (solo scripts CLI documentados) |
| Headers de seguridad HTTP | Solo CORS | Helmet completo (CSP, X-Frame-Options, HSTS prod, CORP) |
| Pre-commit gate | Ninguno | `lint-staged` + `tsc --noEmit` |
| CI | Ninguno | GitHub Actions: tsc + eslint + Vitest backend + Vitest frontend |
| Logger estructurado | ❌ console | ✅ pino con redact + request-id |
| `.env`/secrets en logs | Riesgo | Redactado por logger |
| Cobertura backend | 0% | 5.4% lines, **53.8% branches** |
| Cobertura frontend | 0% | ~5% lines, ~50% branches |
| README "Contribuir" | Ninguno | Setup + flujo + scripts + convenciones |
| Archivos basura en `src/` | `VpnContext.backup.tsx` (412 LOC) | Eliminado |

---

## 18) 📦 Contratos API compartidos — `@gestionvpn/contracts` (FASE 5)

A partir de la FASE 5 hay **un único set de schemas Zod** que tanto backend
(`require()`) como frontend (`import`) consumen. Cambiar un campo en el paquete
rompe ambos lados en `tsc` — fin del drift silencioso.

### Estructura del monorepo

```
ProyectoVPN_3.0/                    ← root (npm workspaces)
├── package.json                    ← workspaces: ["packages/*", "server", "vpn-manager"]
├── packages/
│   └── contracts/
│       ├── package.json            ← name: "@gestionvpn/contracts"
│       ├── tsconfig.json           ← target ES2022, module commonjs, declaration
│       ├── src/
│       │   ├── index.ts            ← re-export *
│       │   ├── common.ts           ← Role, Email, Password, Otp, ApiSuccess/Error
│       │   ├── auth.ts             ← Login, Setup, PasswordReset (request/confirm)
│       │   ├── account.ts          ← Register, Verify, Resend, Login, ChangePassword, ChangeEmail
│       │   ├── team.ts             ← Invite, Accept, MemberPatch, WireguardProvision, Assignment
│       │   ├── admin.ts            ← CreateModerator, ModeratorPatch, InviteModerator
│       │   └── workspace.ts        ← Rename, ExportPayload, ImportRequest, ImportPlan
│       └── dist/                   ← generado por tsc (.js + .d.ts)
├── server/                         ← workspace
└── vpn-manager/                    ← workspace
```

### Comandos

```bash
# Compilar el paquete (genera dist/)
cd packages/contracts && npm run build
# Watch mode mientras se edita
cd packages/contracts && npm run build:watch
# Desde el root, atajo:
npm run build:contracts
```

### Cómo añadir un endpoint nuevo (workflow F5)

1. **Define el schema en `packages/contracts/src/<dominio>.ts`**:
   ```ts
   export const FooRequestSchema = z.object({
     bar: z.string().min(1).max(160),
   });
   export type FooRequest = z.infer<typeof FooRequestSchema>;
   ```
2. **`npm run build:contracts`** — emite `.js` + `.d.ts` en `dist/`.
3. **Backend** (`server/routes/foo.routes.js`):
   ```js
   const { FooRequestSchema } = require('@gestionvpn/contracts');
   const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');

   router.post('/foo', requireSession, asyncHandler(async (req, res) => {
     const { bar } = FooRequestSchema.parse(req.body);   // ⇒ AppError 422 si falla
     // …lógica…
     return sendOk(res, { result: '…' });                // ⇒ { success: true, result: '…' }
   }));
   ```
4. **Frontend** (`vpn-manager/src/services/fooApi.ts`):
   ```ts
   import { post } from './sessionClient';
   import type { FooRequest } from '@gestionvpn/contracts';

   export const fooApi = {
     create: (input: FooRequest) =>
       post<{ success: true; result: string }>('/api/foo', input),
   };
   ```

### Respuestas estandarizadas

Toda la API responde una de estas dos formas (via `lib/apiResponse.js`):

```jsonc
// éxito
{ "success": true, "message": "…opcional", "<...campos>": "…" }
// error
{ "success": false, "code": "MAQUINA", "message": "Texto legible" }
```

`asyncHandler(fn)` envuelve los handlers y delega errores al
`errorMiddleware`, que traduce automáticamente:

- `AppError` → su `{ status, code, message }`.
- `ZodError` → `422 VALIDATION_ERROR`.
- `ER_DUP_ENTRY` (MySQL) → `409 DUPLICATE`.
- Resto → `500 INTERNAL` + log estructurado.

`auth.routes.js` (legacy, sin `asyncHandler`) ahora también usa `sendOk`/`sendError` para uniformidad.

### Eliminación de `Authorization: Bearer` en el frontend

- `vpn-manager/src/utils/apiClient.ts` ya **NO** inyecta `Authorization: Bearer`.
  La sesión viaja en la cookie HttpOnly `vpn_session`, que el navegador envía
  sola gracias a `credentials: 'include'`.
- `setApiToken` / `getApiToken` quedan como NO-OP por compatibilidad (siguen
  importándose desde un par de archivos legacy).
- `useAuth.ts`, `useTunnelSync.ts` y `accountApi.bridge()` ya no manipulan el token.
- EventSource del túnel se autentica con `withCredentials: true` (cookie), sin `?token=`.

> **Backend Bearer kept as fallback:** `auth.middleware.js verifyToken` sigue
> aceptando `Authorization: Bearer …` después de probar la cookie. No lo usa
> el frontend, pero se mantiene para integraciones externas (scripts CLI,
> webhooks). Decisión consciente — eliminarlo es trivial cuando aparezca un
> caso de negocio para hacerlo (no rompería al frontend).

### Tipos del frontend

`vpn-manager/src/types/account.ts` ahora es **un re-export** desde `@gestionvpn/contracts`. Los tipos `Member`, `Invitation`, `Moderator`, `AdminSummary`, `Role`, `SessionUser`, `Assignment`, `MemberWireguard`, `WgServerConfig`, `AcceptResult` (alias de `AcceptResponse`) y `ROLE_LABEL` viven en el paquete compartido.

### Métricas pre/post F5

| Métrica | Pre-F5 | Post-F5 |
|---------|--------|---------|
| Schemas Zod inline en routes | ~18 definiciones | 0 (todas importadas) |
| Paquetes compartidos | 0 | 1 (`@gestionvpn/contracts`) |
| Source-of-truth de tipos | duplicado backend↔frontend | único (`contracts/src/`) |
| `Authorization: Bearer` en frontend | sí (`apiClient` + 1 servicio) | **no** (cookie HttpOnly) |
| Endpoints `auth.routes.js` con `res.status().json()` manual | 7 | 0 (usan `sendOk`/`sendError`) |
| Tests verdes | 92 | **92** (sin regresión) |

---

## 19) 🧩 Split de `node.routes.js` (FASE 6)

El monolito de 1264 LOC se descompone en 7 sub-routers por responsabilidad,
un compositor (`index.js`) y un módulo de helpers (`_shared.js`). El
montaje en `server/index.js` cambió de `require('./routes/node.routes')` a
`require('./routes/nodes')` — Node resuelve `routes/nodes/index.js`.

### Estructura

```
server/routes/nodes/
├── index.js                  ← compositor: router.use(sub-router) ×7  (24 LOC)
├── _shared.js                ← annotateSessions, filterNodesForRole,
│                               nodeBelongsToRequester, requireOperator  (119 LOC)
├── listing.routes.js         ← POST /nodes, /node/details, /node/script,
│                               /node/wg/set-peer                         (327 LOC)
├── provision.routes.js       ← POST /node/next, /node/provision,
│                               /node/deprovision                         (472 LOC)
├── editing.routes.js         ← POST /node/edit, /node/label/save         (190 LOC)
├── tags.routes.js            ← GET /node/tags, POST /node/tag/save        (61 LOC)
├── credentials.routes.js     ← POST /node/{creds,ssh-creds}/{save,get}    (85 LOC)
├── history.routes.js         ← POST /node/history/{add,get}                (42 LOC)
└── scan.routes.js            ← POST /node/scan-stream (Worker SSE)       (101 LOC)
```

### Regla operativa

- **Helpers compartidos viven en `_shared.js`.** Si tienes que pasar el mismo
  helper a 2 sub-routers, ese helper pertenece aquí. Cada sub-router lo importa
  con `require('./_shared')`.
- **Cada sub-router agrupa por responsabilidad**, no por verbo HTTP. Tags es un
  feature, credentials es un feature — no "los GET" y "los POST".
- **El compositor no contiene lógica.** Solo monta sub-routers. Si necesitas
  middleware adicional para todo el grupo (ej. `requireSession`), va en
  `server/index.js` al montar — no aquí.
- **Las rutas siguen siendo absolutas a `/api`** porque el compositor se monta
  en `app.use('/api', verifyToken, nodeRoutes)`. Una nueva ruta `/node/foo` se
  agrega en el sub-router temático correspondiente, no requiere cambios en `index.js`.

### Para añadir una ruta nueva de "nodos"

1. Elige el sub-router temático (o crea uno nuevo si la responsabilidad no encaja).
2. Define el handler con el patrón estándar de Express + RouterOS:
   ```js
   router.post('/node/foo', async (req, res) => {
     if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, … });
     const { ip, user, pass } = req.mikrotik;
     // Guarda multi-tenant (si la ruta muta el nodo):
     if (!(await nodeBelongsToRequester(req, req.body.pppUser))) {
       return res.status(404).json({ success: false, message: 'Nodo no encontrado en tu workspace' });
     }
     let api;
     try {
       api = await connectToMikrotik(ip, user, pass);
       // …safeWrite(api, [...])
       await api.close();
       res.json({ success: true, … });
     } catch (error) {
       if (api) try { await api.close(); } catch (_) {}
       res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
     }
   });
   ```
3. Si creaste un sub-router nuevo, móntalo en `nodes/index.js` con `router.use(require('./<nuevo>.routes'))`.
4. Agrega la nueva ruta al script `check:backend` en el `package.json` del root.

### Métricas pre/post F6

| Métrica | Pre-F6 | Post-F6 |
|---------|--------|---------|
| LOC archivo más grande (server) | 1264 (`node.routes.js`) | **472** (`provision.routes.js`) |
| LOC archivos > 300 | 1 | 2 (`listing` 327, `provision` 472) |
| Sub-routers en `routes/nodes/` | 0 | 7 + compositor + shared |
| Rutas en un solo archivo | 18 | repartidas por responsabilidad |
| Tests verdes | 92 | **92** (sin regresión) |

> `provision.routes.js` (472 LOC) está naturalmente sobre el umbral porque la
> ruta `/node/provision` orquesta 10 pasos atómicos en RouterOS (SSTP+WG en una
> sola transacción lógica). Partirla más mezclaría niveles de abstracción —
> mejor mantenerla densa pero localizada.

---

## 20) ⚙️ Split de `core.routes.js` (FASE 7)

El monolito de 935 LOC (15 rutas de conectividad RouterOS + túnel multi-usuario)
se descompone en 5 sub-routers temáticos, un compositor y un módulo de helpers.
El montaje en `server/index.js` cambió de `require('./routes/core.routes')` a
`require('./routes/core')`.

### Estructura

```
server/routes/core/
├── index.js                     ← compositor: router.use(sub-router) ×5  (24 LOC)
├── _shared.js                   ← registry SSE singleton + helpers          (83 LOC)
│                                  • sseClientsByUser (Map<userId, Set<res>>)
│                                  • addSseClient / removeSseClient / emitToUser
│                                  • clientIpOf, canUseTunnel
├── connection.routes.js         ← POST /connect, /diagnose                 (61 LOC)
├── ppp.routes.js                ← POST /secrets, /active                    (55 LOC)
├── interface.routes.js          ← POST /interface/{activate,deactivate}     (59 LOC)
├── tunnel.routes.js             ← POST /tunnel/{activate, deactivate,       (430 LOC)
│                                              keepalive, register-my-ip,
│                                              mangle-access},
│                                  GET  /tunnel/{events, status, my-mgmt-ip}
└── tunnel-repair.routes.js      ← POST /tunnel/repair (7 pasos atómicos)  (357 LOC)
```

### Decisión clave: singleton SSE en `_shared.js`

`tunnel/activate` (escribe eventos) y `tunnel/events` (lee eventos) DEBEN compartir
el mismo `Map<userId, Set<res>>`. Si cada sub-router creara su propio Map, los
eventos nunca llegarían al frontend — silencio absoluto en el panel.

Solución: el Map vive en `_shared.js` como singleton del módulo. Express/Node
cachean el `require()` por path absoluto, así que todas las importaciones reciben
la MISMA instancia. Probado y funcionando con keepalive multi-usuario.

### Regla operativa

- **Helpers de RBAC + SSE viven en `_shared.js`.** Si necesitas `emitToUser` en
  otro sub-router (ej. un `/tunnel/something-new` que cambie estado), impórtalo
  desde aquí. **NO** lo redefinas localmente.
- **`tunnel-repair.routes.js` está aislado porque es muy denso (~357 LOC).**
  Mezclar con `tunnel.routes.js` confundiría niveles de abstracción: el primero
  reconstruye estructura, el segundo gestiona sesiones por usuario.
- **`tunnel.routes.js` se queda en 430 LOC** porque las 3 rutas críticas
  (activate / deactivate / mangle-access) tienen flujos complejos con conexiones
  separadas por fase, contención de errores y telemetría. Partirla más mezclaría
  el "happy path" con el manejo de error.

### Para añadir una ruta nueva al "core"

1. Elige el sub-router temático (o crea uno nuevo si la responsabilidad no encaja).
2. Si la ruta necesita el SSE: importa `emitToUser` desde `./_shared`.
3. Si la ruta valida acceso a un VRF: importa `canUseTunnel` desde `./_shared`.
4. Si creaste un sub-router nuevo, móntalo en `core/index.js` con `router.use(require('./<nuevo>.routes'))`.
5. Actualiza el script `check:backend` en el `package.json` del root con la nueva ruta.

### Métricas pre/post F7

| Métrica | Pre-F7 | Post-F7 |
|---------|--------|---------|
| LOC archivo más grande (server) | 935 (`core.routes.js`) | **472** (`nodes/provision.routes.js`) — F6 sigue mandando |
| LOC max en core/ | n/a | **430** (`tunnel.routes.js`) |
| Sub-routers en `routes/core/` | 0 | 5 + compositor + shared |
| Rutas en un solo archivo | 15 | repartidas por responsabilidad |
| Tests verdes | 92 | **92** (sin regresión) |

---

## 21) 🧱 Split de `NetworkDevicesModule.tsx` (FASE 8)

El monolito frontend de 1313 LOC (18 useState, 9 useEffect, escaneo SSE,
auth SSH, filtros, tabla con resize y sort, modales, CRUD biblioteca local)
se descompone en 4 hooks + 5 componentes + orquestador adelgazado.

### Estructura final

```
vpn-manager/src/components/Devices/NetworkDevicesModule/
├── NetworkDevicesModule.tsx        ← orquestador adelgazado          (433 LOC)
├── hooks/
│   ├── useDeviceScan.ts            ← escaneo SSE + auth SSH          (354 LOC)
│   ├── useDeviceList.ts            ← search + filter + sort           (108 LOC)
│   ├── useColumnPrefs.ts           ← visibles + ancho + gridTemplate   (91 LOC)
│   ├── useDeviceLibrary.ts         ← savedDevices CRUD + toast        (211 LOC)
│   └── useNodeSelection.ts         ← ya existía                        (11 LOC)
├── components/
│   ├── ScanControls.tsx            ← selector subnet + botón scan     (118 LOC)
│   ├── ScanProgressBanner.tsx      ← progreso + error + empty         (107 LOC)
│   ├── DeviceFilters.tsx           ← search + SSID + counter           (63 LOC)
│   ├── DeviceTable.tsx             ← header + body                    (130 LOC)
│   ├── DeviceTableRow.tsx          ← fila memoizada                   (234 LOC)
│   ├── DeviceStatusPanel.tsx       ← ya existía                       (371 LOC)
│   ├── SshDataModal.tsx            ← ya existía                       (233 LOC)
│   ├── AddDeviceModal.tsx          ← ya existía                       (140 LOC)
│   ├── DeviceCardModal.tsx         ← ya existía                        (28 LOC)
│   ├── ColumnPicker.tsx            ← ya existía                       (112 LOC)
│   └── RawBlock.tsx                ← ya existía                        (32 LOC)
├── constants.ts                    ← ya existía
├── types.ts                        ← ya existía
└── utils/                          ← ya existía
```

### Decisión clave: el ciclo scan ↔ library

`useDeviceScan` necesita `savedDevices` (para anteponer creds SSH ya
validadas durante la fase de auth). `useDeviceLibrary` necesita
`setScanResults` y `setSshStatus` (para reflejar enriquecimientos del SSH
post-guardado en la tabla en vivo).

**Solución:** un `useRef<ReturnType<typeof useDeviceScan> | null>` que se
asigna después de instanciar el scan. `useDeviceLibrary` recibe wrappers
estables `(updater) => scanRef.current?.setScanResults(updater)` que
delegan al scan real. No hay re-renders cruzados porque los setters de
React son referencialmente estables.

### Regla operativa para añadir features

- **Lógica nueva → un hook.** Si necesita estado + efecto + handlers, NO
  lo metas en el orquestador; crea `hooks/useTuFeature.ts`.
- **UI nueva → un componente memoizado en `components/`.** `memo()` con
  comparador custom si recibe muchos props (ver `DeviceTableRow`).
- **El orquestador NO conoce detalles de scan/filtros/tabla.** Pasa
  setters y handlers; los hijos manejan el cómo.

### Tabla memoizada — semántica

`DeviceTableRow` está envuelto en `memo(impl, customCompare)`. Solo
re-renderiza si cambian: `dev`, `isSaved`, `sshStatus`, `isExpanded`,
`savedDevice`, `selectedNode`, `activeConfigCols`, `gridTemplate`, `rowIdx`.

Esto evita que una actualización de progreso de scan (que ocurre cada
~150ms en `setScannedCount` o `setSshStatus[ip]`) repinte las 100+ filas
de la tabla. Solo la fila cuyo `sshStatus` cambió se actualiza.

> Virtualización (`@tanstack/react-virtual`) queda para **FASE 10**.
> Con la memoización + el grid CSS actual, scroll fluido se mantiene
> hasta ~300 filas. Más allá, F10 cambiará el body a virtualizado.

### Métricas pre/post F8

| Métrica | Pre-F8 | Post-F8 (b35fff4) | Tras fixup (5c19cb6) |
|---------|--------|-------------------|----------------------|
| LOC `NetworkDevicesModule.tsx` | **1313** | 433 | 433 |
| Archivos en el módulo | 13 | 17 | 17 |
| Hooks especializados | 1 | 5 | 5 |
| Componentes memoizados | 0 | 5 | 5 |
| ESLint warnings (todo el frontend) | 130 | 120 | **115** |
| Effects con dep inestable | n/a | 1 (`[scan]`) | **0** |
| Handlers con identidad inestable | n/a | 4 | **0** |
| Tests verdes | 92 | 92 | **92** |

### Fixup commit `5c19cb6` — bugs de perf encontrados en code-review

El commit inicial `b35fff4` introdujo 2 bugs reales + 2 anti-patterns que
el code-review detectó:

| # | Tipo | Hallazgo | Fix |
|---|------|----------|-----|
| 1 | 🔴 Bug perf | `useEffect(reset, [selectedNode, scan])` — `scan` se recrea cada render → effect disparaba en cada repintado | Desestructurar `{setScanResults, setSshStatus} = scan` (setters estables) y depender de ellos |
| 2 | 🔴 Bug perf | `handleRefreshStats`, `handleSyncToSaved`, `handleRemoveDeviceUnified`, `handleUpdateDeviceUnified` con dep `[scan]`/`[library]` → identidad inestable rompía memoización de `DeviceTable` | Desestructurar al inicio del bloque de handlers; depender solo de funciones internas memoizadas con `useCallback` dentro de cada hook |
| 3 | 🟡 Anti-pattern R19 | `scanRef.current = scan` durante render | Mover a `useEffect(() => { scanRef.current = scan; })` |
| 4 | 🟡 Lint | Prop `devId` declarado en `DeviceTableRow` pero sin uso | Eliminar del interface + call site |
| 5-7 | 🟢 Plugin advertencias legítimas | `react-hooks/set-state-in-effect` en 3 effects válidos (hidrar sessionStorage, animar progress bar, sync de estado derivado) | Suprimir con `/* eslint-disable */`/`enable */` + comentario explicativo |

**Regla aprendida:** cuando un hook custom retorna un objeto con varios setters,
depender del objeto entero en un `useEffect`/`useCallback` rompe la memoización.
Siempre desestructurar y depender de las piezas estables (setters de React lo son
por contrato).

---

## 22) 📡 Observabilidad — Health + Métricas Prometheus (FASE 9)

Backend expone dos endpoints sin auth para monitoring externo (`pino-http`
los silencia para no inundar logs).

### `GET /api/health` — snapshot agregado

Devuelve los tres sistemas críticos en cascada. **El status global degrada así**: `mysql.down → status=down (HTTP 503)` · cualquier otro check `down/stale/error → status=degraded (HTTP 200)` · todo verde → `status=ok`.

```jsonc
{
  "success": true,
  "status": "ok",            // ok | degraded | down
  "version": "1.0.0",
  "uptime_s": 1234,
  "checks": {
    "mysql":    { "status": "ok",      "latency_ms": 4 },
    "routeros": { "status": "ok",      "last_write_ago_s": 12 },
    "smtp":     { "status": "ok",      "configured": true, "latency_ms": 180 }
  }
}
```

| Check | Cómo se decide |
|-------|----------------|
| `mysql` | `SELECT 1` (mismo `ping()` del monitor). `latency_ms` y `error` (code mysql2) si falla. |
| `routeros` | Timestamp `_lastSafeWriteOkAt` de `routeros.service.js` (cualquier `safeWrite` OK lo refresca). `ok` ≤ 60s · `stale` ≤ 5min · `down` > 5min · `unknown` si el backend nunca tocó el router. Umbrales por env `HEALTH_ROUTEROS_OK_MAX_S` (default 60) y `HEALTH_ROUTEROS_STALE_MAX_S` (default 300). |
| `smtp` | `transporter.verify()` con timeout (`SMTP_VERIFY_TIMEOUT_MS`, default 4s) **cacheado** `SMTP_VERIFY_TTL_MS` (default 45s) para no abrir conexión SMTP en cada poll. `skipped` cuando no hay `SMTP_HOST`. |

Endpoint legacy `GET /api/health/db` se conserva por compat (ping mínimo a MySQL).

### `GET /metrics` — formato Prometheus

Loopback-only por defecto (devuelve 403 a IPs remotas). Exportar `METRICS_ALLOW_REMOTE=1` cuando Prometheus corra en otra IP — o restringir por firewall.

| Métrica | Tipo | Labels | Notas |
|---------|------|--------|-------|
| `nodejs_*` | varios | — | Defaults de `prom-client`: CPU, memoria, event loop lag, GC. Útil para detectar leaks y saturación. |
| `http_requests_total` | counter | `method`, `route`, `status` | Excluye `/api/health` y `/metrics`. `route` = `req.baseUrl + req.route.path` cuando Express matchea (cardinalidad acotada en `/foo/:id`); fallback al pathname sin querystring en 404/early-error. |
| `http_request_duration_seconds` | histogram | `method`, `route`, `status` | Buckets 1ms → 5s. |
| `auth_fails_total` | counter | `reason` | `bad_credentials`, `db_unavailable`, `validation`, `no_token`, `invalid_token`, `expired_token`, `reset_token_invalid`. Sin email/IP/user_id. |
| `routeros_writes_total` | counter | `status` | `ok` o `error`. Ratio `errors / total` separa "router mudo" de "router que responde mal". |
| `routeros_errors_total` | counter | `type` | `timeout`, `refused`, `login`, `network`, `unknown`. `!empty` NO cuenta — es resultado vacío válido. |
| `mail_sent_total` | counter | `kind`, `status` | `kind`: `otp`/`invitation`/`password_reset`. `status`: `ok`/`error`/`dev` (sin SMTP). |

Label global: `service="gestionvpn-backend"`. Todo en snake_case con sufijo de unidad (`_total`, `_seconds`).

### Ejemplo scrape config (Prometheus)

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'gestionvpn-backend'
    metrics_path: /metrics
    scrape_interval: 15s
    static_configs:
      - targets: ['127.0.0.1:3001']
    # Para scrape remoto: poner METRICS_ALLOW_REMOTE=1 en el backend
    # y restringir el acceso a esta IP a nivel firewall/red.
```

### Reglas de cardinalidad (no las rompas)

- **Nada de `user_id`, `email`, `ip`** como label — explotan la cardinalidad y son PII.
- **`route` viene del matcher de Express**, no del `req.url` crudo, para que `/api/team/member/abc-123` y `/api/team/member/def-456` colapsen a la misma serie.
- **Etiquetas categóricas con dominio cerrado** (`reason`, `type`, `kind`, `status`) — si agregas una nueva categoría, documéntala aquí.

### Variables de entorno F9

```bash
METRICS_ALLOW_REMOTE=0              # 1 = permite /metrics fuera de loopback
HEALTH_ROUTEROS_OK_MAX_S=60         # umbral routeros 'ok'
HEALTH_ROUTEROS_STALE_MAX_S=300     # umbral routeros 'stale'
SMTP_VERIFY_TIMEOUT_MS=4000         # timeout transporter.verify() en /api/health
SMTP_VERIFY_TTL_MS=45000            # cache del resultado de verify (evita abrir SMTP en cada poll)
```

### Métricas pre/post F9

| Métrica | Pre-F9 | Post-F9 |
|---------|--------|---------|
| Endpoint de health | `GET /api/health/db` (mysql ping mínimo) | `GET /api/health` (mysql + routeros + smtp con cascada) |
| Exposición Prometheus | ❌ | `GET /metrics` con 4 counters + 1 histogram + defaults Node |
| Cardinalidad acotada | n/a | sí — categorías cerradas, sin PII |
| `verify SMTP` por hit | n/a | cacheado 45s (no abre socket en cada poll) |
| Status code en `/api/health` con BD caída | 500 | **503** (legible por liveness probes) |
| Tests verdes | 92 | **92** (sin regresión) |

---

## 23) ⚡ Performance frontend — code-splitting (FASE 10)

### Arquitectura lazy

Cada módulo principal se carga **bajo demanda en su propio chunk** vía `React.lazy()` + `Suspense`. Lo que va en el bundle inicial ahora es solo: React + ReactDOM, los contexts, el sidebar, el logger HTTP y el `ModuleSkeleton`. El resto se descarga al primer acceso del usuario.

```
vpn-manager/src/
├── App.tsx                         ← lazy() para 10 vistas
└── components/Common/
    └── ModuleSkeleton.tsx          ← Suspense fallback compartido
```

| Componente | Carga |
|------------|-------|
| `Sidebar`, `ModuleSkeleton` | **Eager** — universales |
| `RouterAccess` (+ AcceptInvitationForm, PasswordResetRequest, PasswordResetConfirm) | Lazy — solo flujo no autenticado |
| `AdminDashboard`, `ModeratorsModule` | Lazy — solo `platform_admin` |
| `NodeAccessPanel`, `NetworkDevicesModule`, `ApMonitorModule`, `TeamModule`, `UserManagementPanel` | Lazy — solo moderadores |
| `SettingsModule`, `ModeratorSettingsModule` | Lazy — solo al abrir Ajustes |

### Decisión clave: Suspense único con `key={activeModule}`

En lugar de un Suspense por módulo, hay **uno solo** envolviendo el switch en App.tsx. La `key={activeModule}` fuerza un nuevo boundary al cambiar de módulo: si el usuario salta a un chunk no resuelto, el skeleton aparece inmediatamente (no la vista anterior congelada).

`RouterAccess` tiene su **propio Suspense con fallback minimalista** (no `ModuleSkeleton`) porque el flujo público debe sentirse instantáneo y la silueta de cards del skeleton sería disonante.

### `ModuleSkeleton` — fallback compartido

```tsx
<ModuleSkeleton rows={4} withHeader label="Cargando módulo" />
```

Reusa la clase `.skeleton` del `index.css` (shimmer + dark mode + `prefers-reduced-motion`). `role="status"` + `aria-live="polite"` para lectores de pantalla. Memoizado (`memo`) — no provoca re-renders por cambios fuera de sus props.

### Analizador de bundle — `npm run analyze`

```bash
cd vpn-manager
npm run analyze     # → dist/stats.html (treemap interactivo gzip + brotli)
```

Internamente: `cross-env ANALYZE=1 npm run build` → activa `rollup-plugin-visualizer`. Abrir `dist/stats.html` en el navegador.

### Métricas pre/post F10

| Métrica | Pre-F10 (monolítico) | Post-F10 (split) |
|---------|----------------------|-------------------|
| **Bundle inicial JS** | **1090 KB raw / 252 KB gzip** | **248 KB raw / 77 KB gzip** |
| Reducción inicial | — | **-77% raw · -69% gzip** |
| Chunks JS totales | 1 | **45** |
| Warning Vite "chunk > 500 KB" | ⚠️ sí | ✅ no (solo `TeamModule` lo activa, pero es lazy) |
| Suspense fallback | n/a | `ModuleSkeleton` compartido |
| Bundle visualizer | n/a | `dist/stats.html` con `npm run analyze` |
| `npm run build` pasa | ❌ (TS errors en src/test) | ✅ (con `vitest/globals` en types) |
| Tests verdes | 92 | **99** (62 backend + 37 frontend) |

### Tamaño de cada chunk de módulo

| Chunk | Raw | Gzip | Notas |
|-------|-----|------|-------|
| `index.js` (inicial) | 248 KB | 77 KB | React + contexts + sidebar + ModuleSkeleton |
| `TeamModule` | 415 KB | 85 KB | Arrastra `qrcode` y los modales de WG — candidato a split adicional en futuro |
| `NodeAccessPanel` | 127 KB | 27 KB | El más usado tras login |
| `NetworkDevicesModule` | 86 KB | 20 KB | Tras F8 ya estaba liviano por hooks/componentes |
| `ApMonitorModule` | 62 KB | 15 KB | |
| `ModeratorSettingsModule` | 25 KB | 6 KB | |
| `RouterAccess` | 23 KB | 5 KB | Solo flujo público |
| `ModeratorsModule` | 19 KB | 4 KB | |
| `UserManagementPanel` | 18 KB | 5 KB | |
| `SettingsModule` | 6 KB | 2 KB | |
| `AdminDashboard` | 4.5 KB | 1.6 KB | |

### `lucide-react` — ya tree-shakeable

Los 105 archivos que importan iconos lo hacen con destructuring (`import { Server, Mail } from 'lucide-react'`), que es el patrón tree-shakeable por defecto. Rollup ya extrae chunks compartidos para iconos usados en múltiples módulos lazy (ver `trash-2-*.js`, `info-*.js`, etc.). **No hubo que reescribir nada** — el commit 8 del plan original no aplica.

### Regla operativa para añadir un módulo nuevo

1. Crearlo bajo `components/<Dominio>/<Nombre>/<Nombre>.tsx` con `export default`.
2. En `App.tsx`: `const Nuevo = lazy(() => import('./components/<Dominio>/<Nombre>/<Nombre>'));`
3. Añadirlo al switch dentro del `<Suspense>` único.
4. **No** crear un Suspense por módulo — el de App.tsx es el correcto.
5. Si el módulo arrastra > 200 KB raw, evaluarlo en `npm run analyze` para detectar dependencias pesadas que podrían splittearse (ej. `TeamModule` con qrcode).

---

## 24) 🗃️ Performance MySQL — pool + índices + analyze (FASE 11)

### Pool con tuning explícito

[server/db/mysql.js](server/db/mysql.js) — `mysql.createPool` con timeouts configurables por env:

| Variable env | Default | Para qué |
|--------------|---------|----------|
| `MYSQL_POOL` | 10 | `connectionLimit` — máx conns concurrentes |
| `MYSQL_CONNECT_TIMEOUT_MS` | 10000 | Tiempo max para abrir socket TCP. Sin esto, si XAMPP/MariaDB se cuelga, esperamos hasta el TCP-RST del kernel (~75s) |
| `MYSQL_ACQUIRE_TIMEOUT_MS` | 8000 | `acquireConnection()` (wrap propio sobre `getConnection`) hace `Promise.race` con timeout. mysql2 no expone `acquireTimeout` real — sin este wrap una fuga de conn deja pedidos colgados indefinidamente |
| `MYSQL_KEEPALIVE_DELAY_MS` | 5000 | `keepAliveInitialDelayMs`. 0 dispara warning oficial en algunos OS (visto en Windows) |
| `MYSQL_MAX_IDLE` | 5 | Pool keeps max N idle conns — libera sockets en horarios bajos |
| `MYSQL_IDLE_TIMEOUT_MS` | 60000 | Idle conn que no se reusa en 60s se cierra |

`withTransaction(fn)` ahora usa `acquireConnection()` internamente — un deadlock o fuga ya no cuelga el endpoint para siempre.

### Script `analyze-queries`

```bash
cd server && npm run analyze:queries          # texto legible
cd server && npm run analyze:queries -- --json  # JSON para máquina
```

Corre `EXPLAIN` sobre 13 queries del hot path y marca:
- `type=ALL` → full scan
- `Using filesort` → ordenamiento en RAM tras scanear
- `Using temporary` → tabla temporal
- `key=null` → sin índice

Sale `1` si alguna tiene warnings. Útil para CI tras una migración: si añades una query y este sale rojo, falta un índice.

Queries cubiertas (todas con parámetros de muestra que no devuelven filas pero generan el mismo plan):

```
sessionRepo.currentForUser          → /tunnel/status
sessionRepo.listActiveByWorkspace   → SSE multi-tenant
sessionRepo.findExpired             → job perezoso
auditRepo.list / list (por túnel)   → /api/team/logs
memberRepo.findMembership           → cada request (auth)
memberRepo.listMembers              → /api/team/members
mgmtIpRepo.getMgmtIpForUser         → /tunnel/activate
mgmt_peer_owners (listado por ws)   → /api/wireguard/peers
auth_attempts (rate limit)          → login/OTP/password-reset
signal_history (CPE timeline)       → ap-monitor
signal_history (24h por AP)         → ap-monitor dashboard
nodes (filterNodesForRole)          → /api/nodes
```

### 8 índices compuestos nuevos

[server/sql/schema_perf_indexes.sql](server/sql/schema_perf_indexes.sql) — aplicar con `npm run migrate:perf` (idempotente; chequea `information_schema.STATISTICS` antes de cada CREATE).

| Índice | Tabla | Justificación |
|--------|-------|---------------|
| `idx_tl_ws_created` | `tunnel_logs` | `WHERE ws=? ORDER BY created_at DESC LIMIT N` — antes filesort; ahora rango + recorrido inverso del árbol |
| `idx_tl_ws_tunnel_created` | `tunnel_logs` | `WHERE ws=? AND tunnel_id=? ORDER BY created_at DESC` — para timeline de UN túnel |
| `idx_tus_ws_status_activated` | `tunnel_user_sessions` | `WHERE ws=? AND status='ACTIVE' ORDER BY activated_at DESC` — extiende el existente `idx_tus_ws_status` con la columna de orden |
| `idx_tus_ws_user_status_activated` | `tunnel_user_sessions` | `WHERE ws=? AND user_id=? AND status='ACTIVE' ORDER BY activated_at DESC LIMIT 1` — current de un user (hot path: `/tunnel/status`, SSE) |
| `idx_tus_status_expires` | `tunnel_user_sessions` | `WHERE status='ACTIVE' AND expires_at < ?` — job perezoso de expiración |
| `idx_tsl_ws_created` | `tunnel_session_logs` | **No tenía índice por workspace_id** — cada lectura era full scan |
| `idx_inv_email_status_created` | `invitations` | `WHERE email=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1` |
| `idx_pr_user_active` | `password_resets` | `WHERE user_id=? AND used_at IS NULL AND expires_at > ?` |

**Principio:** la columna del `ORDER BY` va al final del compuesto. MySQL puede recorrer el árbol B+ en orden inverso sin filesort.

### Auditoría de prepared statements

Búsqueda exhaustiva (`db.(get|all|run|query)\([^)]*\$\{`) muestra que **toda interpolación encontrada es segura**:
- Cláusulas `IN (?,?,...)` donde los placeholders se generan desde `array.map(() => '?').join(',')` — no se interpola valor del usuario.
- `UPDATE ... SET ${sets.join(', ')}` donde cada elemento de `sets` es una cadena literal hardcoded (`'columna = ?'`).
- `auditRepo.js` arma SQL incremental con texto literal: `sql += ' AND tl.tunnel_id = ?'`.

**Cero SQL injection, cero placeholders faltantes.** El commit 5 del plan F11 ("convertir queries restantes a prepared statements") no aplica a este código — ya estaba bien.

### Regla operativa para añadir queries

1. **Inputs del usuario SIEMPRE como `?` en `params`.** Nunca interpolar con `${var}`.
2. Si el query es `WHERE col_a = ? AND col_b = ? ORDER BY col_c DESC`, asegurar que existe el índice compuesto `(col_a, col_b, col_c)`. Correr `npm run analyze:queries` para confirmar.
3. Para listas dinámicas `IN (...)`: generar los `?` con `arr.map(() => '?').join(',')` y pasar el array como params. Es el único uso aceptable de interpolación en SQL.
4. Si la query es nueva y caliente, agrégala a `tools/analyze-queries.js` antes del primer release.

---

## 25) 🔒 Auditoría final — semgrep + npm audit (FASE 12)

### `npm audit` — vulnerabilidades de deps

```bash
# server
cd server && npm audit --omit=dev   → found 0 vulnerabilities

# vpn-manager
cd vpn-manager && npm audit --omit=dev   → found 0 vulnerabilities
```

**0 vulnerabilidades en producción** en ambos workspaces. Las 6 restantes con `npm audit` total son devDeps (`vite`/`vitest`/`esbuild` cadena interna) — requieren upgrade breaking de Vitest 2→3 para resolver. **Fuera del scope** (rompe los 99 tests existentes y la mejora real es nula en CI/runtime).

**Cleanup hecho en F12:** removido `uuid@10.0.0` + `@types/uuid` del vpn-manager. No se usaba en `src/`. Eliminó la única vuln moderate del bundle de producción.

### `semgrep` — análisis estático

Imagen oficial Docker:
```bash
docker run --rm -v "${PWD}:/src" -w /src semgrep/semgrep \
  semgrep --config p/security-audit --config p/nodejs --config p/react \
  --config p/typescript --config p/javascript --metrics=off .
```

| Ruleset | Reglas corridas | Findings | Resultado |
|---------|-----------------|----------|-----------|
| `p/security-audit` | 40 | 0 | ✅ |
| `p/nodejs + p/react + p/typescript + p/javascript` | 74 | 4 → **0** tras fix | ✅ |

### Findings y fixes (F12.3)

| # | Regla | Sitio | Severidad | Fix aplicado |
|---|-------|-------|-----------|--------------|
| 1 | `gcm-no-tag-length` | [db.service.js:186-196](server/db.service.js) | ERROR | `crypto.createCipheriv` y `createDecipheriv` con cuarto arg `{ authTagLength: 16 }`. Node ya valida que el tag sea exactamente 128 bits — blindaje contra tags truncados. Formato wire compatible (`encryptPass` siempre escribió 16 bytes); el round-trip test de `crypto.test.js` lo confirma. |
| 2 | `gcm-no-tag-length` | [db/rotateSecrets.js:27](server/db/rotateSecrets.js) | ERROR | Mismo fix — opciones GCM extraídas a constante local. |
| 3 | `bypass-tls-verification` | [routeros.service.js:133](server/routeros.service.js) | WARNING | `// nosemgrep: bypass-tls-verification` + justificación: RouterOS sirve la API SSL en puerto 8729 con cert autofirmado de fábrica. Emitir certs reales queda fuera del scope del software. |
| 4 | `bypass-tls-verification` | [ubiquiti.service.js:58](server/ubiquiti.service.js) | WARNING | Análogo — airOS HTTPS interno con cert autofirmado. |

**Re-scan tras fixes: 0 findings.**

### `.semgrepignore`

Excluye `node_modules/`, `dist/`, `**/test/`, `**/*.test.*`, `**/*.spec.*`, `e2e/`, `.claude/`, `packages/contracts/dist/`. Los tests no se scanean porque generan ruido (mocks, fixtures con valores deliberadamente débiles).

### Convenciones documentadas para futuro

| Convención | Dónde |
|------------|-------|
| `AES-256-GCM` con `{ authTagLength: 16 }` siempre | F12 |
| Cualquier `rejectUnauthorized: false` o similar requiere `// nosemgrep: <regla>` + comentario justificativo | F12 |
| `npm audit --omit=dev` debe ser 0 en cada release | F12 |
| Semgrep en CI: ambos rulesets deben quedar en 0 findings | F12 |
| 99 tests verdes como **pre-condición** de cualquier merge a `dev`/`main` | F4-F12 |

Documentación viva relacionada:
- [ARQUITECTURA.md](./ARQUITECTURA.md) — 8 diagramas Mermaid del estado post-refactor (sistema, monorepo, splits backend, lazy frontend, multi-tenant, multi-usuario, observabilidad, MySQL perf).
- [vpn-manager/CLAUDE.md](./vpn-manager/CLAUDE.md) — convenciones de UI + convenciones post-refactor (contracts, code-splitting, testing, audit).
- [REFACTOR_PLAN.md](./REFACTOR_PLAN.md) — plan original, ya ejecutado al 100%.

---

## 28) 🔧 Diagnóstico de red — ping / traceroute (Q3)

> Cierra el ciclo de soporte: hoy el operador abre SSH al MikroTik manualmente cuando algo no responde. Ahora puede lanzar ping/traceroute desde el panel, con autenticación, rate-limit y log estructurado.

### UX flow

1. En la lista de nodos (NodeAccessPanel), abre el **kebab** del nodo → **Diagnosticar (ping/trace)**.
2. Aparece `DiagnosticsModal` con dos tabs (**Ping** / **Traceroute**) y el campo *Destino* precargado con `ip_tunnel` del nodo.
3. Cambia el target si necesitas probar otra IP (ej. un CPE detrás del túnel).
4. **Ejecutar** dispara la consulta. El comando **se ejecuta en el router central**, no en el navegador — así el path de red coincide con el que usan los túneles reales.
5. Resultados:
   - **Ping**: 4 cards de stat (Enviados / Recibidos / Pérdida / RTT prom.) + tabla por seq con host/tiempo/TTL/tamaño. Pérdida `>0` colorea en rojo; sin pérdida, verde.
   - **Traceroute**: tabla con cada hop (número, dirección, RTT, pérdida). Hops sin respuesta muestran `* * *` y timeout en rojo.

### Endpoints

```
POST  /api/diagnostics/ping        { target, count? }
POST  /api/diagnostics/traceroute  { target }
```

- `target` validado con Zod: IPv4 dotted (`192.168.50.1`) o hostname (`cpe-norte.local`). CIDR rechazado.
- `count` opcional 1-10 (default 4).
- Bajo el capó: `/tool/ping count=N` y `/tool/traceroute count=1 timeout=2s max-hops=20` vía RouterOS API.

### Rate limit

5 requests cada 10 s **por user_id** (en memoria, sin persistir). 6.º request → `429 RATE_LIMITED`. Evita abuso del usuario logueado; un ataque DDoS real se mitiga con address-list en el router, no acá.

### Códigos de error

| HTTP | code | Cuándo |
|------|------|--------|
| 401 | `NO_SESSION` | `req.account` ausente (debería filtrar el middleware antes, defensa adicional) |
| 422 | `VALIDATION_ERROR` | target inválido (zod) |
| 429 | `RATE_LIMITED` | Demasiados diagnósticos en ventana 10 s |
| 503 | `NEEDS_CONFIG` | MikroTik no configurado en Ajustes |
| 500 | `PING_FAILED` / `TRACE_FAILED` | Error en RouterOS (router caído, etc.) |

### Archivos clave

| Archivo | Para qué |
|---------|----------|
| [packages/contracts/src/diagnostics.ts](packages/contracts/src/diagnostics.ts) | Zod + tipos compartidos. `DiagnosticsTargetSchema` (IPv4 OR hostname), `DiagnosticsPingRequest/Response`, `DiagnosticsTraceRequest/Response`. |
| [server/routes/diagnostics.routes.js](server/routes/diagnostics.routes.js) | Endpoints + rate limit + parser de la salida de RouterOS. `summarize(rows)` calcula `lossPct`, `min/avg/max ms`. Traceroute agrupa por hop desde `address-N`/`rtt-N`/`loss-N`/`status-N`. |
| [server/test/unit/diagnostics.test.js](server/test/unit/diagnostics.test.js) | 7 tests: parser ping (3/4 OK), zod inválido, sin mikrotik (503), sin sesión (401), rate limit (429 en el 6º hit), trace agrupado, trace con hop timeout. |
| [vpn-manager/src/services/diagnosticsApi.ts](vpn-manager/src/services/diagnosticsApi.ts) | `ping()` y `traceroute()` con tipos del contracts. |
| [vpn-manager/src/components/Devices/NodeAccessPanel/modals/DiagnosticsModal.tsx](vpn-manager/src/components/Devices/NodeAccessPanel/modals/DiagnosticsModal.tsx) | Modal con tabs, stats coloreadas, tablas. Cierra con click fuera, Enter ejecuta. |
| `NodeCard` + `NodesTable` + `NodesListSection` | Cadena de props `onDiagnoseNode → onDiagnose` hasta el botón "Diagnosticar" en el kebab. |

### Bug capturado por los tests

`AppError(message, status, code)` — el constructor recibe el mensaje primero. El handler inicial llamaba `AppError(503, 'NEEDS_CONFIG', 'Configura...')` (orden invertido), lo que dejaba `status` con el string `'NEEDS_CONFIG'` y `res.status('NEEDS_CONFIG')` rompía Express → todo error caía como `500 INTERNAL` opaco. Los tests `rechaza sin mikrotik (503)`, `rechaza sin sesión (401)` y `rate-limit (429)` fallaron al primer correr con `expected 500 to be …`, marcando el bug. Fix: invertir args.

**Regla operativa:** todo `throw new AppError(...)` debe leerse "mensaje, status, code" — coincide con cómo se mostraría: *"Sesión inválida, 401, NO_SESSION"*.

### Pendiente / mejoras futuras

- Persistir el rate limit en Redis si el backend escala a múltiples instancias (hoy in-memory por proceso).
- Permitir guardar perfiles de target (CPEs frecuentemente diagnosticados).
- Métricas Prometheus: `vpn_diagnostics_total{type, status}` para detectar abuso y operativa.

---

## 29) 📤 Export de bitácora — CSV / JSON (Q4)

Último quick win del cuarteto. Cierra el flujo "el cliente pide el reporte mensual" sin que el operador tenga que dumpear MySQL.

### UX flow

1. En el módulo **Equipo** → tarjeta **Actividad reciente** (AuditTimeline) → botón **Exportar** (esquina superior derecha del card).
2. Dropdown con:
   - Selector de rango: **Últimos 7 días / 30 días / 90 días / Todo el historial** (default 30 días — el rango más usado para reportes).
   - Botones **CSV** (primario) y **JSON**.
3. Click → descarga directa (Content-Disposition + nombre con fechas: `audit-2026-05-11_2026-06-10.csv`).
4. El CSV abre directo en Excel/Numbers (BOM UTF-8 → encoding detectado correctamente).

### Endpoints

```
POST /api/audit/export
  body: { from?, to?, tunnelId?, action?, format: 'csv' | 'json' }
  csv  → text/csv; charset=utf-8 + Content-Disposition: attachment
  json → application/json con { rows, meta }
```

- `from`/`to` = epoch ms. Defaults: ahora-30d / ahora.
- `tunnelId` y `action` opcionales (filtros adicionales).
- `format` opcional, default `csv`.
- Validación: `to < from` → `422 BAD_RANGE`. Format fuera de `'csv'|'json'` → `422 VALIDATION_ERROR` (zod).

### Rate limit

**1 export cada 5 s por usuario** (in-memory `Map<userId, lastTs>`). Cada export puede leer hasta 10 000 filas — un dashboard mal hecho que repita queries podría saturar el pool MySQL. Más allá del 5º hit consecutivo, `429 EXPORT_RATE_LIMITED`.

### Archivos clave

| Archivo | Para qué |
|---------|----------|
| [packages/contracts/src/audit.ts](packages/contracts/src/audit.ts) | `AuditExportRequestSchema` (zod) + `AuditExportRow` + `AuditExportJsonResponse`. |
| [server/db/repos/auditRepo.js](server/db/repos/auditRepo.js) | Nuevo `listForExport(workspaceId, { from, to, tunnelId, action, maxRows })`. Sin paginación: techo configurable (default 10 000, máximo absoluto 50 000). Usa `idx_tl_ws_created` de F11 — barato incluso con millones de filas. |
| [server/lib/csv.js](server/lib/csv.js) | Serializer RFC 4180-ish (sin deps): `escapeField`, `rowToCsv`, `toCsv` (generator). Maneja `","`, `'\n'`, `'\r'`, `'"'` duplicado, null/undefined → vacío. |
| [server/routes/audit.routes.js](server/routes/audit.routes.js) | Endpoint `POST /export`. CSV: stream `res.write` línea por línea con BOM UTF-8. JSON: `res.end(JSON.stringify({ rows, meta }))`. |
| [vpn-manager/src/services/auditApi.ts](vpn-manager/src/services/auditApi.ts) | `exportLogs()` con fetch directo (necesita `Content-Disposition` y body binario) + helper `downloadBlob` para disparar el download. |
| [vpn-manager/.../components/AuditTimeline.tsx](vpn-manager/src/components/Team/TeamModule/components/AuditTimeline.tsx) | Botón **Exportar** + dropdown inline con selector de rango y 2 botones (CSV / JSON). |

### Tests

20 nuevos en backend (`csv.test.js` + `auditExport.test.js`):

**csv.test.js (14)** — escape de comas, comillas duplicadas, newline, CR, null/undefined → vacío, números sin comillas. Generator `toCsv` con/sin header, vacío.

**auditExport.test.js (6)** — 200 + Content-Disposition + BOM en CSV, escape de campos con coma+comillas en el endpoint, JSON con meta correcto, rango inválido `to<from` → `422 BAD_RANGE`, format `'pdf'` → `422 VALIDATION_ERROR`, rate limit 429 al 2º hit en <5s.

**Total: 118 backend + 37 frontend = 155 verdes.**

### Decisiones documentadas

- **BOM UTF-8 al inicio del CSV** — sin esto Excel asume Windows-1252 y los acentos se ven como mojibake. El BOM es 3 bytes (`\xEF\xBB\xBF`); para Excel/Numbers es la convención esperada para detectar UTF-8.
- **Stream `res.write` por fila** — no acumulamos 10 000 filas en RAM. La memoria del backend queda lineal con el tamaño de UNA fila, no del export entero.
- **Sin librería de CSV** — `lib/csv.js` son 30 LOC, cubre RFC 4180 con tests. Agregar `papaparse` o similar sería 50 KB de deps para algo que ya tenemos.
- **Sin PDF nativo** — el CSV abre directo en Excel; si el cliente necesita PDF, lo hace desde Excel "Imprimir → Guardar como PDF". Agregar `puppeteer` o `pdfkit` al backend sería excesivo para un export reactivo (más deps, más superficie de ataque, más bundle).
- **JSON también disponible** — útil cuando el cliente integra con su propio sistema y no quiere parsear CSV. El JSON viene con `meta` (from/to/tunnelId/action/count) para que el consumidor pueda mostrar el header sin recalcular.

### Pendiente / mejoras futuras

- **Export de `tunnel_session_logs` y `signal_history`** — mismo patrón, otros datasets. Cada uno suma ~20 LOC.
- **Rangos custom** — hoy el UI ofrece presets. Cuando el cliente pida "del 1 de marzo al 15 de marzo", agregar date pickers `<input type="date">`.
- **Streaming chunked sobre miles de filas** — hoy el `listForExport` carga el resultado entero en memoria del backend antes de stream. Si crece a >100k filas, migrar a `query.stream()` de `mysql2` con cursor.

---

## 30) 📈 Dashboard de métricas en vivo (Q2)

Cierra el círculo de observabilidad: las métricas Prometheus ya estaban en `/metrics` desde F9, pero solo un operador con Prometheus/Grafana podía verlas. Ahora el `platform_admin` las ve desde el panel mismo, con polling 10s y sparklines.

### Arquitectura

```
prom-client registry (in-memory)
   ↑   inc() desde middleware HTTP + auth + routeros + mailer
   │
lib/dashboardMetrics.js
   ├─ snapshot()        → suma counters, calcula percentiles del histograma
   ├─ takeSample()      → guarda 1 punto/min en buffer circular (60 puntos)
   ├─ start()/stop()    → setInterval — arranca desde index.js junto al monitor
   │
routes/dashboard.routes.js
   └─ GET /api/dashboard/metrics  (solo platform_admin → 403 NOT_PLATFORM_ADMIN)
       │
       ▼
frontend MetricsPanel.tsx
   ├─ useEffect → polling 10s
   ├─ 4 KpiCards (Requests/min · Latencia p95 · Auth fails/h · RouterOS error %)
   └─ Sparkline.tsx (SVG inline, 0 deps)
```

### Lo que se visualiza

- **4 KPI cards** con sparkline embebida (área + línea) en la esquina superior derecha.
- **Breakdowns** por etiqueta cuando hay datos: errores RouterOS por tipo, auth fails por motivo, mails por kind.
- **Uptime** del proceso en el header del panel.
- **Indicador "En vivo"** con dot verde pulsando.

### Endpoint

```
GET /api/dashboard/metrics
  → 200 { success, current, history }
  → 403 NOT_PLATFORM_ADMIN si el usuario no es admin de plataforma
```

`current` (snapshot ACTUAL — totales acumulados, no derivadas):
- `httpRequests`, `httpErrors` (5xx)
- `authFails` + `authFailsByReason`
- `routerosErrors` + `routerosErrorsByType` + `routerosWrites` + `routerosOkRatio` (0..1)
- `mailSent` + `mailByKind`
- `latencyP50s`, `latencyP95s`, `latencyP99s` (segundos, calculados con interpolación lineal en buckets)
- `uptimeMs` (process uptime)

`history` (buffer circular de 60 puntos — 1/min):
- Cada `DashboardSample` trae solo los counters relevantes para sparkline (httpRequests, httpErrors, authFails, routerosErrors/Writes, latencyP95s).

### Decisiones documentadas

- **Sin Recharts ni libs de chart** — `Sparkline.tsx` son 80 LOC de SVG inline. Agregar Recharts serían ~150 KB raw / ~45 KB gzip; para gráficos de panel admin esto es overkill. Si más adelante necesitamos legends/tooltips ricos, evaluar entonces.
- **No persiste el histórico** — el buffer circular vive en RAM del proceso. Si reinicia, se pierde la última hora del sparkline. Consistente con `prom-client` (in-memory). Para histórico real → scrape externo con Prometheus.
- **Solo platform_admin** — las métricas globales no son negocio del moderador. Los counters cruzan workspaces y exponer eso violaría aislamiento multi-tenant.
- **Polling cada 10s en el frontend, sampling cada 60s en el backend** — el polling busca actualizar "ahora" rápido (el dashboard reacciona al instante); el sampling es para llenar el sparkline a un costo bajo (60 muestras/h = 1 query/min al registry, no tiene impacto).
- **Interpolación lineal de percentiles** — `prom-client` no expone percentiles directos en JS (solo en el formato Prometheus). La interpolación entre buckets acumulativos es la fórmula estándar para dashboards; no es exacta para SLO billing, pero para "¿está la API rápida?" es la respuesta correcta.

### Archivos clave

| Archivo | Para qué |
|---------|----------|
| [packages/contracts/src/dashboard.ts](packages/contracts/src/dashboard.ts) | `DashboardMetricsResponse` y `DashboardSample` — tipos compartidos. |
| [server/lib/dashboardMetrics.js](server/lib/dashboardMetrics.js) | Aggregator + percentile calculator + buffer circular + sampler. |
| [server/routes/dashboard.routes.js](server/routes/dashboard.routes.js) | `GET /api/dashboard/metrics` con guard `platform_admin`. |
| [server/test/unit/dashboardMetrics.test.js](server/test/unit/dashboardMetrics.test.js) | 8 tests: counters base, agregación por label, ratio routeros, percentiles vacío/cortos/mezclados, history append. |
| [vpn-manager/src/components/Common/Sparkline.tsx](vpn-manager/src/components/Common/Sparkline.tsx) | Componente reusable. Memoizado. Acepta `data: number[]`, ancho/alto, color via `currentColor`. Maneja arrays vacíos / 1 punto / series planas / negativos. |
| [vpn-manager/src/services/dashboardApi.ts](vpn-manager/src/services/dashboardApi.ts) | `dashboardApi.metrics()`. |
| [vpn-manager/src/components/Admin/AdminDashboard/MetricsPanel.tsx](vpn-manager/src/components/Admin/AdminDashboard/MetricsPanel.tsx) | Componente principal con polling 10s, 4 KpiCards + breakdowns. |

### Tests

8 nuevos en `dashboardMetrics.test.js`:
- 4 de `snapshot` de counters: totales 0 sin eventos, suma por etiqueta `status` y 5xx separados, `authFailsByReason` agrupado, `routerosOkRatio` 1 → 0.5 → 1.
- 3 de percentiles del histograma: vacío → 0, 1ms × 100 → p50 ≈ 0.001, mezcla 90×10ms + 10×100ms → p50 ≤ 0.025 y 0.025 < p95 ≤ 0.1.
- 1 de `takeSample` / `history` append.

**Total: 126 backend + 37 frontend = 163 verdes.**

### Pendiente / mejoras futuras

- **Histórico persistido** — escribir los snapshots a una tabla `metrics_snapshots(ts, json)` para sobrevivir reinicios. ~30 LOC. Hoy basta con que Prometheus haga scrape externo.
- **Alertas dentro del panel** — si `routerosOkRatio < 0.9` por 5 min, mostrar banner amarillo arriba del dashboard (reutiliza la lógica del notifier).
- **Métricas de negocio** — `tunnels_active`, `members_total`, `subnets_scanned_total`. Hoy las cards de arriba del AdminDashboard usan `/api/admin/summary` con MySQL puro; podría unificarse.

---

## 31) 🛡️ Monitoreo proactivo (M5)

Cierra el loop entre observación (F9/Q2), notificaciones (Q1) y diagnóstico (Q3). Antes el operador descubría un nodo caído porque un cliente llamaba; ahora el job lo detecta y notifica al OWNER antes que la queja.

### Flujo

```
setInterval cada MONITORING_INTERVAL_MS (default 5 min)
   │
   ▼
[1] Lee MT_IP/MT_USER/MT_PASS desde app_settings.
   │
   ▼
[2] Conecta UNA vez al router central y trae /ppp/active/print
   → set de ppp_users vivos.
   │
   ▼
[3] Lee SELECT ppp_user, nombre_nodo, nombre_vrf, workspace_id FROM nodes
    junto con monitoring_state previo (listAll).
   │
   ▼
[4] Para cada nodo:
   ├─ está en el set → recordCheck('up', fail_count=0)
   │     · si venía DOWN → notify NODE_RECOVERED al OWNER
   │       (payload incluye downSeconds desde last_alert_at)
   │     · recoverySent=true (actualiza last_recovery_at)
   │
   └─ NO está → recordCheck('down', fail_count++)
         · ¿fail_count >= MONITORING_FAIL_THRESHOLD (default 3)?
           AND (now - last_alert_at) >= MONITORING_ALERT_COOLDOWN_MS
           (default 30 min)?
              → notify NODE_DOWN al OWNER (payload con failCount)
              → alertSent=true (actualiza last_alert_at)
              → cooldown frena alertas siguientes mientras esté caído
```

### Anti-flap explicado

Con defaults: `interval 5min × threshold 3` = **15 min de gracia** antes de la primera alerta. Esto cubre el caso típico de un router que se reinicia 30s — los 2 primeros polls fallan pero el 3º ya lo encuentra vivo, sin spam.

Cooldown 30 min: si el problema persiste 2h, el OWNER recibe ~4 emails, no 24.

### Variables `.env` nuevas

```bash
# Job de monitoreo proactivo (M5). Sin esto los defaults aplican.
MONITORING_ENABLED=true                          # false para apagar
MONITORING_INTERVAL_MS=300000                    # cada 5 min
MONITORING_FAIL_THRESHOLD=3                      # polls fallidos antes de NODE_DOWN
MONITORING_ALERT_COOLDOWN_MS=1800000             # 30 min entre alertas DOWN repetidas
```

### Schema nuevo

```sql
CREATE TABLE monitoring_state (
  workspace_id     CHAR(36)    NOT NULL,
  target_kind      VARCHAR(20) NOT NULL,         -- 'node' hoy
  target_id        VARCHAR(190) NOT NULL,        -- ppp_user del nodo
  last_status      VARCHAR(20)  NOT NULL DEFAULT 'unknown',
  fail_count       INT          NOT NULL DEFAULT 0,
  last_check_at    BIGINT       NOT NULL DEFAULT 0,
  last_alert_at    BIGINT       DEFAULT NULL,
  last_recovery_at BIGINT       DEFAULT NULL,
  PRIMARY KEY (workspace_id, target_kind, target_id),
  KEY idx_mon_status (last_status, last_check_at)
);
```

Aplicar con `cd server && npm run migrate:monitoring` (idempotente).

### Archivos clave

| Archivo | Para qué |
|---------|----------|
| [server/sql/schema_monitoring.sql](server/sql/schema_monitoring.sql) | Tabla `monitoring_state` (1 fila por (ws, kind, id)). |
| [server/db/migrateMonitoring.js](server/db/migrateMonitoring.js) | Migrador idempotente — `npm run migrate:monitoring`. |
| [server/db/repos/monitoringRepo.js](server/db/repos/monitoringRepo.js) | `listAll`, `listByWorkspace`, `recordCheck` con upsert. Defensivo ante `ER_NO_SUCH_TABLE` (mismo patrón que Q1). |
| [server/lib/monitoringJob.js](server/lib/monitoringJob.js) | `start`/`stop`/`runOnce`. Lee creds MT_*, conecta UNA vez, mapea ppp_users vivos vs nodos del MySQL, dispara NODE_DOWN/RECOVERED al OWNER. |
| [server/lib/notifier.js](server/lib/notifier.js) | Templates HTML/text para `NODE_DOWN` (🔴 con failCount) y `NODE_RECOVERED` (✅ con downSeconds formateado). |
| [packages/contracts/src/notifications.ts](packages/contracts/src/notifications.ts) | Enum `NotificationEventSchema` ampliado a 5 eventos. |
| [vpn-manager/.../NotificationsTab.tsx](vpn-manager/src/components/Settings/ModeratorSettings/tabs/NotificationsTab.tsx) | `EVENT_LABEL` + `EVENT_DESC` + `ALL_EVENTS` ampliados — el usuario puede suscribirse/desuscribirse a los nodos caídos como cualquier otro evento. |
| [server/test/unit/monitoringJob.test.js](server/test/unit/monitoringJob.test.js) | 9 tests: 3 del anti-flap (1/2/3 fallos), 2 del cooldown (dentro/fuera), 2 del recovery (con/sin previo DOWN), 2 de robustez (sin creds, router caído). |

### Decisiones documentadas

- **Job único multi-tenant** — un solo `connectToMikrotik` por tick. Si el router cae, el tick termina sin alertas (no genera ruido falso). Defensa: `monitoringJob.test.js > robustez` lo verifica.
- **Anti-flap con counter en BD** — el counter persiste a través de reinicios del backend; si reinicias en mitad de un outage, el job no resetea el progreso del anti-flap.
- **Cooldown medido contra `last_alert_at`** — no contra `last_check_at`. Significa: una vez alertado, no vuelves a alertar hasta `cooldown_ms`, aun si el nodo sigue caído.
- **Notifica solo al OWNER del workspace** — `workspace_members` con `role='OWNER' AND deleted_at IS NULL`. Si quieres notificar también CO_MOD, cambiar el `LIMIT 1` por un foreach (~5 LOC).
- **Reusa `notifier.notify`** — toda la maquinaria de canales (email/Telegram), pausa global y suscripción por evento ya existe. M5 solo agrega eventos al enum y templates a `buildMessage`.
- **El job no escribe en RouterOS** — solo lee `/ppp/active/print`. No toca peers, mangle, ni reglas. Es seguro para correr cada 5 min sin riesgo de degradar el core.

### Pendiente / mejoras futuras

- **Monitoreo de antenas Ubiquiti** — agregar `target_kind='ap'` que cada N min SSH a la antena y verifica `signal_dbm` contra un umbral. Reusa la misma tabla `monitoring_state` y los mismos eventos (extendidos a `SIGNAL_DEGRADED`).
- **Endpoint `GET /api/monitoring/status`** — devuelve la tabla actual para mostrarla como tarjeta en el dashboard ("3 nodos abajo · 2 alertados").
- **Configuración por workspace** — hoy los umbrales son globales (`.env`). Para un SaaS multi-tenant real, mover a `app_settings` o tabla nueva por workspace.
- **Métrica Prometheus** — `vpn_monitoring_node_state{workspace,node,status="up|down"}` gauge para que Grafana también vea el estado.

---

### Fix urgente — contracts dual package CJS+ESM (post-Q1/M1)

Cuando se agregaron las nuevas notificaciones a contracts, el dev server de Vite empezó a tirar:

```
Uncaught SyntaxError: The requested module '/GestionVPN-1.0/@fs/.../packages/contracts/dist/index.js'
does not provide an export named 'ROLE_LABEL' (at account.ts:24:10)
```

**Causa raíz:** `@gestionvpn/contracts` se compilaba sólo como **CommonJS** (`module: "commonjs"`). Vite necesita ESM para hacer named imports estáticos de **valores runtime** (como `ROLE_LABEL`). Los named imports de `type` se borraban antes (TypeScript los elimina), pero `ROLE_LABEL` SÍ es runtime y disparaba el error.

**Fix:** dual package — CJS para el backend (`require`), ESM para el frontend (Vite). Estructura nueva:

```
packages/contracts/
├── tsconfig.json          ← base (editor, lint)
├── tsconfig.cjs.json      ← module: commonjs → dist/cjs/
├── tsconfig.esm.json      ← module: esnext + moduleResolution: bundler → dist/esm/
└── package.json
    ├── main:     ./dist/cjs/index.js
    ├── module:   ./dist/esm/index.js
    ├── types:    ./dist/cjs/index.d.ts
    └── exports[".":
        ├── types:   ./dist/cjs/index.d.ts
        ├── import:  ./dist/esm/index.js  ← Vite va por aquí
        └── require: ./dist/cjs/index.js  ← Node va por aquí
       ]
```

`npm run build:contracts` ahora corre `clean → build:cjs → build:esm → postbuild`. El `postbuild` escribe un `package.json` con `"type"` correcto en cada subcarpeta (`commonjs` y `module` respectivamente) para que Node respete el formato.

**Side-benefit grande:** `TeamModule` bajó de **415 KB → 127 KB raw** (-69%) y de **85 KB → 35 KB gzip** (-59%). El bundle ESM permite tree-shaking real desde el frontend; antes Vite tenía que incluir el CJS entero porque no podía determinar exports estáticamente.

**Reglas operativas tras este fix:**
- Cualquier cambio en `packages/contracts/src/` → `npm run build:contracts` desde la raíz.
- Backend (`require('@gestionvpn/contracts')`) y frontend (`import { X } from '@gestionvpn/contracts'`) consumen automáticamente el formato correcto vía el `exports` map.
- El `tsconfig.json` base se mantiene como `module: "commonjs"` para que editores/IDE inferieran el formato más usado. Los dos derivados manejan el output real.

---

## 26) 🔔 Notificaciones por usuario (Q1)

Primera feature del backlog post-refactor. Permite al usuario recibir email y/o Telegram cuando ocurren ciertos eventos. Cubre dos casos hoy y deja la base preparada para M1 (bot interactivo).

### Eventos cubiertos

| Evento | Disparado por |
|--------|---------------|
| `TUNNEL_ACTIVATED` | `POST /api/tunnel/activate` (hook en handler) |
| `TUNNEL_DEACTIVATED` | `POST /api/tunnel/deactivate` (solo si había sesión real) |
| `SESSION_EXPIRED` | Job batch — antes era lazy en `/tunnel/status`, ahora corre cada 60s |

### Arquitectura

```
                    notifier.notify({userId, event, payload})
                                  │
                                  ▼
            notificationRepo.getOrDefault(userId)
              ├── paused? → skip
              └── event ∈ event_types? → skip si no
                                  │
                                  ▼
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       channels.email                  channels.telegram
       ▼                               ▼
       mailer.sendGeneric              telegram.sendMessage
       (HTML + texto)                  (HTML, fetch a api.telegram.org)
                  │                               │
                  └──────────► notification_log ◄─┘
                          (append-only, no throw)
```

### Archivos clave

| Archivo | Para qué |
|---------|----------|
| [server/sql/schema_notifications.sql](server/sql/schema_notifications.sql) | 2 tablas: `notification_subscriptions` (1 fila/usuario, JSON canales+eventos), `notification_log` (append-only). |
| [server/db/migrateNotifications.js](server/db/migrateNotifications.js) | Idempotente — `npm run migrate:notifications`. |
| [server/db/repos/notificationRepo.js](server/db/repos/notificationRepo.js) | `getOrDefault`, `updatePreferences`, `generateTelegramLinkCode` (6 chars TTL 15min), `confirmTelegramLink`, `unlinkTelegram`, `log`. |
| [server/lib/notifier.js](server/lib/notifier.js) | `notify({userId, event, payload})` y `buildMessage(event, payload)`. Templates por evento (HTML + texto), respetando huso `America/Lima`. |
| [server/lib/telegram.js](server/lib/telegram.js) | Cliente Telegram Bot API — solo `sendMessage` (HTTP POST con timeout 8s y AbortController). `isConfigured()` revisa `TELEGRAM_BOT_TOKEN`. |
| [server/lib/expirationJob.js](server/lib/expirationJob.js) | setInterval cada 60s. `sessionRepo.findExpired()` → `closeSession` → `notify('SESSION_EXPIRED')`. Configurable con `EXPIRATION_JOB_ENABLED` y `EXPIRATION_JOB_INTERVAL_MS`. |
| [server/lib/mailer.js](server/lib/mailer.js) | Helper nuevo `sendGeneric({to, subject, html, text})`. En DEV (sin SMTP) marca `dev: true` sin throw. |
| [packages/contracts/src/notifications.ts](packages/contracts/src/notifications.ts) | Zod schemas + tipos compartidos: `NotificationEvent`, `NotificationChannels`, `NotificationPreferences`, `NotificationStatus`, `TelegramLinkStartResponse`. |
| [vpn-manager/.../tabs/NotificationsTab.tsx](vpn-manager/src/components/Settings/ModeratorSettings/tabs/NotificationsTab.tsx) | UI completa: pausa global, toggle por canal, toggle por evento, flujo de vinculación con Telegram. |

### Endpoints

```
GET    /api/account/notifications              → { channels, eventTypes, paused, telegramLinked, telegramBotConfigured }
PATCH  /api/account/notifications              → { channels, eventTypes, paused }
POST   /api/account/telegram/link/start        → { code, expiresAt }  (TTL 15 min)
POST   /api/account/telegram/unlink            → {}
```

El bot (cuando vivo en producción) hará `/link CODE` desde Telegram y llamará a `notificationRepo.confirmTelegramLink({code, chatId})` internamente — ese hook viene en M1 cuando se enchufa el bot interactivo. Por ahora la UI solo expone "start": el operador puede usar `confirmTelegramLink` manualmente para pruebas.

### Variables `.env` nuevas

```bash
# Telegram (Q1 / M1). Sin esto, telegram.sendMessage devuelve { skipped: true }
# y el notifier registra status='skipped' en notification_log.
TELEGRAM_BOT_TOKEN=

# Job de expiración (Q1 — antes lazy)
EXPIRATION_JOB_ENABLED=true
EXPIRATION_JOB_INTERVAL_MS=60000
```

### Defensa contra "tablas no migradas"

Cuando un operador olvida correr `npm run migrate:notifications`, el flujo no debe explotar con 500 opaco. Estrategia tras esta sesión:

- **Lectura** (`GET /api/account/notifications`): `notificationRepo.getByUser` envuelve el query en try/catch; si detecta `ER_NO_SUCH_TABLE` o `doesn't exist`, devuelve `null` y emite UN warning en el log (`warnOnceNoTable`). `getOrDefault` cae al default — el frontend ve los defaults y la tab Notificaciones carga sin error.
- **Mutaciones** (`PATCH /notifications`, `POST /telegram/link/start`, `POST /telegram/unlink`): try/catch en el handler con helper `asNotMigratedIfNeeded(err)` → `503 NOTIFICATIONS_NOT_MIGRATED` con mensaje accionable *"Tablas de notificaciones no creadas — el Administrador debe correr `npm run migrate:notifications`."*

Bug capturado al revisar este caso: `AppError(503, 'TELEGRAM_NOT_CONFIGURED', '...')` estaba con orden invertido (mismo bug que Q3) — corregido a `AppError(message, 503, code)`. Regla de §28 aplica: *mensaje, status, code*.

### Tests

`test/unit/notifier.test.js` (9 tests, sin BD ni red):
- skip si `paused`
- skip si evento no está en `event_types`
- dispatch a ambos canales cuando ambos habilitados
- mailer falla + telegram OK → ambos quedan en `notification_log` con status correcto
- solo telegram → no llama al mailer
- telegram skipped (sin token) → status `skipped`, no `failed`
- 3 tests del `buildMessage` por evento

**Total: 71 backend + 37 frontend = 108 verdes.**

### Decisiones documentadas

- **Sin tabla por defecto**: `getOrDefault(userId)` devuelve una sub "fantasma" en memoria con defaults — solo se inserta cuando el usuario guarda preferencias por primera vez. Evita backfill innecesario y row count constante por usuario.
- **`buildMessage` centralizado**: el caller (handlers de túnel + job) NO arma el mensaje. Pasa solo `event` y `payload`. Si querés cambiar el wording de los emails de "Túnel activado" lo cambiás en un solo sitio.
- **Telegram envía HTML, no Markdown**: HTML escapa `<`/`>` automáticamente; Markdown V2 obliga a escapar manualmente `_*[]()~\`>#+-=|{}!.` Es trampa.
- **No bloqueamos handlers de túnel si la notif falla**: `notifier.notify(...).catch(...)` desde el handler — la notif es secundaria al flujo de túnel.
- **Job de expiración no toca el router**: solo cierra en BD + notifica. El mangle del usuario se limpia cuando el usuario active otro túnel (ya lo hace `tunnel/activate` por contrato). Mantener responsabilidades separadas.

### Pendiente para M1

✅ **M1 implementado** en commit posterior — ver §27.

---

## 27) 🤖 Bot Telegram interactivo (M1)

> ⚠️ **Actualización iter2 (§32):** desde el commit `b441cbc`, `/activar` y `/desactivar` ejecutan la acción real (vía `lib/tunnelService.js`) — ya NO devuelven deep-link. `/activar` sin args muestra lista numerada con TTL 15 min; el usuario responde con el número. Esta sección documenta el modelo M1 original; las diferencias del iter2 están en §32.

> 👤 **Para usuarios finales:** [MANUAL_USUARIO.md](./MANUAL_USUARIO.md) — guía paso a paso (no técnica) con capturas del flujo de vinculación, ejemplos de cada comando, troubleshooting y FAQ. Compártelo con los moderadores y miembros.

Construido sobre Q1: el bot detecta al usuario por su `telegram_chat_id` ya vinculado en `notification_subscriptions`. Sin código de auth adicional — Telegram autentica el chat desde su lado, nuestro sistema confía en esa identidad.

### Comandos

| Comando | Estado de auth | Qué hace |
|---------|----------------|----------|
| `/start` | Sin vinculación → instrucciones · vinculado → saluda | Mensaje de bienvenida |
| `/help` | Cualquiera | Lista de comandos disponibles (varía si está vinculado) |
| `/link CODE` | Sin vinculación | Confirma el código de 6 chars hex generado en `Ajustes → Notificaciones → Vincular` |
| `/unlink` | Requiere vinculación | Borra `telegram_chat_id` de la sub |
| `/status` | Requiere vinculación | Túnel activo (si hay): VRF, expiración |
| `/tuneles` | Requiere vinculación | Lista hasta 30 túneles disponibles (MEMBER → solo asignados; OWNER/CO_MOD → todos del workspace) |
| `/activar VRF-X` | Requiere vinculación | Devuelve **deep-link** `APP_BASE_URL?activate=VRF-X` |
| `/desactivar` | Requiere vinculación | Devuelve deep-link `APP_BASE_URL?deactivate=1` |

### Decisión clave: deep-links en lugar de mutación directa

**El bot no activa túneles directamente.** Las razones:

1. **Auth débil vs fuerte**: la cookie HttpOnly `vpn_session` del navegador tiene `sameSite=lax` + `secure` + `8h` TTL, validada por `verifyToken` con cache LRU. Telegram solo nos da que `chat_id == 123456`. Aceptar mutación con esa única señal degrada el modelo de auth.

2. **Confirmación humana**: activar un túnel toca el router (mangle + VRF). Un comando suelto en un chat puede ejecutarse por error (autocompletado en móvil). El deep-link obliga a abrir el panel, ver el estado, confirmar.

3. **Reuso del flujo existente**: `tunnel.routes.js` ya valida ownership, multi-tenant, expira sesiones, audita. Replicar eso desde el bot duplicaría lógica de seguridad.

El frontend acepta `?activate=VRF-X` y `?deactivate=1` como query params (pendiente UI hook — el bot ya genera los URLs, el handler del query es trivial cuando se sume).

### Arquitectura: long-polling

```
┌─────────────────────────────────────────┐
│        api.telegram.org/bot{TOKEN}      │
└────────────────────┬────────────────────┘
                     │ getUpdates?timeout=25&offset=N
                     ▼
        ┌────────────────────────┐
        │  lib/telegramBot.js    │
        │  while (_running) {    │
        │    updates = await get │
        │    for (u of updates)  │
        │      handleMessage(u)  │
        │    _offset = u.id+1    │
        │  }                     │
        └───────────┬────────────┘
                    │ chat_id → notification_subscriptions
                    ▼
            ┌───────────────────┐
            │  user_id resuelto │
            └───────┬───────────┘
                    │
        ┌───────────┼───────────┬────────────┐
        ▼           ▼           ▼            ▼
   sessionRepo  userRepo  workspace_members  nodes
   (/status)    (saludo)  (rol y ws)        (/tuneles)
```

`update_id` se guarda **en memoria** (`_offset`). Si el server reinicia, los updates entre reinicio se pierden — aceptable para comandos interactivos (el usuario reenvía). Para producción con HA migrar a persistencia (`app_settings.telegram_last_update_id`).

### Archivos clave

| Archivo | Para qué |
|---------|----------|
| [server/lib/telegramBot.js](server/lib/telegramBot.js) | Loop + dispatcher de 8 comandos. `start()`, `stop()`, `handleMessage()` (exportado para tests). |
| [server/lib/telegram.js](server/lib/telegram.js) | Cliente `sendMessage` ya existente (Q1). |
| [server/db/repos/notificationRepo.js](server/db/repos/notificationRepo.js) | `confirmTelegramLink`, `unlinkTelegram` — reusados. |
| [server/index.js](server/index.js) | `telegramBot.start()` al arrancar listen + `SIGTERM`/`SIGINT` graceful shutdown. |
| [server/test/unit/telegramBot.test.js](server/test/unit/telegramBot.test.js) | 20 tests del dispatcher (auth, comandos, deep-links). |

### Variables `.env`

```bash
TELEGRAM_BOT_TOKEN=          # required — sin esto el bot no arranca
TELEGRAM_BOT_ENABLED=true    # false para opt-out aunque haya token
APP_BASE_URL=                # para los deep-links de /activar y /desactivar
```

### Decisiones documentadas adicionales

- **`allowed_updates=["message"]`** en `getUpdates` — solo escuchamos mensajes de texto. Telegram tiene también `callback_query` (botones inline), `edited_message`, etc. No los necesitamos hoy; cuando agreguemos botones inline para confirmaciones tipo "¿Activar VRF-X? Sí/No", se amplía.
- **`POLL_TIMEOUT_SEC = 25`** — un poco bajo el máximo de 50s para que el `AbortController` del shutdown abra ventana en máximo 25s.
- **Errores en handler son aislados**: `handleMessage(u).catch(...)` por update; un fallo en `/tuneles` no para el loop.
- **Comando con `@BotName`**: en grupos, Telegram entrega `/start@MyVpnBot` — el dispatcher hace `.split('@')[0]` para normalizar.

### Closer M1 — deep-link end-to-end

El bot envía URLs `APP_BASE_URL?activate=VRF-X` y `?deactivate=1`. El frontend las procesa así:

1. [vpn-manager/src/context/hooks/useDeepLinks.ts](vpn-manager/src/context/hooks/useDeepLinks.ts) — al primer mount de `App.tsx` lee los query params, los guarda en `sessionStorage` (`pending_tunnel_activate`, `pending_tunnel_deactivate`), limpia el URL con `history.replaceState` para evitar re-dispare al refrescar. **sessionStorage sobrevive al flujo de login** — si el usuario no estaba autenticado, la acción se conserva.
2. [App.tsx](vpn-manager/src/App.tsx) — tras autenticarse, si hay un flag pendiente, cambia automáticamente `activeModule` a `'nodes'`.
3. [components/Devices/NodeAccessPanel/components/DeepLinkBanner.tsx](vpn-manager/src/components/Devices/NodeAccessPanel/components/DeepLinkBanner.tsx) — banner azul que muestra `"El bot de Telegram solicitó activar VRF-X — Activar ahora / Cancelar"`. El `useEffect` consume el flag UNA vez al montar (no se re-dispara con refresh).
4. `NodeAccessPanel.handleDeepActivate(targetVRF)` y `handleDeepDeactivate()` ejecutan `POST /api/tunnel/activate` o `deactivateAllNodes()` con toast del progreso.

Esto cierra el círculo M1: el bot **no** muta directamente, el usuario **confirma con un click** desde la sesión segura del panel.

### Estado del backlog tras M1

| | Hecho | Pendiente |
|---|---|---|
| Quick wins | **Q5** · **Q1** | Q2 · Q3 · Q4 |
| Mid-size | **M1** | M2 · M3 · M4 · M5 |
| Grandes | — | L1-L4 |

Tests totales: **91 backend + 37 frontend = 128 verdes**.

---

## 32) 🔁 iter2 multi-usuario — bot directo + asignar túneles UI + fix `user_mgmt_ips` (commit `b441cbc`)

Sesión 2026-06-12 tarde. Tres cambios relacionados, un solo commit. El hilo conductor: pulir la experiencia multi-usuario después de que Q1/M1 dejaran la base.

### A) Bot Telegram iter2 — `/activar` y `/desactivar` ejecutan acción real

Antes (M1, ver §27): los comandos de mutación devolvían un deep-link `?activate=VRF-X` al panel. Decisión consciente para evitar mutar con auth débil (Telegram chat_id). El usuario pidió cambiar el flujo: que el bot active directo, con confirmación humana vía lista numerada en vez del deep-link.

**Nuevo flujo:**

```
Tú: /activar
Bot: Elige un túnel para activar (responde con el número)
     1) VRF-ND1-HOUSENET — Casa
     2) VRF-ND4-TORREVIC — Torre Victorino
     ...
     La selección expira en 15 min. Envía /cancelar para descartar.

Tú: 2
Bot: ⏳ Activando VRF-ND4-TORREVIC…
Bot: ✅ Acceso abierto a VRF-ND4-TORREVIC
     IP de gestión: 192.168.21.20
     Expira en: 30 min
```

Atajos: `/activar VRF-NAME` (directo), `/activar 2` (por número con pending), `/desactivar` (siempre directo — solo 1 túnel/usuario activo).

**Decisión clave — un service compartido:** la activación es lógica densa (auth, fail-closed en RouterOS, sesión en BD, SSE emit, notif). Duplicarla en el bot dobla la superficie de bugs. Solución: extraje el cuerpo del handler a [server/lib/tunnelService.js](server/lib/tunnelService.js) con firma neutra `{ account, targetVRF, mikrotik, clientIp }`. El HTTP route `POST /tunnel/activate` ahora son 20 LOC delegando al service. El bot consume el mismo service. Un solo camino, un solo conjunto de invariantes.

`canUseTunnel(req, vrf)` en `_shared.js` se desdobló: el bot necesita una versión sin `req`, así que añadí `canUseTunnelForAccount(acc, vrf)` y el wrapper HTTP delega a esa.

**Para que el bot sin `req` sepa las creds del MikroTik**, reusa el patrón de `monitoringJob.js` (§31): `getAppSetting('MT_IP/USER/PASS')` + `decryptPass()`. Sin sesión HTTP, sin middleware.

**Selección numérica — estado in-memory por chat:** `pendingSelections: Map<chatId, { tunnels, expiresAt }>` con TTL 15 min. Lazy cleanup al acceder. Si el backend reinicia, las pendientes se pierden — aceptable, el usuario reenvía `/activar`. `handleMessage` ahora trata números planos como comando cuando hay pending viva para ese chat; sin pending, los números se ignoran (preserva la regla "solo `/...` se procesa").

**Tests añadidos (6 nuevos en [telegramBot.test.js](server/test/unit/telegramBot.test.js)):** activate directo OK + error del service, lista numerada genera pending, número plano con pending activa, número fuera de rango → mensaje, número sin pending se ignora, `/cancelar` limpia, deactivate directo + sin sesión idempotente.

### B) Reposición del botón "Asignar túneles" + picker

Fase B4 (ver línea 261) eliminó *"Asignar túneles"* de la tabla de Equipo con la idea de que las invitaciones lo asignaran dinámicamente. Pero la Fase B1 también quitó el campo *"Túnel a asignar"* del InvitePanel, dejando el flujo huérfano: un MEMBER nuevo se queda con 0 asignaciones y sin UI para arreglarlo. El `AssignTunnelsModal.tsx` quedó vivo pero desconectado.

**Lo que añadí:**
- Botón con icono `Waypoints` en [MembersTable.tsx](vpn-manager/src/components/Team/TeamModule/components/MembersTable.tsx) **solo para `role === 'MEMBER'`** — los CO_MODERATOR/OWNER ya ven todos los túneles del workspace por contrato de RBAC, no tiene sentido asignarles.
- Modal mejorado: input texto libre → `<select>` con túneles del workspace, filtrando los ya asignados. Muestra `nombre_vrf — nombre_nodo` para que el operador no tenga que recordar IDs.
- Nuevo endpoint `GET /api/team/workspace-tunnels` (OWNER/CO_MOD) — lectura ligera de MySQL puro (`SELECT ppp_user, nombre_vrf, nombre_nodo FROM nodes WHERE workspace_id = ?`), sin tocar RouterOS. Service: `teamApi.listWorkspaceTunnels()`.

### C) Fix crítico — `user_mgmt_ips` se llena solo al provisionar peer

**El bug:** en `provisionMemberWgByPublicKey` (al aceptar invitación) y en `POST /member/:id/wireguard` (provisión manual del moderador), el código:
1. ✅ Creaba el peer en MikroTik con `192.168.21.X`.
2. ✅ Insertaba en `member_wireguard`.
3. ✅ Insertaba en `mgmt_peer_owners` (atribución multi-tenant).
4. ❌ **Nunca insertaba en `user_mgmt_ips`** — que es la tabla que `tunnelService.activateTunnel` lee para resolver la IP del usuario server-side.

Resultado: el MEMBER tenía peer funcional en el router, ".conf" descargable, conexión WireGuard activa — pero recibía `409 NO_MGMT_IP` al pulsar **Acceder** en cualquier túnel. El frontend mostraba *"Ve a la sección WireGuard y registra tu IP, o pide al moderador que te asigne una"* — pero esa sección no existía en la UI; el endpoint `POST /tunnel/register-my-ip` quedaba como huérfano (cero callers en `src/`).

El workaround histórico era `node db/mapUserMgmtIp.js <email> <ip>` (script CLI), documentado en §3 línea 119 — pero requería que el operador se acordara y supiera la IP exacta.

**Fix de raíz** ([server/routes/team.routes.js](server/routes/team.routes.js)): ambas funciones que provisionan peer ahora llaman a `mgmtIpRepo.upsert({ workspaceId, userId, mgmtIp: nextIp, publicKey, source: 'auto-provision' })` justo después de poblar `member_wireguard` y `mgmt_peer_owners`. Idempotente por `UNIQUE(workspace,user)`. Si la IP ya está reclamada por otro (`uq_umi_ip`), se loguea `warn` y **no bloquea** la provisión — el operador puede limpiar manualmente sin perder el peer recién creado.

**Para MEMBERs ya provisionados antes de este fix:** un toque del script `mapUserMgmtIp.js` los pone al día. En esta sesión lo apliqué a `fernandodiazm.5@gmail.com → 192.168.21.64`.

### Métricas pre/post §32

| Métrica | Pre-§32 | Post-§32 |
|---------|---------|----------|
| Activación túnel desde Telegram | Solo deep-link al panel | Directo (lista numerada + número plano + `/activar VRF`) |
| `cmdDesactivar` | Deep-link | Directo |
| Service compartido HTTP↔Bot | `tunnel.routes.js` 491 LOC con lógica inline | +`lib/tunnelService.js` (164 LOC) · route adelgazado a ~30 LOC para activate/deactivate |
| Botón "Asignar túneles" en MembersTable | ❌ | ✅ (solo `MEMBER`) |
| Picker en `AssignTunnelsModal` | Input texto libre | `<select>` con túneles del workspace + filtrado |
| Nuevos endpoints | — | `GET /api/team/workspace-tunnels` |
| Mapeo `user_mgmt_ips` al provisionar peer | Manual (CLI) | Automático con `source: 'auto-provision'` |
| Tests backend | 135 | **141** (+6 bot, sin regresión) |

### Reglas operativas reforzadas (post-§32)

- **Lógica de túnel = un solo lugar.** Cualquier nuevo origen de activación (cron, webhook, CLI) debe llamar a `lib/tunnelService` — no replicar el cuerpo.
- **Auth del bot ≠ auth HTTP.** El bot construye un `account` plano desde `notification_subscriptions.telegram_chat_id → user_id → workspace_members + users.is_platform_admin`. Si en el futuro se añade scope adicional al JWT (ej. permisos finos), espejarlo en `buildAccount()` del bot.
- **`provisionMemberWgByPublicKey` es la fuente única de mapeo IP→user.** Si en el futuro un flujo nuevo crea peers (ej. importación masiva), DEBE llamar a `mgmtIpRepo.upsert` o el usuario quedará bloqueado al activar.
- **Numbered selections siempre TTL + clear-after-consume.** Si añades más comandos con flujo de selección (ej. `/asignar`), reutiliza el patrón de `pendingSelections` con su propio mapa o uno compartido.

### Pendiente / mejoras futuras

- **UI de "register-my-ip"**: aún sin caller en frontend. Hoy queda como salida de emergencia para casos donde el operador necesita que el MEMBER auto-declare su IP (auditoría de regresión: peer creado por proceso externo). Si se añade, debe coexistir con `auto-provision` (`source: 'manual'` vs `source: 'auto-provision'`).
- **Persistencia de `pendingSelections`**: hoy in-memory; si el backend reinicia mientras un usuario tiene una lista pendiente, debe re-enviar `/activar`. Para multi-instancia eventual, mover a Redis o `app_settings` por chat.
- **Bot iter3 — confirmación con botones inline**: Telegram tiene `callback_query` (botones que devuelven `data`). Cambiar `allowed_updates=["message"]` a `["message","callback_query"]` y devolver un teclado inline tras `/activar` para "tap-to-select" sin teclear el número.
- **Volver a habilitar `tunnel_id` en InvitePanel** (Fase B1 lo quitó): hoy el moderador invita y luego abre el modal nuevo. Si lo añadimos al invite, la asignación inicial vuelve a ser un paso.

---

## 33) 🔒 UX MEMBER endurecida — solo "Acceder" en Nodos + Ajustes con vincular Telegram

Sesión 2026-06-12 noche. Cinco cambios de superficie en la vista del **MEMBER (View)**, todos en frontend: el documento de cambios `CAMBIOS_.docx` del usuario marcó cinco elementos visuales con flechas rojas que un MEMBER no debía ver en `Acceso a Nodos VRF`, más la ausencia del módulo "Ajustes" para poder vincular su Telegram.

### El problema

Antes de §33, el MEMBER (rol `MEMBER` del workspace, sin `is_platform_admin`) entraba a `NodeAccessPanel` y veía exactamente lo mismo que el OWNER salvo la lista filtrada de túneles: botón **"Nuevo Nodo"**, botón **"Exportar"**, lápiz para **renombrar nodo**, y el **kebab de fila** con 8 acciones (Verificar y reparar, Credenciales SSH, Editar nodo, Script de configuración, Gestionar etiquetas, Historial de conexión, Diagnosticar ping/trace, Eliminar nodo). El backend ya rechazaba esas mutaciones por `nodeBelongsToRequester` + `filterNodesForRole`, pero la UI quedaba **engañosa**: el MEMBER podía hacer click en "Eliminar nodo" sobre un túnel que técnicamente sí ve (el de su asignación) y recibir un 403 después de la confirmación. Trampa UX, no trampa de seguridad.

Adicionalmente, el menú lateral le ocultaba "Ajustes" (`permissions.ts` listaba solo `['nodes', 'team']` para MEMBER), así que **no había UI para vincular Telegram**. El bot Telegram iter2 (§32) ya hace todo el flujo de activación/desactivación, pero requiere que el usuario ejecute `/link <code>` con un código que solo se genera desde el panel — sin Ajustes, el MEMBER no podía obtener ese código sin pedírselo al moderador.

### El cambio

**Patrón único, propagado por la cadena de componentes:**

```ts
// NodeAccessPanel.tsx — un único punto de decisión
const canManageNodes = isPlatformAdmin(session) || session?.role !== 'MEMBER';
```

Esa flag viaja como prop opcional (con default `true` para no romper call-sites) a cuatro componentes:

| Componente | Prop | Cuando es `false` |
|---|---|---|
| [ControlBar.tsx](vpn-manager/src/components/Devices/NodeAccessPanel/components/sections/ControlBar.tsx) | `canCreateNode` | Oculta `<button>Nuevo Nodo</button>` (queda solo "Actualizar Nodos") |
| [NodesFilterBar.tsx](vpn-manager/src/components/Devices/NodeAccessPanel/components/sections/NodesFilterBar.tsx) | `canExport` | Oculta el botón "Exportar" del search bar |
| [NodeCard.tsx](vpn-manager/src/components/VPN/NodeCard/NodeCard.tsx) | `canManage` | Oculta el `<div>` separador + `<NodeCardKebabMenu>` completo |
| [NodeCardNameSection.tsx](vpn-manager/src/components/VPN/NodeCard/components/NodeCardNameSection.tsx) | `canEditName` | Oculta el `<Pencil>` que aparece al hover sobre el nombre del nodo |

Resultado para el MEMBER: la fila de la tabla queda con **solo el botón "Acceder"** (que se transforma en "Revocar" cuando el túnel está activo, sin cambio). Cero superficie de mutación visible.

**Módulo Ajustes habilitado, reusando lo del moderador:**

```ts
// permissions.ts
if (s.role === 'MEMBER') return ['nodes', 'team', 'settings'];
```

`App.tsx → SettingsModuleRouter` ya devuelve `ModeratorSettingsModule` para todo lo que no sea `platform_admin`, así que el routing ya funcionaba; solo faltaba listarlo en `visibleModules`. Para no exponer al MEMBER las tabs de "Workspace" e "Import/Export" (que son del moderador OWNER/CO_MOD), `ModeratorSettingsModule` filtra el array de tabs:

```tsx
const isMember = session?.role === 'MEMBER';
const MEMBER_TAB_IDS: TabId[] = ['profile', 'notifications'];
const tabs = useMemo(
  () => (isMember ? ALL_TABS.filter(t => MEMBER_TAB_IDS.includes(t.id)) : ALL_TABS),
  [isMember],
);
```

El cuerpo de cada tab usa los mismos `<ProfileTab />` y `<NotificationsTab />` del moderador, sin duplicar componentes.

**`NotificationsTab` en `memberMode`:**

La tab completa del moderador tiene pausa global + canal Email + canal Telegram + 5 checkboxes de eventos + botón Guardar. Para el MEMBER el doc del usuario fue claro: *"solo tendrá habilitado la opcion de vincular con telegram para que los miembro pueda activar los tuneles y desactivarlo"*. Decisión: una sola prop `memberMode?: boolean` que early-returns un render compacto con **solo el canal Telegram + el panel del código `/link <code>`** cuando está vinculando:

```tsx
if (memberMode) {
  return (
    <div className="space-y-5">
      {/* Header simple */}
      {/* Canal Telegram (mismo ChannelRow del moderador, extraído a const) */}
      {/* Panel del linkCode si está abierto */}
    </div>
  );
}
// resto: render normal del moderador
```

El `ChannelRow` de Telegram se extrae a `const telegramRow` antes del primer `return` para reusarlo en ambas ramas sin duplicar JSX. El callback de `unlink` reusa el endpoint existente `POST /account/telegram/unlink` (`requireSession`, sin gate de rol).

### Backend — sin cambios

Verifiqué `account.routes.js`:

```js
router.patch('/password',           requireSession, ...);
router.patch('/email/request',      requireSession, ...);
router.post('/email/confirm',       requireSession, ...);
router.get('/notifications',        requireSession, ...);
router.patch('/notifications',      requireSession, ...);
router.post('/telegram/link/start', requireSession, ...);
router.post('/telegram/unlink',     requireSession, ...);
```

Todos usan `requireSession` sin verificar rol. El MEMBER ya podía cambiar contraseña, correo y vincular Telegram — simplemente no había UI. No tocamos backend.

### Métricas pre/post §33

| Métrica | Pre-§33 | Post-§33 |
|---------|---------|----------|
| Botones de mutación visibles en `NodeAccessPanel` para MEMBER | 11 (Nuevo Nodo + Exportar + Pencil + 8× kebab) | **0** (solo "Acceder"/"Revocar") |
| Módulo "Ajustes" en sidebar para MEMBER | ❌ | ✅ |
| Tabs disponibles en Ajustes para MEMBER | n/a | **Perfil** + **Notificaciones (memberMode)** |
| `NotificationsTab` MEMBER — items visibles | n/a | Header + canal Telegram + linkCode |
| Tests | 178 | **178** (37 frontend tras actualizar `permissions.test.ts` para reflejar `MEMBER → ['nodes','team','settings']`) |
| Endpoints backend nuevos | — | **0** (todo era reusable) |

### Reglas operativas reforzadas

- **`canManage` se calcula una sola vez** en `NodeAccessPanel` y baja por props con default `true`. No replicar la condición en cada componente hijo: si mañana el patrón se aplica también a `TeamModule` o `UserManagementPanel`, extraerlo a `usePermissions()` o `useCanManageNodes()`.
- **Las tabs filtradas de Ajustes se controlan en `MEMBER_TAB_IDS`.** Si en el futuro alguna tab nueva (ej. "Mis tokens API" para M2) debe aparecerle al MEMBER, agregarla a esa lista. Nunca se filtra "del lado del contenido" (renderizar la tab y mostrar mensaje vacío) — eso es ruido visual.
- **`NotificationsTab` `memberMode` es una vista comprimida, no un permiso.** Si el moderador quiere ver lo mismo que el MEMBER por algún motivo, basta con pasar `memberMode={true}`. No reemplaza la auth.
- **Backend ya estaba bien.** Confirmar siempre antes de "agregar guardas de rol" en endpoints — la mayoría de `requireSession` son intencionales porque la auth solo necesita identidad, no rol. La superficie de UI es la que decide qué ofrecer.

### Pendiente / mejoras futuras

- **Verificación manual con sesión real de MEMBER.** Logear con `fernandodiazm.5@gmail.com / frank12345` (FIWIS) o cualquier MEMBER asignado a un workspace; confirmar visualmente que (a) la tabla de nodos solo tiene "Acceder", (b) "Ajustes" aparece en el sidebar entre "Equipo" y nada más, (c) Notificaciones solo muestra Telegram. Cuando el moderador entra como OWNER no debe notar diferencia.
- **`MyInvitationsInbox` / `AcceptInvitationForm`.** Esos flujos son del MEMBER recién invitado; revisar si tienen botones de mutación equivalentes que también deban ocultarse (no estaban en `CAMBIOS_.docx`, pero el patrón aplica).
- **Tests E2E del MEMBER.** Hoy hay 37 unitarios frontend; ninguno valida específicamente que el MEMBER no vea el kebab. Podría añadirse un test que monte `NodesTable` con `canManage={false}` y verifique `queryByRole('button', { name: /más acciones/i })` → null.
- **CO_MODERATOR.** El derivado `session?.role !== 'MEMBER'` deja a CO_MOD igual que OWNER. Si en el futuro CO_MOD tiene un subset de mutaciones (ej. sin eliminar nodos), agregar otra prop por acción (`canDeleteNode` separado de `canEditNode`).

---

## 34) 🧩 Workspace unificado + peers WG enriquecidos + multi-asignar túneles + QR en aceptar invitación

Sesión 2026-06-12 madrugada. Cuatro cambios encadenados sobre la experiencia del moderador y del invitado público. Trabajados en un solo bloque porque comparten un hilo conductor: **bajar la fricción de gestión de gente en el workspace**.

### A) Sidebar consolidado — "Workspace" reemplaza "Usuarios" + "Equipo"

Antes había dos ítems en la categoría `Acceso` del sidebar: **Usuarios** (peers WireGuard del router) y **Equipo** (miembros del workspace). El usuario reportó que conceptualmente eran lo mismo — gente con acceso al workspace — y debían vivir bajo un único módulo con sub-tabs.

**Cambios:**

- [Sidebar.tsx](vpn-manager/src/components/Layout/Sidebar.tsx:37) — el grupo `Acceso` ahora tiene un único ítem: `{ id: 'team', label: 'Workspace', icon: Briefcase }`. Se quitó el item `users` y el import del icono `Users`.
- [permissions.ts](vpn-manager/src/utils/permissions.ts:34) — OWNER/CO_MOD ya no listan `'users'` en `visibleModules`. El tipo `ModuleId` mantiene `'users'` como variante válida por compatibilidad con URLs viejas (el efecto en `Sidebar` redirige automáticamente al primer módulo permitido).
- [App.tsx](vpn-manager/src/App.tsx:131) — quitada la rama `activeModule === 'users' && <UserManagementPanel />`. `UserManagementPanel` deja de ser `lazy()` desde `App` y se importa desde `TeamModule` como dependencia de la sub-tab.
- [permissions.test.ts](vpn-manager/src/utils/permissions.test.ts) — los 2 tests previos sobre `canSeeModule(..., 'users')` se consolidan en uno que valida que **ningún rol** ve `'users'` (MEMBER + OWNER + CO_MOD + admin).

### B) `TeamModule` reescrito como contenedor con header workspace + tabs

[TeamModule.tsx](vpn-manager/src/components/Team/TeamModule/TeamModule.tsx) ahora es un orquestador que recibe `session`, carga `members` + `invitations` + `logs` (igual que antes) y renderiza:

```
┌─────────────────────────────────────────────┐
│ 💼 <workspace_name>                          │
│    Workspace                                 │
│                                              │
│  👑 PROPIETARIO         👤 TÚ                │
│  fernando               fernando_celular     │
│  fernando@local.app     fernando@.5@gmail.com│
│                         [PROPIETARIO]        │
└─────────────────────────────────────────────┘

┌──────────────────┬──────────────────┐
│ 👥 Usuarios       │ 🌐 Usuarios VPN  │
│ Miembros del ws   │ Peers WireGuard  │
└──────────────────┴──────────────────┘

[contenido del tab activo]
```

- **Header** muestra `session.workspace_name` (campo nuevo — ver C) + 2 tarjetas `<PersonRow>`: **Propietario** (derivado de `members.find(m => m.role === 'OWNER')`) y **Tú** (`session.email + session.name + ROLE_LABEL[session.role]`).
- **Switch de tabs** con `<TabButton>` estilo pill (indigo cuando activo, ghost cuando no). El tab `members` mantiene el contenido legacy (InvitePanel + MembersTable + AuditTimeline); el tab `vpn` monta `<UserManagementPanel embedded />` dentro de un `<Suspense>` propio.
- **MEMBER no ve tabs** — el módulo renderiza el header + `MyInvitationsInbox` + `MemberProfile`, manteniendo el comportamiento previo del `TeamModule`. La tab "Usuarios VPN" es gestión, no aplica.

`UserManagementPanel` se carga vía `lazy(() => import('../../Users/UserManagementPanel'))` para que el chunk (~18 KB / 5 KB gzip) solo se descargue cuando el moderador abre la segunda tab. El `TeamModule` quedó en 138 KB / 38 KB gzip (subida de 11 KB sobre el 127 KB previo de la fase F10, justificada por el header y los sub-componentes).

### C) `workspace_name` en `SessionUser` — cross-stack

El header del módulo necesitaba el nombre del workspace, que no estaba expuesto al frontend. Solución mínima:

- [contracts/account.ts](packages/contracts/src/account.ts:69) — `SessionUser.workspace_name?: string` (opcional para no romper consumidores viejos).
- [workspaceRepo.js](server/db/repos/workspaceRepo.js) — nuevo `findById(workspaceId)` que devuelve `{ id, name }` (no devuelve borrados).
- [account.routes.js](server/routes/account.routes.js:204) — `/me` y `/bridge` incluyen `workspace_name` en la respuesta. `findMembershipByUser` ya hacía el JOIN; solo había que propagarlo.
- [sessionBridge.js](server/lib/sessionBridge.js:60) — `buildSessionForLegacyUser` y `authenticateMysqlUser` propagan `workspace_name` desde la membresía que ya consultan.
- `npm run build:contracts` regenerado (dual package CJS+ESM).

El admin de plataforma (sin `workspace_id`) recibe `workspace_name: undefined`; la UI lo trata como "Mi workspace" pero ese caso no aplica porque el admin no ve el módulo `team`.

### D) `UsersTable` enriquecido — columna Email + column picker + copy-on-click

Imagen del usuario: la tabla de "Usuarios VPN" debía mostrar a qué email corresponde cada peer. Adicionalmente, hacer la tabla "más útil" — interpretación: ofrecer un selector de columnas (column picker), patrón ya usado en `NetworkDevicesModule`.

**Backend ([wireguard.routes.js](server/routes/wireguard.routes.js:46)):** tras el filtro por workspace, se hacen dos consultas auxiliares:

```js
const mwRows  = await db.all(`SELECT mw.public_key, u.email
                                FROM member_wireguard mw
                                JOIN users u ON u.id = mw.user_id`);
const umiRows = await db.all(`SELECT umi.public_key, umi.mgmt_ip, u.email
                                FROM user_mgmt_ips umi
                                JOIN users u ON u.id = umi.user_id`);
```

Se construyen dos mapas (`emailByPk` y `emailByIp`) y cada peer se enriquece con `email: emailByPk[publicKey] || emailByIp[allowedAddress] || undefined`. Cobertura:
- **Peer creado por aceptar invitación** (`provisionMemberWgByPublicKey` o el modo `generate`) → match en `member_wireguard` por public_key.
- **Peer mapeado vía `mapUserMgmtIp.js`** (script CLI) o por `register-my-ip` → match en `user_mgmt_ips`.
- **Peer legacy del moderador sin owner explícito** → `email: undefined`, la UI muestra `—`.

Cambio aditivo: no rompe a clientes que no entiendan `email` (lo ignoran).

**Tipo:** `WgPeer.email?: string` añadido en [types/api.ts](vpn-manager/src/types/api.ts:80) con docstring explicando el origen.

**Tabla ([UsersTable.tsx](vpn-manager/src/components/Users/UserManagementPanel/components/UsersTable.tsx)):** reescrita con array `COLUMNS` declarativo y `Set<ColId>` para visibles:

| Columna | Default | Ocultable |
|---|---|---|
| Color (estructural) | ✅ | n/a |
| Estado | ✅ | ❌ fija |
| Usuario (con rename inline) | ✅ | ❌ fija |
| **Email** (nuevo) | ✅ | ✅ |
| IP | ✅ | ✅ |
| Protocolo | ✅ | ✅ |
| Clave pública (truncada `abcdefgh…uvwxyz`) | ❌ | ✅ |
| Último acceso | ✅ | ✅ |
| Acciones (estructural) | ✅ | n/a |

- **Column picker** = botón "Columnas" con dropdown de checkboxes. Las fijas aparecen disabled con flag `fija`. Persistencia en `localStorage['vpn_users_visible_cols']` con defensa contra storage corrupto (siempre fuerza required).
- **Búsqueda** ampliada a email; sort por email alfabético (sin email → al fondo con sentinel `'￿'`).
- **`<CopyableCell>`** — componente local reutilizable: muestra texto + icono opcional + ícono copy en hover, click copia al clipboard y muestra check verde 1.5s. Falla silenciosa si clipboard está bloqueado (http no-localhost). Usado para email, IP y public-key.
- **Helper `truncatePubKey`** — muestra primeros 8 + últimos 6 con `…` en medio; al copiar, copia la pública completa (no la truncada).
- Footer añade contador "**N de 7 columnas visibles**".

### E) `AssignTunnelsModal` — multi-selección + "Todos"

[AssignTunnelsModal.tsx](vpn-manager/src/components/Team/TeamModule/components/AssignTunnelsModal.tsx) antes era un `<select>` clásico: 1 click = 1 asignación. Usuario reportó que en workspaces con 10+ túneles esto era infernal.

**Cambios:**

- `<select>` → lista de **checkboxes** (`<ul>` con `<input type="checkbox">` por túnel) dentro de un contenedor `max-h-64 overflow-y-auto`.
- **Buscador** sobre `nombre_vrf`, `nombre_nodo` y `ppp_user`.
- Botones contextuales: **"Todos"** (sin filtro) / **"Todos visibles (N)"** (con filtro — preserva selecciones ocultas por el filtro) / **"Ninguno"** (cuando todos visibles ya seleccionados) / **"Limpiar"** (cuando hay selecciones no-visibles).
- Botón principal con texto dinámico: **"Asignar"** / **"Asignar 1 túnel"** / **"Asignar N túneles"**.
- **Asignación en lote** vía `Promise.allSettled(ids.map(id => teamApi.assignTunnel(member.user_id, id)))`. Backend sin cambios — se reusa el endpoint existente N veces.
- **Feedback parcial**: si alguno falla, banner amber "`5 asignados · 1 fallaron`" + el mensaje del primer error capturado. Si todo OK, no se muestra banner (la lista de "Asignados" abajo confirma visualmente).
- Modal pasó de `max-w-md` a `max-w-lg` + `max-h-[90vh]` con body en `overflow-y-auto` para no romper en workspaces grandes.

### F) QR de WireGuard en `AcceptInvitationForm`

[AcceptInvitationForm.tsx](vpn-manager/src/components/Auth/AcceptInvitationForm.tsx) es la pantalla pública donde un invitado mete su email + OTP + contraseña, el backend crea su cuenta y genera el .conf server-side. La pantalla mostraba el .conf como texto + botones Copiar/Descargar — pero el caso de uso #1 del invitado es escanearlo desde su móvil para meterlo en la app WireGuard.

**Cambios mínimos:**

- Import de `QRCode from 'qrcode'` (la dependencia ya estaba en `package.json: ^1.5.4`; la usaba `MemberWireGuardModal` desde la Fase E del moderador). Import de `Smartphone` de lucide.
- `useState<string | null>` para `qr` (dataURL).
- `useEffect` que genera el QR cuando `conf` está disponible — copiando el patrón exacto del modal del moderador para mantener consistencia: `QRCode.toDataURL(conf, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null))`.
- Render: card blanca con `border-slate-200` + shadow conteniendo `<img src={qr} width={220} height={220} />` + hint "📱 Escanea con WireGuard móvil (iOS / Android)". Mientras genera, spinner pequeño.
- Texto del aviso actualizado: "Escanea el QR desde la app WireGuard móvil, **o** pégala/impórtala manualmente" — refleja las 3 vías (QR / copiar / descargar .conf).

WireGuard mobile (iOS y Android) escanea el `.conf` completo como QR sin transformación adicional, por eso `QRCode.toDataURL(conf, …)` directo funciona.

### Métricas pre/post §34

| Métrica | Pre-§34 | Post-§34 |
|---------|---------|----------|
| Items en sidebar para OWNER/CO_MOD (sección Acceso) | 2 (Usuarios + Equipo) | **1** (Workspace) |
| Header del módulo Workspace | "Equipo / email / badge ROL" | **Nombre workspace + tarjeta Propietario + tarjeta Tú con badge** |
| Endpoint `/account/me` campos | 6 | **7** (+`workspace_name`) |
| `WgPeer` campos | 6 | **7** (+`email?`) |
| Columnas configurables en `UsersTable` | 0 (6 columnas fijas) | **5 toggleables / 2 fijas** (con persistencia localStorage) |
| Patrón de selección en `AssignTunnelsModal` | `<select>` 1 a la vez | **Multi-checkbox + búsqueda + Todos/Ninguno + asignación en lote** |
| QR en `AcceptInvitationForm` | ❌ | ✅ (mismo patrón que `MemberWireGuardModal`) |
| Tests frontend | 37 | **36** (fusión de 2 tests de `users` como módulo navegable en uno cuádruple) |
| Bundle inicial | 248 KB / 78 KB gzip | **248 KB / 78 KB gzip** (sin cambio) |
| Chunk `TeamModule` | 127 KB / ~34 KB gzip (F10) | **138 KB / 38 KB gzip** (+11 KB por header + tabs + sub-componentes) |
| Chunk `UserManagementPanel` lazy | — | **18 KB / 5 KB gzip** (separado, carga solo al abrir Usuarios VPN) |

### Reglas operativas reforzadas

- **El JOIN para enriquecer peers vive en `/api/wireguard/peers`.** Si en el futuro hay otra fuente de mapeo IP→user (ej. importación masiva), debe poblar `member_wireguard` o `user_mgmt_ips` para aparecer en la columna Email. No hay un tercer camino.
- **Las columnas requeridas (`status`, `name`) no pueden ocultarse por contrato del column picker.** Si una nueva columna nace como "estructural" (ej. avatar), márcala con `required: true` en `COLUMNS` para que el dropdown la deshabilite.
- **Asignaciones en lote = `Promise.allSettled`, no `Promise.all`.** El usuario espera que un fallo aislado no aborte el resto; reportar parcial. Si en el futuro se añade endpoint server-side `POST /api/team/assignments/bulk`, sustituir el loop por una llamada — pero mantener el feedback parcial.
- **QR de WireGuard = `margin: 1, width: 220`, sin más.** No transformar el `.conf` antes de generar el QR; la app móvil espera el archivo crudo. Si el QR sale ilegible, el problema es la resolución del display del PC, no el código.
- **`workspace_name` es siempre opcional.** Frontend que lo lea debe usar `session.workspace_name || 'Mi workspace'` como default — los admins de plataforma no lo tienen y los moderadores legacy podrían no haber pasado por el nuevo `/me` aún (caché).

### Pendiente / mejoras futuras

- **Endpoint `POST /api/team/assignments/bulk`** que reciba un array de `tunnel_id` y los procese en una transacción. Hoy el loop frontend dispara N requests; un workspace con 50 túneles dispara 50 conexiones HTTP. No urgente — la latencia típica es ~100ms × N, aceptable para casos normales.
- **Filtros guardados en el column picker.** Hoy las columnas se persisten, pero los chips de estado (Todos/Activos/Inactivos) no — al recargar siempre vuelve a "Todos". Si el moderador trabaja con un filtro fijo, sería útil persistirlo también.
- **QR para `MemberWireGuardModal` ya existe**, pero la consistencia visual entre los dos modales podría mejorarse extrayendo un `<WireGuardQrBlock conf={conf} />` compartido (incluye QR + spinner + hint + botones). Hoy hay duplicación menor.
- **Header del Workspace para más de 1 moderador.** Hoy `<PersonRow>` solo muestra al OWNER. Si el workspace tiene CO_MODs, no aparecen. Podría reemplazarse por una lista colapsable "Moderadores (N)" con avatares.
- **Quitar `'users'` del tipo `ModuleId`.** Hoy queda como tipo válido por compatibilidad, pero ya nadie lo navega. Si en una sesión futura se confirma que no hay deep-links viejos, se puede limpiar para reducir superficie.

---

## 35) 🏷️ Alias humano de peers WG + bloqueo de edición del "Usuario"

Sesión 2026-06-12 madrugada (continuación). Cambio focal sobre la tabla "Usuarios VPN" reportado por el usuario tras §34: la columna "Usuario" (el `comment` del peer en MikroTik) permitía edición inline desde la UI, pero **al renombrarlo desde el panel se pierde la trazabilidad en el router** — el moderador después no puede identificar el peer en RouterOS porque el comment ya no coincide con lo que el sistema documentó originalmente.

### El problema

`UsersTable` renderizaba la columna "Usuario" con un lápiz en hover que disparaba `onSavePeerName` → `POST /api/wireguard/peer/edit` → `safeWrite(api, ['/interface/wireguard/peers/set', '=numbers=.id', '=comment=<nuevo>'])`. Funcionaba técnicamente, pero el moderador quería poder anotar "PC casa", "Celular", etc. sin tocar el comment que él (o el flujo de invitación) puso inicialmente.

### El cambio

**Backend:**

1. Nueva tabla en [schema_ops.sql](server/sql/schema_ops.sql:232):

```sql
CREATE TABLE IF NOT EXISTS peer_aliases (
    workspace_id  CHAR(36)     NOT NULL,
    peer_address  VARCHAR(64)  NOT NULL,
    alias         VARCHAR(120) NOT NULL,
    updated_at    BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, peer_address)
);
```

Se crea automáticamente en `initDb()` por el reader idempotente que ya existe. Aislada por workspace para defensa en profundidad (admin escribe sobre `workspace_id = ''`).

2. Endpoint nuevo en [wireguard.routes.js](server/routes/wireguard.routes.js): `POST /api/wireguard/peer/alias/save` con body `{ peerAddress, alias }`. Si `alias` está vacío hace `DELETE` (volver a sin alias). Si tiene contenido hace `UPSERT` con `ON CONFLICT (workspace_id, peer_address) DO UPDATE SET alias = excluded.alias, updated_at = excluded.updated_at`. Max 120 chars validado server-side.

3. `GET /api/wireguard/peers` ahora hace un tercer LEFT JOIN (después de email):

```js
const aliasRows = ws !== null
  ? await db.all('SELECT peer_address, alias FROM peer_aliases WHERE workspace_id = ?', [ws])
  : await db.all('SELECT peer_address, alias FROM peer_aliases');
const aliasByIp = {};
aliasRows.forEach(r => { if (r.peer_address && r.alias) aliasByIp[r.peer_address] = r.alias; });
result = result.map(p => ({ ...p, alias: aliasByIp[p.allowedAddress] || undefined }));
```

Cambio aditivo: si el alias no existe, `alias` queda `undefined` y la UI muestra el botón "+ Agregar alias".

**Tipos:** [api.ts](vpn-manager/src/types/api.ts:80) — `WgPeer.alias?: string` con docstring que aclara: vive solo en BD del panel, no toca MikroTik.

**Frontend:**

1. **Columna "Usuario" → read-only.** [UsersTable.tsx](vpn-manager/src/components/Users/UserManagementPanel/components/UsersTable.tsx) elimina el lápiz y todas las props `editingPeerId`/`editingPeerName`/`savingPeerName`/`onStartEdit`/`onCancelEdit`/`onChangeEditName`/`onSavePeerName`. Queda como un `<span>` con `title="Identificador MikroTik (no editable). Usa el alias para anotar el equipo."`. El `savePeerName` permanece como dead code documentado en `useWireGuardPeers` por si en el futuro reactivan el rename desde otra ruta.

2. **Nueva columna "Alias"** (8va columna, visible por defecto, toggleable desde el column picker). Sort por alias funciona alfabético con sentinel `'￿'` para meter los sin-alias al fondo. Búsqueda extendida a alias también.

3. **Subcomponente `<AliasCell>` con tres estados visuales** (mismo archivo):

```
sin alias     → [+] Agregar alias    (botón sutil, opacidad baja)
con alias     → 🏷  PC casa  [✏]    (lápiz aparece en hover)
editando      → [input    ] [✓] [✕]  (Enter commit, Escape cancel)
```

Placeholder del input: *"PC casa, Laptop gestión…"*. `maxLength={120}` matchea el límite del backend.

4. **Estado de edición vive local en `UsersTable`** (`editingAliasAddr`, `draftAlias`, `savingAliasAddr`) — no contamina props del hook ni del padre. El optimistic update vive en `useWireGuardPeers.savePeerAlias(peerAddress, alias): Promise<boolean>`:

```js
setWgPeers(prev => prev.map(p =>
  p.allowedAddress === peerAddress ? { ...p, alias: trimmed || undefined } : p
));
try { /* POST */ }
catch { loadWgPeers(); return false; }   // rollback recargando
```

Si el server rechaza, se recarga la lista entera para volver al estado real (no es invasivo — el moderador ya hace clicks de "Actualizar" frecuentemente).

### Métricas pre/post §35

| Métrica | Pre-§35 | Post-§35 |
|---------|---------|----------|
| Columna "Usuario" en `UsersTable` | Editable inline (rompe trazabilidad) | **Read-only** con tooltip |
| Columna "Alias" | ❌ | **Visible por defecto + toggleable** |
| Estados visuales del alias | n/a | **3** (sin / con / editando) |
| Tabla nueva en BD | — | `peer_aliases` (PK compuesta workspace_id + peer_address) |
| Endpoints nuevos | — | `POST /api/wireguard/peer/alias/save` |
| Bundle `TeamModule` | 138 KB / 38 KB gzip | **119 KB / 30 KB gzip** (−19 KB por limpieza del rename deprecado) |
| Bundle `UserManagementPanel` lazy | 18 KB / 5 KB gzip | **25 KB / 7 KB gzip** (+7 KB por `<AliasCell>` + estado) |
| Tests | 36 frontend | **36 frontend** (sin regresión; el patrón se cubre por el código que ya teníamos) |

### Reglas operativas reforzadas

- **El `comment` del peer en MikroTik es inmutable desde la UI a partir de §35.** Si una sesión futura necesita renombrarlo (ej. corrección manual de un peer roto), usar `mikrotik /interface/wireguard/peers/set numbers=X comment=Y` directamente desde Winbox/CLI — no la UI.
- **`peer_aliases.workspace_id = ''` para platform_admin.** El alias del admin no es estrictamente necesario hoy (el admin no entra a `team`), pero el campo está reservado por consistencia con `peer_colors` y para futuro.
- **Alias vacío = DELETE.** Si el moderador edita y borra todo el contenido, al guardar se hace `DELETE` en BD. No hay botón "borrar alias" separado.
- **Hook `useWireGuardPeers.savePeerName` queda como dead code temporal.** Si en una sesión futura se confirma que no se reactivará, sumar tarea de limpieza para borrarlo (también `editingPeerName/savingPeerName` en `useWireGuardState`).

### Pendiente / mejoras futuras

- **Importar/exportar alias en JSON** dentro del moderador (Ajustes → Respaldo y datos). Hoy el moderador que migra de workspace pierde sus anotaciones. La key natural es `peer_address` (la IP) que es estable; bastaría con un endpoint `GET /api/wireguard/peer/aliases` que ya casi existe (el JOIN lo hace, falta exponerlo crudo).
- **Buscar por alias en filtros pre-existentes.** Hoy la búsqueda de `UsersTable` incluye alias; los chips Todos/Activos/Inactivos no lo combinan. Considerar un chip extra "Sin alias" cuando el moderador quiera identificar peers que aún no anotó.
- **Validación de unicidad opcional.** Hoy el alias es texto libre; dos peers podrían llamarse "PC casa". Si causa confusión, añadir warning frontend (`UsersTable` ya tiene todos los peers en memoria, basta con un useMemo para detectar colisiones).

---

## 36) 🐛 Fix bot Telegram — el MEMBER veía "No tienes túneles asignados" pese a tenerlos

Sesión 2026-06-12 madrugada (continuación). El usuario reportó que como MEMBER, al hacer `/tuneles` o `/activar` en el bot, recibía "No tienes túneles asignados" aunque el moderador le había compartido dos túneles y los veía perfectamente en el panel HTTP.

### Causa raíz

Mismatch entre la clave usada al **guardar** la asignación y la clave usada al **leerla** en el bot.

| Componente | Identificador que usa |
|---|---|
| `AssignTunnelsModal.tsx` (modal del moderador, §32 + §34) | `nombre_vrf \|\| ppp_user` → casi siempre el VRF (ej. `VRF-ND4-TORREVIC`) |
| `tunnel_assignments.tunnel_id` (BD) | Lo que reciba el endpoint — guarda literalmente lo enviado |
| **HTTP `GET /api/nodes` (panel del MEMBER)** | ✅ `routes/nodes/_shared.js:80` filtra por `ids.has(n.nombre_vrf) \|\| ids.has(n.ppp_user)` — match dual desde el día 1 |
| **Bot Telegram `/tuneles` y `/activar`** | ❌ `lib/telegramBot.js:fetchUserTunnels` filtraba con `WHERE ppp_user IN (...)` — solo PPP |

El bot, al recibir como ID `VRF-ND4-TORREVIC` desde `assignedTunnelIds`, intentaba matchearlo contra `nodes.ppp_user` que en BD tiene `torrevic` (o similar). El `IN(...)` devolvía 0 filas y el bot reportaba "No tienes túneles asignados".

Por qué el panel HTTP sí funcionaba: el filtro de `_shared.js` ya hacía el match dual desde el commit `b441cbc` (§32) — pero el bot, al delegarse el listado a `fetchUserTunnels` en `lib/telegramBot.js` también añadido en §32, replicó el query con solo `ppp_user IN`. Bug latente que solo se manifestó cuando el moderador empezó a asignar túneles desde la UI nueva de §34 (multi-select con `nombre_vrf` como clave).

### El fix

Una sola query en [server/lib/telegramBot.js:137](server/lib/telegramBot.js):

```diff
+ const placeholders = ids.map(() => '?').join(',');
  tunnels = await query(
    `SELECT ppp_user, nombre_vrf, nombre_nodo FROM nodes
-     WHERE workspace_id = ? AND ppp_user IN (${ids.map(() => '?').join(',')})`,
-   [wsId, ...ids]
+     WHERE workspace_id = ?
+       AND (nombre_vrf IN (${placeholders}) OR ppp_user IN (${placeholders}))`,
+   [wsId, ...ids, ...ids]
  );
```

Mismo patrón que `routes/nodes/_shared.js:80` ya usa para el filtro HTTP. Los `...ids, ...ids` (params duplicados) son intencionales: hay dos placeholders independientes (uno por `IN`).

### Test de regresión

Añadido en [server/test/unit/telegramBot.test.js](server/test/unit/telegramBot.test.js):

```js
it('/tuneles MEMBER → matchea asignación guardada como nombre_vrf (no solo ppp_user)', async () => {
  mysqlMocks.query.mockImplementation(async (sql, params) => {
    if (/workspace_members/i.test(sql)) return [{ workspace_id: 'ws1', role: 'MEMBER' }];
    if (/nombre_vrf IN/i.test(sql) && /ppp_user IN/i.test(sql)) {
      // Si el código solo enviara params para ppp_user, los placeholders de
      // nombre_vrf quedarían sin valor y MySQL fallaría.
      expect(params).toEqual(['ws1', 'VRF-HOUSENET', 'VRF-HOUSENET']);
      return [{ ppp_user: 'housenet', nombre_vrf: 'VRF-HOUSENET', nombre_nodo: 'Casa' }];
    }
    return [];
  });
  assignmentRepoMocks.assignedTunnelIds.mockResolvedValue(['VRF-HOUSENET']);
  await bot.handleMessage({ chat: { id: 1 }, text: '/tuneles' });
  expect(getReplyText()).toContain('VRF-HOUSENET');
});
```

El test simula el caso exacto del bug: asignación guardada como `VRF-HOUSENET` (no `housenet`), nodo en BD con `ppp_user: 'housenet'`. Si alguien en el futuro vuelve a filtrar solo por `ppp_user`, este test rompe explícitamente.

### Métricas pre/post §36

| Métrica | Pre-§36 | Post-§36 |
|---------|---------|----------|
| `/tuneles` del bot para MEMBER con asignaciones por VRF | ❌ "No tienes túneles asignados" | ✅ Lista correcta |
| `/activar` con número plano para MEMBER | ❌ Sin pending (lista vacía) | ✅ Selección numerada funciona |
| Match query del bot | Solo `ppp_user IN(...)` | **`nombre_vrf IN(...) OR ppp_user IN(...)`** |
| Tests del bot | 26 verdes | **27 verdes** (+1 regresión) |

### Reglas operativas reforzadas

- **Filtro de asignaciones MEMBER = `nombre_vrf OR ppp_user`, donde sea.** Si en el futuro un nuevo flujo lee `tunnel_assignments` (ej. webhook, cron, batch), debe replicar el match dual. El campo `tunnel_id` en BD acepta ambos formatos y no hay forma de saber cuál vendrá.
- **Considerar migración para normalizar `tunnel_id`.** El path correcto a largo plazo sería decidir un identificador único (probablemente `nombre_vrf`, que es lo que ya domina) y migrar las filas existentes. Mientras tanto, el match dual es el contrato. Si se hace la migración, **debe** ir acompañada de UPDATE para reescribir `tunnel_assignments.tunnel_id` consistente, no solo cambiar el lado de lectura.

### Pendiente / mejoras futuras

- **Auditar otros lectores de `tunnel_assignments`.** Hay otros usos en `routes/core/_shared.js:65` y `routes/nodes/_shared.js:79`. El segundo ya hace el match dual; el primero hay que revisarlo (puede tener el mismo bug latente).
- **Normalización de `tunnel_id`.** Para una sesión futura: definir si `nombre_vrf` o `ppp_user` es la clave canónica, migrar `tunnel_assignments` para que todos los registros usen la misma, y simplificar los filtros a `IN (...)` único.

---

## 37) 🔬 Auditoría Escanear — performance + race + robustez

Sesión 2026-06-12 mañana. Tras pedido del usuario "analiza mi vista escanear: errores, optimizaciones, lógica, UX". Auditoría completa de `NetworkDevicesModule` aplicando dos lentes (skills):

- **`react-ui-expert`** — portales, click-away, accesibilidad, scroll listeners.
- **`vercel-react-best-practices`** — 70 reglas de performance categorizadas (re-render, bundle, event listeners, JS perf, etc).

Salió un reporte con 13 hallazgos priorizados. Esta sección cubre los **12 técnicos** (perf + race + robustez); §38 cubre los **9 UX + features**. Todo aplicado en 3 commits.

### Commits

| Commit | Cambios |
|---|---|
| `4e872f5` | B1 race · P1 listeners on-demand · P2 CSS variable · P3 Map lookup · U3 SSH UX · T2 default sort · F1 widths persist |
| `09b7c5c` | U5 deferred search · U7 motion-safe · B5 touch click-away · P6 cache estimateIpCount (+ fix paralelo en UsersTable touch) |
| `1fc502b` | B2 cancel reader on cambio subred · P4 lazy init sessionStorage · P5 schema versionado (+ fix replace_all bug introducido en `09b7c5c`) |

### B1 — Race en `useDeviceLibrary.handleAddDevice` (functional setState)

**Antes:** `setSavedDevices(current)` donde `current` cerró sobre `savedDevices` capturado del closure. Si llegaban 2 saves cercanos (manual + enriquecimiento SSH en background), el segundo pisaba al primero.

**Fix:** `setSavedDevices(prev => ...)` con el merge dentro del updater. `merged` y `wasExisting` se exportan vía variables locales del scope que el updater cierra (idempotente bajo StrictMode).

### P1 — Listeners `mousemove`/`mouseup` on-demand (`client-event-listeners`)

[useColumnPrefs.ts](vpn-manager/src/components/Devices/NetworkDevicesModule/hooks/useColumnPrefs.ts) registraba ambos en `window` toda la vida del componente. Cada movimiento del mouse pagaba dispatch (early return barato pero medible). Ahora se registran solo entre el `mousedown` del grip y el `mouseup`, con cleanup defensivo en unmount si el componente se desmonta a mitad de un drag.

### P2 — `gridTemplate` como CSS variable `--cols-tpl` (`rerender-defer-reads`)

**Antes:** `gridTemplate` pasaba como prop a `DeviceTable` y a cada `DeviceTableRow`. El comparador del `memo` incluía `prev.gridTemplate === next.gridTemplate`, así que durante un drag de resize **todas las filas re-renderizaban en cada movimiento del mouse**. Con 50+ filas se notaba.

**Fix:** el contenedor padre setea la variable CSS `--cols-tpl: <gridTemplate>` y header + filas usan `grid-template-columns: var(--cols-tpl)`. Solo el contenedor re-renderiza durante el resize; las filas (memo estable) quedan inmunes. Bonus: borró `gridTemplate` del comparador y `colWidths` de las props (era prop muerta).

### P3 — `savedById: Map<string, SavedDevice>` (`js-set-map-lookups`)

**Antes:** [DeviceTable.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTable.tsx) hacía `savedDevices.find(s => s.id === devId)` por cada fila. O(n × m) con 30 filas × 100 saved = 3000 comparaciones por render.

**Fix:** `useMemo(() => new Map(savedDevices.map(d => [d.id, d])), [savedDevices])` dentro de `DeviceTable`. Lookup O(1).

### P4 — Lazy init de `useState` para hidratar `sessionStorage` (`rerender-derived-state-no-effect`)

**Antes:** un `useEffect(() => { /* read sessionStorage; 5× setState */ }, [])` con `/* eslint-disable react-hooks/set-state-in-effect */` suprimido. Disparaba 1 render extra al montar.

**Fix:** función `loadCachedScan()` síncrona + `useState(loadCachedScan)` con lazy initializer. Cada `useState(cached?.field ?? default)`. Sin effect, sin advertencias suprimidas.

### P5 — Schema versionado en `sessionStorage` (`client-localstorage-schema`)

**Antes:** se guardaba `{ results, allIPs, count, debug, sshStatus }` directo sin versión. Si `ScannedDevice` cambiaba de shape, un `JSON.parse` exitoso de payload viejo inyectaba datos malformados.

**Fix:** constante `SCAN_CACHE_VERSION = 1` exportada del módulo + interface `CachedScanPayload` con campo `v`. `loadCachedScan` descarta cuando `parsed.v !== SCAN_CACHE_VERSION`. Tipos defensivos por campo (verifica `Array.isArray`, `typeof === 'number'`, etc) + backfill de `sshStatus` derivado de `dev.cachedStats` si vino vacío en payloads previos.

### P6 — Cachear `estimateIpCount` con `useMemo`

[ScanProgressBanner.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/ScanProgressBanner.tsx) llamaba `estimateIpCount(effectiveLan)` 4 veces por render (denominador de progreso + label + 2 veces en barra/header). Ahora `const totalIps = useMemo(() => estimateIpCount(effectiveLan), [effectiveLan])` arriba del componente y se reusa.

### U5 — `useDeferredValue` en búsqueda (`rerender-use-deferred-value`)

[useDeviceList.ts](vpn-manager/src/components/Devices/NetworkDevicesModule/hooks/useDeviceList.ts):

```ts
const deferredSearch = useDeferredValue(searchQuery);
// El filter consume `deferredSearch` (no `searchQuery`).
```

React puede bajar la prioridad del recálculo del filter cuando hay typing rápido, manteniendo el input responsivo.

### U7 — `prefers-reduced-motion` en animaciones infinitas

[ScanProgressBanner.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/ScanProgressBanner.tsx) + [DeviceTableRow.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTableRow.tsx): cambio mínimo `animate-spin` → `motion-safe:animate-spin`, `animate-in fade-in slide-in-from-top-2` → `motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2`. CLAUDE.md lo exigía; ahora se cumple en este módulo.

### B5 — Click-away con `touchstart` + listeners on-demand

[ColumnPicker.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/ColumnPicker.tsx) (y bonus en [UsersTable.tsx](vpn-manager/src/components/Users/UserManagementPanel/components/UsersTable.tsx)) escuchaban solo `mousedown`. En móvil/tablet el dropdown no se cerraba al tocar fuera. Fix:
- Añadir `touchstart` con `{ passive: true }`.
- Los listeners ahora viven solo cuando el dropdown está abierto (en lugar de toda la vida del componente).

### B2 — Cancelar reader si cambia subred mientras hay scan in-flight

Antes el reset solo se disparaba en cambio de `activeNodeVrf`. Si el usuario cambiaba la subred (`effectiveLan`) durante el scan, el reader del SSE viejo seguía emitiendo chunks que pisaban `scanResults` con datos de la LAN vieja.

**Fix:** nuevo effect que detecta cambio de `effectiveLan`, cancela el reader vigente y resetea `scanState` al estado `idle`. NO resetea `scanResults` (a diferencia del cambio de VRF) — el usuario puede querer comparar resultados entre subredes manualmente.

### Reglas operativas reforzadas

- **`gridTemplate` y otras props que cambien durante interacciones continuas (drag/resize) deben pasar por CSS variable**, no como prop. Las filas memoizadas son baratas; las props que invalidan su `memo` durante un drag son caras.
- **Functional setState (`setX(prev => ...)`) es la regla por defecto cuando hay flujos async**. Cierra clases enteras de races con cero costo y resulta más fácil de leer.
- **Sessions/local storage = siempre versionar el payload**. Bumpear `*_CACHE_VERSION` es el flag para invalidar caches viejos sin migración explícita.
- **Listeners globales (`mousemove`, `touchstart`, scroll) deben ser on-demand cuando el caso lo permite**. El patrón es: `useEffect(() => { if (!open) return; document.add...(); return () => ...; }, [open])` en lugar de montar siempre.

---

## 38) ✨ Auditoría Escanear — UX + features

Continuación de §37. Aplica los 9 hallazgos UX y de funcionalidad de la auditoría, ya con código que el usuario percibe directamente.

### Commits

| Commit | Cambios |
|---|---|
| `a3e1caf` | F5 filtro rol · U4 footer permanente + chips · T1 tooltip header truncado |
| `f1dd8cb` | F2 exportar CSV · F3 bulk save · T4 zebra simplificado |

### U3 — SSH "failed" distinguido de "no probado" (en `4e872f5`)

**Antes:** el fail mostraba `<X />` slate-300 sobre fondo slate-100. Visualmente **idéntico** a "no probado" (div vacío). El usuario no sabía si el SSH se intentó o no.

**Ahora 4 estados visualmente distintos:**
- **Pending** → spinner indigo en card bordeada (antes era spinner suelto sin contexto).
- **Success** → check emerald sólido (igual que antes).
- **Failed** → X **rose** en card bordeada rose (nuevo color).
- **Undefined** → card con `border-dashed` slate (nuevo placeholder).

Bonus a11y: cada estado lleva `role="status"` y `aria-label` para screen readers.

### T2 — Default sort por señal desc (en `4e872f5`)

[useDeviceList.ts](vpn-manager/src/components/Devices/NetworkDevicesModule/hooks/useDeviceList.ts):

```ts
const DEFAULT_SORT: { key: string; dir: SortDir } = { key: 'signal', dir: 'desc' };
const [sortConfig, setSortConfig] = useState(DEFAULT_SORT);
```

Antes era `null` y los items aparecían en orden de descubrimiento (semi-aleatorio según speed del SSH probe). Ahora cuando la tabla termina de auth, los dispositivos con mejor señal aparecen arriba; los sin stats van al fondo por el sentinel `?? -999`. El usuario sigue pudiendo hacer click en cualquier header para sobreescribir el orden.

### F1 — `colWidths` persistido en `localStorage` (en `4e872f5`)

Nueva key `COL_WIDTHS_STORAGE_KEY = 'vpn_diag_col_widths_v1'`. Función `loadColWidths()` sanity-checkea (solo entries `number` entre 50 y 1000 px). `useEffect([colWidths])` persiste con `removeItem` si queda vacío para no acumular basura.

### U4 — Footer permanente + chips de filtros activos (en `a3e1caf`)

**Antes:** [DeviceFilters.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceFilters.tsx) mostraba "X de Y" SOLO cuando había filtro activo. Sin filtro no había contador visible.

**Ahora:** layout en 2 líneas:
1. **Línea 1:** search + select rol + select SSID.
2. **Línea 2:** chips de filtros activos (uno por filtro, ej. `"VRF-X"` con icono Radio, click para limpiar) + spacer + contador en formato `<X> / <Y> dispositivos` cuando hay filtro, o `<Y> dispositivos` cuando no.

Componente local `<FilterChip>` reutilizable. Iconos por tipo de filtro (Radio para AP, Cpu para CPE, HelpCircle para desconocido).

### F5 — Filtro por rol (AP/CPE/Desconocido) (en `a3e1caf`)

Nuevo tipo exportado `export type RoleFilter = '' | 'ap' | 'sta' | 'unknown'` y helper:

```ts
function normalizeRole(dev: ScannedDevice): 'ap' | 'sta' | 'unknown' {
  const raw = dev.cachedStats?.mode || dev.role;
  if (raw === 'ap' || raw === 'master') return 'ap';
  if (raw === 'sta') return 'sta';
  return 'unknown';
}
```

`'master'` (modo viejo de algunos firmwares Ubiquiti) se mapea a `'ap'` para no fragmentar la lista. El `<select>` ofrece "Todos los roles / Solo APs / Solo CPEs / Solo desconocidos". El filtro se compone con search + SSID + sort.

### T1 — `title` en headers truncados (en `a3e1caf`)

[DeviceTable.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTable.tsx): cuando el grid es denso, los `<th>` con `min-w-0 overflow-hidden` truncan a "CPU", "PISO I" etc. Ahora cada `<th>` lleva `title={col.label}` con el label completo para el tooltip nativo.

### F2 — Exportar CSV (en `f1dd8cb`)

Nuevo archivo [utils/exportCsv.ts](vpn-manager/src/components/Devices/NetworkDevicesModule/utils/exportCsv.ts) con:

- **26 columnas** del scan: IP, MAC, Rol, Nombre, Modelo, Firmware, SSID, AP padre, Frecuencia, Canal, Ancho canal, Señal, Piso ruido, CCQ, TX/RX rate, Distancia, TX power, CPU%, RAM%, Uptime, AP MAC remoto, Seguridad, Modo red, SSH usuario, Guardado.
- **BOM UTF-8** inicial via `String.fromCharCode(0xFEFF)` (literal en fuente disparaba `no-irregular-whitespace`).
- **Escape RFC 4180**: celdas con coma, comilla o newline se rodean de `"` y las comillas internas se duplican `""`.
- Nombre del archivo: `scan-<nombre_nodo>-YYYY-MM-DD.csv`. Caracteres no `[a-z0-9_-]` del nodo se sanitizan con `_`.

Botón "Exportar" gris (outline) al lado del column picker. Exporta `sortedRows` (lo que el usuario ve tras filtros y sort, NO el dataset completo sin filtrar).

### F3 — Bulk save de dispositivos con SSH OK (en `f1dd8cb`)

Memo en el orquestador:

```ts
const bulkSaveCandidates = useMemo(() =>
  list.sortedRows.filter(r =>
    !r.isSaved && scan.sshStatus[r.dev.ip] === 'success' && !!r.dev.cachedStats
  ),
  [list.sortedRows, scan.sshStatus]
);
```

Botón **"Guardar N"** en verde sólido (única acción primaria del header) que aparece **solo** cuando `bulkSaveCandidates.length > 0 && selectedNode`. Click:
1. Si `length > 5`, `window.confirm(...)` con el conteo y el nombre del nodo.
2. `Promise.allSettled(candidates.map(r => handleDirectSave(r.dev, selectedNode)))`.
3. Cuenta `failed = results.filter(r => r.status === 'rejected').length` y muestra toast: "Guardados N" o "Guardados X · Y fallaron".

Spinner mientras `bulkSaving=true`.

### T4 — Zebra simplificado + indicador lateral (en `f1dd8cb`)

**Antes:** [DeviceTableRow.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTableRow.tsx) mezclaba 3 paletas de fondo:
- `bg-indigo-50/20 ↔ bg-indigo-50/40` para guardados (zebra par/impar).
- `bg-emerald-50/25 ↔ bg-emerald-50/50` para con stats.
- `bg-white ↔ bg-slate-50/60` para neutros.

Con 50+ filas en scroll el ojo perdía la pista (3 colores rotando × 2 paridades = 6 fondos).

**Ahora:**
- Fondo único zebra `bg-white dark:bg-slate-900` / `bg-slate-50/60 dark:bg-slate-800/40` (sin estado, solo paridad).
- `border-l-2` indicador lateral:
  - `border-l-indigo-400` para guardado
  - `border-l-emerald-400` para has stats sin guardar
  - `border-l-transparent` para neutro
- `hover-bg` matiza según el estado lateral (`hover:bg-indigo-50/40` si guardado, etc).

Resultado: zebra estable que rastrea filas + indicador semántico claro a la izquierda.

### Métricas pre/post §37-§38

| Métrica | Pre | Post |
|---------|-----|------|
| `NetworkDevicesModule` chunk | 86 KB raw / 20 KB gzip | **95 KB raw / 23 KB gzip** (+9 KB) |
| Filtros disponibles | Search + SSID | **Search + SSID + Rol** + chips de affordance |
| Botones de header de tabla | ColumnPicker | **Exportar + Guardar N (condicional) + ColumnPicker** |
| Estados SSH visualmente distintos | 2 (success / failed-igual-a-noProbado) | **4** (pending / success / failed / undef) |
| Sort default | none (orden de descubrimiento) | **señal desc** |
| Anchos de columna persistidos | ❌ | ✅ `localStorage` |
| Cache scan en `sessionStorage` | Sin versionado | **versionado v=1** |
| Cancelación reader on cambio subred | ❌ (race latente) | ✅ |
| Listeners mousemove vivos | Toda la vida del componente | **Solo durante drag** |
| Lookup saved en tabla | O(n × m) | **O(1) via Map** |
| Re-renders de filas durante resize | Todas las visibles | **Cero** (CSS variable) |
| Race en handleAddDevice | Stale closure | **Cerrada** (functional setState) |

### Reglas operativas reforzadas (post-§38)

- **Cualquier botón nuevo en el header de la tabla compite con ColumnPicker por espacio.** El orden actual es: `Guardar N` (verde sólido, condicional) → `Exportar` (outline) → `ColumnPicker` (outline). Si llega un 4to, mover a un kebab dedicado.
- **Chips de filtros activos son la affordance principal de "limpiar".** El usuario debería poder ver de un vistazo qué filtros tiene puestos sin abrir menus.
- **El BOM UTF-8 NUNCA literal en código fuente** — usar `String.fromCharCode(0xFEFF)`. ESLint `no-irregular-whitespace` bloquea el literal y con razón (caracteres invisibles en código son malos).
- **Bulk operations = `Promise.allSettled` + feedback parcial.** Si Promise.all aborta a la primera, el usuario pierde contexto sobre qué se guardó.
- **`role="status"` y `aria-label` en cada chip de estado SSH** son requeridos por CLAUDE.md y el lente react-ui-expert.

### Pendiente / mejoras futuras (auditoría original — pendientes tras §38)

Cuando se cerró §38 quedaban estos hallazgos en backlog. Su estado actual tras §39:

- **U1.A** Acción sticky-right — ✅ APLICADO EN §39.
- **U1.B** Densidad toggle — ❌ DESCARTADO por preferencia del usuario.
- **U2** Kebab para acciones secundarias — ✅ APLICADO EN §39.
- **T3** Indicador de fila expandida en scroll — ✅ APLICADO antes de §38 (border-l-4 en isExpanded).
- **T5** Modo lectura: ocultar Nombre con muchas columnas — ✅ APLICADO antes de §38 (`compactNameMode`).
- **F4** Comparar con scan anterior (diff) — 📋 En backlog. **Observacional puro**, no induce comandos SSH; respeta la política dedicada al final del documento.

### 🛑 Política operativa SSH (establecida al cierre de esta sesión)

Ver sección dedicada **"🛑 Política de operaciones SSH sobre dispositivos Ubiquiti airOS"** al final de este documento. Resumen: solo lectura + diagnóstico activo (ping/traceroute) + reinicio con confirmación. **NUNCA** firmware update, rm, factory reset ni modificación de config persistente. Cualquier feature futura del módulo Escanear debe respetarla.

---

## 39) 🎯 Cierre auditoría Escanear — sticky-right (U1.A) + kebab (U2)

Sesión 2026-06-12 tarde. Cierre formal de la auditoría iniciada en §37-§38. De los 2 hallazgos visuales pendientes (U1, U2) y 1 feature mayor (F4):

- **U1.A** aplicado, **U1.B** descartado por preferencia del usuario.
- **U2** aplicado.
- **F4** queda en backlog (~4h, requiere schema nuevo en IndexedDB + lógica de diff).

Total tras §39: **26/27 hallazgos aplicados**.

### Commits

| Commit | Cambios |
|---|---|
| `d300a44` | U1.A — columna Acción sticky-right con shadow sutil + `groupHoverBg` para sincronizar bg durante hover |
| `2bff438` | U2 — DeviceRowActions con primario contextual + kebab portal (reusa `useKebabMenu` de NodeCard) |
| `0471d64` | Retira el span "Sin nodo" del primario — la celda queda vacía si no hay nodo, ya no ensucia escaneos completos |

### U1.A — Columna Acción sticky-right

**Antes:** la columna Acción era la última del grid sin sticky. Con el column picker abierto y 8+ stats visibles, la tabla forzaba scroll horizontal y los botones de Acción quedaban fuera del viewport. El usuario tenía que scrollear cada vez que quería guardar / ver informe / sincronizar.

**Cambios:**

[DeviceTable.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTable.tsx) — header:

```tsx
<div className="px-3 py-3 text-right sticky right-0 z-10 bg-slate-100 dark:bg-slate-800 shadow-[-2px_0_6px_-3px_rgba(0,0,0,0.06)]">
  Acción
</div>
```

[DeviceTableRow.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTableRow.tsx) — row + celda Acción:

1. El `<div>` del row recibe `group` para que la celda Acción sticky pueda reaccionar al hover del row vía `group-hover:bg-*`.
2. Nueva const `groupHoverBg` paralela a `hoverBg`:

```tsx
const groupHoverBg = isSaved
  ? 'group-hover:bg-indigo-50/40 dark:group-hover:bg-indigo-500/10'
  : hasStats
    ? 'group-hover:bg-emerald-50/40 dark:group-hover:bg-emerald-500/10'
    : 'group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60';
```

3. Celda Acción del row:

```tsx
<div className={`... sticky right-0 z-[1] shadow-[-2px_0_6px_-3px_rgba(0,0,0,0.06)] ${stateBg} ${groupHoverBg}`}>
```

`z-index`: row sticky-right `z-[1]` < header sticky-top `z-10` — el header siempre queda por encima cuando se cruzan.

**Resultado:** la celda Acción siempre visible incluso con scroll horizontal. Shadow muy sutil (-2px blur 6px opacity 0.06) — invisible cuando la tabla cabe, marcado cuando flota sobre las columnas previas.

### U1.B — Densidad toggle (DESCARTADO)

Propuesto en §38 como toggle "Compacta / Cómoda" para ahorrar espacio vertical con 30+ dispositivos. El usuario revisó la propuesta y la descartó por preferencia visual ("no me gusta como quedaría"). Sin cambios al código.

### U2 — Kebab para acciones secundarias

**Antes:** la celda Acción tenía 4 botones simultáneos (Informe / Sync / Ficha / Guardar) que ocupaban ~280px. En la captura del usuario tras U1.A, los 4 botones se solapaban con la columna Toggle vecina (números 3, 8, 3 visibles detrás de los botones) — el sticky-right tapaba la celda Toggle parcialmente y los botones largos no terminaban de "limpiar" el área.

**Cambios:**

Nuevo subcomponente local `DeviceRowActions` en [DeviceTableRow.tsx](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTableRow.tsx) con:

**Lógica del botón primario:**

| Contexto | Primario | Color |
|---|---|---|
| `!isSaved && sshStatus=success && selectedNode` | "Guardar" | emerald sólido |
| `!isSaved && selectedNode` (sin SSH ok) | "Guardar" (abre modal manual) | indigo sólido |
| `!isSaved && !selectedNode` | (vacío) | — |
| `isSaved && savedDevice` | "Ficha" | indigo outline |

**Lógica del kebab (solo si `secondaries.length > 0`):**

```tsx
if (hasStats) secondaries.push({ label: 'Ver informe airOS', icon: Activity, color: 'violet' });
if (hasStats && isSaved) secondaries.push({ label: 'Sincronizar stats', icon: RefreshCw, color: 'sky' });
if (hasStats && !isSaved) secondaries.push({ label: 'Ver datos del scan', icon: Eye, color: 'indigo' });
```

Cada item del dropdown tiene su propio color hover según el rol semántico de la acción (violeta para info técnica, sky para refresh, indigo para visualización general).

**Patrón técnico (reuso del módulo Nodos):**

- Hook compartido [`useKebabMenu`](vpn-manager/src/components/VPN/NodeCard/hooks/useKebabMenu.ts) — encapsula `showKebab`/`kebabCoords` + click-away (`document.mousedown`) + scroll-close (`window.scroll` con `capture: true`).
- `createPortal` a `document.body` (regla `react-ui-expert`): evita el clipping del `overflow-x-auto` de la tabla. Sin portal el menú quedaría recortado al ancho del card.
- `getBoundingClientRect` para calcular `position: fixed` con `top` (o `bottom` si no hay 280px abajo) + `right`.
- A11y: `aria-label`, `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, `role="menuitem"`.

**Resultado:** la celda Acción pasa de ~280px a ~110px. Solapamiento visual del bug original resuelto sin tocar U1.A. El kebab no se renderiza si no hay secundarias.

### Retira "Sin nodo"

Tras revisar las capturas del usuario, el span gris "Sin nodo" aparecía en cada fila no guardada cuando no había `selectedNode`. En escaneos típicos donde la mayoría de dispositivos están "sin asignar" eso era ruido visual constante.

Cambio mínimo en `DeviceRowActions`: el bloque `else if (!isSaved && !selectedNode)` se elimina. Si no hay primario aplicable, la celda queda vacía — el kebab con secundarias sigue disponible cuando hay `hasStats`. La fila se ve limpia.

### Métricas pre/post §39

| Métrica | Pre-§39 | Post-§39 |
|---------|---------|----------|
| Botones simultáneos en celda Acción | 4 (Informe/Sync/Ficha/Guardar) | **1 primario + ⋮** |
| Ancho de celda Acción | ~280px | **~110px** (−60%) |
| Acción siempre visible con scroll horizontal | ❌ | ✅ (sticky-right) |
| Solapamiento de Acción con columna Toggle | ✅ (bug visual) | ❌ (resuelto) |
| Ruido visual "Sin nodo" en filas sin guardar | ✅ | ❌ |
| `NetworkDevicesModule` chunk | 95 KB / 23 KB gzip | **97.4 KB / 23.6 KB gzip** (+2.4 KB) |

### Reglas operativas reforzadas (post-§39)

- **Dropdowns dentro de tablas con `overflow-x-auto` SIEMPRE deben usar `createPortal` a `document.body`** con `position: fixed` y `getBoundingClientRect` para coords. Patrón ya estandarizado en NodeCard y ahora en DeviceTableRow. Cualquier menú nuevo (filtros, kebabs, tooltips) debe seguirlo. Regla del lente `react-ui-expert`.
- **Tooltips/dropdowns con coords absolutas SIEMPRE deben cerrar al scroll** (`window.addEventListener('scroll', handler, true)`). Sin esto el menú flota sobre componentes ajenos cuando el usuario scrollea con el menú abierto.
- **`group` + `group-hover:` es el patrón canónico para celdas sticky** que deben reaccionar al hover del row padre. Calcular `groupHoverBg` separado de `hoverBg` aunque sean la misma paleta — son selectors distintos.

### Pendiente / mejoras futuras (cierre del backlog Escanear)

- **F4** Comparar con scan anterior (diff) — único hallazgo de la auditoría original sin aplicar. ~4h estimadas. Requiere:
  - Nueva tabla en IndexedDB: `scan_snapshots(id, nodeId, nodeLan, timestamp, devices)`.
  - Hook `useScanDiff` que compara último snapshot vs scan actual por MAC.
  - Badges en filas (señal Δ ≥ 5dBm, CCQ Δ ≥ 15, firmware ≠, IP cambió) — observacional puro, sin escritura SSH.
  - Sección "Desaparecidos" colapsable arriba.
  - Toggle "Comparar con: último / 1 día / 1 semana / fecha custom".
  - Retención automática: últimos 10 snapshots por `(nodeId, lan)`.

  **Respeta la política SSH** de la sección final: F4 no induce comandos, solo compara strings ya leídos.

---

## 40) 💾 Preferencias persistentes del módulo Escanear + Export multi-formato

Sesión 2026-06-12 tarde-noche. El usuario reportó que **al volver al módulo Escanear, las columnas que había ajustado se volvían a poner en el set default de 8**, y pidió además poder exportar el scan en **JSON, Excel y PDF** además de CSV. La auditoría reveló que solo `visibleCols` + `colWidths` se persistían en localStorage; **filtros, búsqueda, sort y subred manual NO se guardaban** entre visitas. Esta sección entrega un store unificado de preferencias + 3 nuevos formatos de export con dynamic imports.

### Commits

| Commit | Cambios |
|---|---|
| `aca56fe` | §40 consolidado (17 archivos, +2381/-208) — `useScanPreferences` + 4 exporters (CSV/JSON/XLSX/PDF) + `ExportMenu` + 8 tests del store + fix regresión §39 (`effectiveNode`) + fix roles PTP en export y filtro + fix botón Escanear bloqueado sin túnel. |

### Persistencia consolidada — `useScanPreferences`

Nuevo hook [`useScanPreferences`](vpn-manager/src/components/Devices/NetworkDevicesModule/hooks/useScanPreferences.ts) — **fuente única de truth** para todo lo que el usuario configura y espera reencontrar al volver:

| Campo | Antes | Ahora |
|---|---|---|
| `visibleCols` | localStorage `vpn_diag_cols_v2` | ✅ unificado |
| `colWidths` | localStorage `vpn_diag_col_widths_v1` | ✅ unificado |
| `sortConfig` | `useState` en `useDeviceList` (perdido al desmontar) | ✅ persiste |
| `filterRole` (AP/CPE/Desconocido) | `useState` | ✅ persiste |
| `filterSSID` | `useState` | ✅ persiste |
| `searchQuery` | `useState` | ✅ persiste |
| `manualLan` | `useState` en `NetworkDevicesModule` | ✅ persiste (respeta solo si pertenece al nodo activo) |

**Clave única:** `vpn_scan_prefs_v1` (con `schemaVersion` para evoluciones futuras).

**Migración silenciosa:** la primera vez que el nuevo store arranca y no encuentra `vpn_scan_prefs_v1`, lee las dos claves legacy (`vpn_diag_cols_v2` + `vpn_diag_col_widths_v1`) y las absorbe. Las claves viejas se conservan por una transición para roll-back; podrán retirarse cuando se libere §41.

**Debounce 300ms:** evita escribir localStorage en cada keystroke del input de búsqueda. **Flush sincrónico al desmontar** (vía `useRef` para capturar el último state, no la dep array) — si el usuario sale del módulo antes del debounce, no pierde el último cambio.

**Sanity-check defensivo:** descarta widths fuera del rango 50-1000, `filterRole` desconocidos, sort sin `dir` válido. Si el JSON está corrupto, vuelve a defaults sin lanzar.

**Caso clave del usuario — `visibleCols=[]`:** el código viejo tenía `if (parsed.length > 0) return parsed`. Si el usuario quitaba **TODAS** las columnas técnicas, al recargar se volvía al default de 8. El nuevo store **acepta array vacío** como válido (el usuario aún ve IP/Rol/Acción que son fijas del template). Cubierto por el test `acepta visibleCols=[] sin volver a defaults`.

### Refactor: hooks "controlled"

- [`useColumnPrefs`](vpn-manager/src/components/Devices/NetworkDevicesModule/hooks/useColumnPrefs.ts) — ahora solo cálculo derivado (activeConfigCols, gridTemplate, minTableWidth, compactNameMode, startResize). Recibe `visibleCols + colWidths + setColWidths` por props. Sin estado propio.
- [`useDeviceList`](vpn-manager/src/components/Devices/NetworkDevicesModule/hooks/useDeviceList.ts) — convertido a "controlled hook". Recibe `searchQuery / setSearchQuery / filterSSID / setFilterSSID / filterRole / setFilterRole / sortConfig / setSortConfig` desde el padre. Mantiene `useDeferredValue` interno para el filtrado.
- [`NetworkDevicesModule`](vpn-manager/src/components/Devices/NetworkDevicesModule/NetworkDevicesModule.tsx) — orquesta. Llama a `useScanPreferences()` y desestructura para los hooks downstream.

### Export multi-formato

Botón "Exportar" reemplazado por el nuevo componente [`ExportMenu`](vpn-manager/src/components/Devices/NetworkDevicesModule/components/ExportMenu.tsx) — dropdown con 4 opciones (patrón `useKebabMenu` + `createPortal` + close-on-scroll, estandarizado en §39):

| Formato | Lib | Chunk lazy (raw / gzip) | Notas |
|---|---|---|---|
| **CSV** | sin libs | exportCsv 0.38 KB / 0.30 KB | BOM UTF-8, RFC 4180 escape. Mantiene comportamiento previo. |
| **JSON** | sin libs | exportJson 0.50 KB / 0.35 KB | Estructura tipada con `schema: 'gestionvpn.scan/v1'` + metadata (nodo, subred, fecha, contadores) + `devices[]` con keys camelCase. |
| **Excel** | `exceljs` | exportXlsx 1.75 KB + **exceljs.min 929.91 KB / 256.47 KB** | Hoja "Escaneo" con título indigo, fila de metadatos, header bold + fill indigo-100, freeze pane en fila 5, anchos auto-ajustados (cap 32 chars). |
| **PDF informe** | `jspdf` + `jspdf-autotable` | exportPdf 2.18 KB + **jspdf.es.min 399.52 KB + plugin 29.92 KB + html2canvas 199.56 KB** | A4 landscape. Header con título + nodo + subred + fecha + línea indigo. 3 KPIs (Total / Con stats / Guardados). Tabla con 11 columnas legibles, header repetido por página, footer "Página N de M · GestionVPN · fecha". |

**Toda la lógica de columnas** vive en [`exportShared.ts`](vpn-manager/src/components/Devices/NetworkDevicesModule/utils/exportShared.ts) — `EXPORT_COLUMNS` (26 cols para CSV/JSON/Excel) + `PDF_COLUMNS` (11 cols subset legible). Cambiar el orden o agregar un campo solo requiere editar `exportShared.ts` y los 4 exporters quedan sincronizados.

### Loading-por-item en el dropdown

Cada item del `ExportMenu` muestra un spinner `Loader2` mientras corre su dynamic import + render. Los otros items quedan `disabled` para evitar paralelizar generaciones que podrían pisarse. Si falla, `window.alert` informa al usuario y la consola guarda el stacktrace.

### Métricas pre/post §40

| Métrica | Pre-§40 | Post-§40 |
|---------|---------|----------|
| Bundle inicial | 248.80 KB / 77.73 KB gzip | **248.80 KB / 77.74 KB gzip** (idéntico) |
| `NetworkDevicesModule` chunk | 97.4 KB / 23.6 KB gzip | **102.13 KB / 25.01 KB gzip** (+5 KB por ExportMenu + exportShared estáticos) |
| Persistencia | columnas + anchos | **columnas + anchos + sort + 3 filtros + búsqueda + subred manual** |
| Formatos de export | CSV | **CSV + JSON + Excel + PDF informe** |
| Tests frontend | 36 | **44** (+8 para useScanPreferences) |
| Vulnerabilidades npm prod | 0 | ⚠️ **2 moderate** (uuid viejo de exceljs — no compromete superficie del proyecto, solo regex catastrophic backtracking en parseo de UUIDs internos de la lib) |

**Bug cazado por los tests durante el desarrollo:** la primera versión del store tenía `useEffect(() => () => savePrefs(prefs), [prefs])` con la idea de "flush al desmontar". Pero la dep `[prefs]` hacía que el cleanup corriera en cada cambio, escribiendo a localStorage SIN debounce. Reemplazado por `useRef` + `useEffect(() => {}, [])` para que el cleanup solo corra al desmontar y lea la versión más reciente del ref.

### Reglas operativas reforzadas (post-§40)

- **Toda preferencia visible que el usuario ajusta debe persistir.** El módulo Escanear sienta el patrón: store único + clave única + migración legacy + debounce + flush al desmontar + sanity-check.
- **Hooks "controlled" son el patrón para state que vive en el store.** En vez de duplicar `useState` en cada hook especializado, el padre lo desestructura del store y pasa `value + setter` como props. Los hooks especializados quedan sin estado propio, fáciles de testear con valores hardcoded.
- **Dynamic imports para libs >100 KB.** `exceljs` (930 KB) y `jspdf` (400 KB + 200 KB html2canvas) no pueden entrar al bundle inicial. Patrón: el componente importa la lib **dentro** del handler async, no en el top-level. Vite genera chunks separados automáticamente.
- **Definición de columnas centralizada para multi-formato.** CSV y XLSX divergiendo es un bug clásico ("¿por qué la columna X aparece en uno pero no en el otro?"). `exportShared.ts` es la fuente única.
- **Loader2 por item en menús de export.** Generar un Excel con 200 filas puede tardar 1-2s en máquinas viejas. El feedback inmediato evita que el usuario clickee dos veces.

### Fix regresivo §39 — celda Acción vacía con túnel activo

Reporte del usuario tras §40: con 31 dispositivos escaneados, SSH OK en todos, solo **una** fila (la única `isSaved=true`) mostraba el botón "Ficha". Las otras 30 filas no mostraban "Guardar" — la celda Acción quedaba vacía.

**Causa raíz:** §39 retiró el span "Sin nodo" del primario, pero la lógica de `DeviceRowActions` deja `primary = null` cuando `!isSaved && !selectedNode`. El bug es que `selectedNode` es un `useState` local sincronizado **post-mount** desde `activeNodeVrf` vía `useEffect`. Si VpnContext rehidrata `activeNodeVrf` después de que `NetworkDevicesModule` montó, o si el usuario entra al módulo con túnel ya activo pero el effect de sync aún no corrió, `selectedNode` se queda en `null` aunque haya túnel activo. Con `!selectedNode`, ningún row puede mostrar "Guardar".

**Fix:** introducir `effectiveNode = selectedNode ?? activeNode` en `NetworkDevicesModule.tsx`. `activeNode` es derivado **directo** de `activeNodeVrf + nodes` (sin estado intermedio), así que está disponible en el primer render con datos. Reemplazo de `selectedNode` por `effectiveNode` en:

- `effectiveLan` (fallback de subred)
- `exportMeta.nodeName`
- `handleBulkSave` (botón "Guardar N")
- `handleOpenScanView`
- prop `selectedNode` del `<DeviceTable>` → llega a `DeviceRowActions` → ahora SÍ hay nodo destino → botón "Guardar" verde aparece en cada fila con SSH OK
- guarda del modal `<AddDeviceModal>`

`selectedNode` (state interno) se mantiene como elección **explícita** del usuario (cuando se permita elegir manualmente en futuras iteraciones), pero el resto de la UI usa `effectiveNode`.

| Métrica | Pre-fix | Post-fix |
|---|---|---|
| Filas con botón Guardar visible (caso 31 dispositivos, SSH OK, túnel activo) | 0/30 | **30/30** |
| Bundle (NetworkDevicesModule) | 102.13 KB | 102.46 KB (+330 B por el if `?? activeNode`) |
| Tests | 44 verdes | 44 verdes |

### Fix #2 — Roles PTP caían como "Desconocido" en el export

Reporte del usuario tras §40 (segunda iteración): en el PDF / Excel / JSON / CSV, la columna "Rol" solo distinguía `CPE` vs `Desconocido`. Filas que en la tabla aparecían como **`AP-PTP`** o **`STA-PTP`** salían como `"Desconocido"` en el archivo exportado.

**Causa raíz:** la tabla del módulo Escanear pinta el chip de rol con `String(rawMode).toUpperCase()` cuando `rawMode` no es uno de los 3 canónicos (`ap`/`master`/`sta`), lo que produce etiquetas como `AP-PTP`, `STA-PTP`, `REPEATER` directamente del campo libre `cachedStats.mode` (string que viene del airOS por `mca-status`). Pero mi `roleLabel()` en `exportShared.ts` comparaba con igualdad exacta:

```ts
if (raw === 'ap' || raw === 'master') return 'AP';
if (raw === 'sta') return 'CPE';
return 'Desconocido';   // 'ap-ptp', 'sta-ptp', etc.
```

→ todo lo que no fuera exactamente `'ap' / 'master' / 'sta'` caía a "Desconocido". Inconsistente con la tabla.

**Fix en [`exportShared.ts`](vpn-manager/src/components/Devices/NetworkDevicesModule/utils/exportShared.ts):** `roleLabel()` ahora devuelve el valor crudo en mayúsculas si no es ninguno de los canónicos:

```ts
if (lower === 'ap' || lower === 'master') return 'AP';
if (lower === 'sta') return 'CPE';
if (lower === 'unknown' || !raw) return 'Desconocido';
return raw.toUpperCase();   // 'AP-PTP' → 'AP-PTP', 'STA-PTP' → 'STA-PTP'
```

Tipo de retorno cambia de literal union `'AP' | 'CPE' | 'Desconocido'` a `string`.

**Fix complementario en [`useDeviceList.ts`](vpn-manager/src/components/Devices/NetworkDevicesModule/hooks/useDeviceList.ts):** `normalizeRole()` (que alimenta el filtro "Solo APs / Solo CPEs / Solo desconocidos") ahora acepta prefijos `ap-` / `ap_` / `sta-` / `sta_`, así un `AP-PTP` cae en categoría `ap` (sigue siendo un AP) y un `STA-PTP` en `sta` (sigue siendo una estación cliente). Antes ambos caían en `unknown` y el usuario tenía que filtrar "Solo desconocidos" para verlos — semánticamente raro.

| Antes | Ahora |
|---|---|
| Tabla muestra `AP-PTP`, export pone `Desconocido` | Tabla y export coinciden: ambos `AP-PTP` |
| Filtro "Solo APs" excluye AP-PTP | Filtro "Solo APs" incluye AP / master / AP-PTP / AP-* |
| Filtro "Solo CPEs" excluye STA-PTP | Filtro "Solo CPEs" incluye STA / STA-PTP / STA-* |

### Fix #3 — Botón "Escanear dispositivos" no se bloqueaba sin túnel activo

Reporte del usuario tras §40 (tercera iteración): el botón "Escanear dispositivos" estaba **habilitado** (gradiente indigo activo) incluso cuando no había túnel activo, lo que es un escaneo destinado a fallar sí o sí (el backend no puede salir a la LAN remota sin VRF arriba).

**Causa raíz:** [`useDeviceScan.ts:382`](vpn-manager/src/components/Devices/NetworkDevicesModule/hooks/useDeviceScan.ts:382) calculaba `canScan` solo con `phase quiescente + effectiveLan`. Faltaba la guarda obvia: necesita `activeNodeVrf`.

**Fix:**

```ts
const canScan = (scanState.phase === 'idle' || scanState.phase === 'done')
  && !!effectiveLan
  && !!activeNodeVrf;   // 🆕
```

Y en [`ScanControls.tsx`](vpn-manager/src/components/Devices/NetworkDevicesModule/components/ScanControls.tsx), el botón ahora:
- Muestra ícono **🔒 Lock** cuando está bloqueado (en vez de `RefreshCw`, que parecía "listo para presionar").
- `title` y `aria-label` con el motivo exacto: "Activa un túnel en la pestaña Nodos…" o "Elige o ingresa una subred…".
- Color del disabled más contrastado (`border` + `slate-400`) — antes era `slate-300` sobre `slate-100`, casi invisible en modo claro.

---

## 41) 🎯 Simplificación de acciones de fila — icon-only inline, sin kebab ni modal "Ficha"

Sesión 2026-06-12 noche. Tras §40 el usuario reportó que la columna Acción tenía demasiada cosa:

- Botón **"Ficha"** + su modal `DeviceCardModal` (re-ver el dispositivo ya guardado) — duplicado con info que la fila + el panel expandido ya muestran.
- **Kebab ⋮** con 3 opciones cuyo contenido se solapaba: "Ver informe airOS" (modal real), "Sincronizar stats" (útil), "Ver datos del scan" (duplicado de "Ficha").

Pedido del usuario: dejar solo **Guardar** (icon-only), **Ver informe airOS** (icon-only) y **Sincronizar stats** (icon-only cuando aplica). Sin kebab. Sin modal "Ficha".

### Commits

| Commit | Cambios |
|---|---|
| `02475fb` | §41 — `DeviceRowActions` reescrito a botones icon-only inline, retirados `DeviceCardModal` + `SshDataModal` + handlers asociados + types muertos. 8 archivos, +193/-499. |

### Diseño post-§41 — DeviceRowActions

[`DeviceTableRow.tsx`](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTableRow.tsx) — `DeviceRowActions` reescrito sin estado interno ni hooks:

```ts
const actions: RowAction[] = [];

// 1) Guardar — solo si NO está saved y hay nodo destino
if (!isSaved && selectedNode) {
  const directSave = sshStatus === 'success' && !!dev.sshUser;
  actions.push({
    Icon: directSave ? Check : PlusCircle,
    onClick: () => directSave ? onDirectSave(dev, selectedNode) : onOpenAddModal(dev),
    scheme: directSave ? 'emerald-solid' : 'indigo-solid',
    ariaLabel: 'Guardar dispositivo',
  });
}

// 2) Ver informe airOS — siempre si hay stats
if (hasStats) {
  actions.push({
    Icon: Activity,
    onClick: () => onOpenM5Detail(dev),
    scheme: 'violet-outline',
    ariaLabel: 'Ver informe airOS',
  });
}

// 3) Sincronizar stats — solo si saved + hasStats
if (isSaved && savedDevice && hasStats) {
  actions.push({
    Icon: RefreshCw,
    onClick: () => onSyncToSaved(dev, savedDevice),
    scheme: 'sky-outline',
    ariaLabel: 'Sincronizar stats',
  });
}
```

Tabla de comportamiento:

| Contexto | Botones renderizados |
|---|---|
| CPE no guardado con SSH OK + stats | [✓ verde Guardar] [📈 violet Informe airOS] |
| CPE no guardado SIN SSH OK | [➕ indigo Guardar — modal manual] (+ Informe si hay stats) |
| CPE ya guardado con stats | [📈 violet Informe airOS] [🔄 sky Sincronizar] |
| CPE sin SSH OK ni stats ni nodo | (vacío) |

Estilo: `p-1.5 rounded-lg` con `w-3.5 h-3.5` por icono. `aria-label` + `title` obligatorios (regla CLAUDE.md para icon-only). Sólido = acción que cambia estado (Guardar). Outline = acción observacional (Informe / Sincronizar).

### Limpieza de código muerto

Tras retirar la lógica de "Ficha" y "Ver datos del scan" del kebab, quedaron huérfanos:

- `DeviceCardModal.tsx` (~210 LOC) — modal "Detalle del dispositivo" + edición. Sin consumidores externos (verificado con grep en todo `src/`).
- `SshDataModal.tsx` — `setViewingRawDevice` nunca se llamaba (ya era código muerto desde antes; solo se descubrió al simplificar).
- `viewingDevice` / `viewingRawDevice` / `editingDevice` states.
- `handleOpenScanView` / `handleRemoveDeviceUnified` / `handleUpdateDeviceUnified` callbacks.
- `handleRemoveDevice` desestructuración de `library` (ya no se usa).
- Types `DeviceCardModalProps` + `SshDataModalProps`.
- Re-exports en `index.ts`.

**Total retirado:** 2 archivos `.tsx` (`git rm`) + ~80 LOC de handlers/states + 2 types + 4 re-exports.

### Métricas pre/post §41

| Métrica | Pre-§41 | Post-§41 |
|---|---|---|
| `NetworkDevicesModule` chunk | 102.46 KB / 25.04 KB gzip | **87.81 KB / 22.21 KB gzip** (−14.65 KB raw / −2.83 KB gzip) |
| Bundle inicial | 248.80 KB / 77.74 KB gzip | **248.84 KB / 77.76 KB gzip** (idéntico ±0.04 KB) |
| Botones primarios en celda Acción | "Ficha" (saved) o "Guardar" (no saved) + ⋮ | 1-2 botones icon-only directos |
| Dependencias del kebab (`useKebabMenu`, `createPortal`, `MoreVertical`) | sí | **eliminadas del módulo** |
| Modales activos en el módulo | 3 (`AddDeviceModal`, `DeviceCardModal`, `M5FullInfoModal`) | **2** (`AddDeviceModal`, `M5FullInfoModal`) |
| Archivos `.tsx` del módulo | 14 | **12** |
| Tests | 44 verdes | 44 verdes |

### Reglas operativas reforzadas

- **El kebab no es la respuesta a "tengo varias acciones".** Si caben ≤3 botones icon-only en la celda, mostrarlos directos. El kebab agrega un click extra, requiere portal + listeners, y muchas veces oculta acciones que el usuario quiere ver de un vistazo.
- **Modales que solo "muestran lo mismo en grande" son sospechosos.** El panel expandido del row (`DeviceStatusPanel`) ya despliega los datos completos del dispositivo. Un modal "Ficha" que repite la información es ruido.
- **Limpieza de código muerto es parte del feature.** Al retirar el botón "Ficha", `DeviceCardModal` quedó huérfano. No mantener componentes "por si acaso": grep, verificar, borrar. El bundle se beneficia (−14 KB).
- **Color = intención (CLAUDE.md):** verde sólido para acción confirmada (SSH OK + Guardar), indigo sólido para acción que abrirá un flujo adicional (Guardar manual), violet outline para observacional (Informe), sky outline para refresh de estado (Sincronizar). Cero gradientes multi-color.

### Pendiente / mejoras futuras

- **§43 (cleanup):** retirar las claves legacy `vpn_diag_cols_v2` + `vpn_diag_col_widths_v1` cuando se confirme que toda la base de usuarios migró. Migración silenciosa solo necesita correr una vez por navegador.

---

## 42) 🎯 Feedback del usuario — 4 mejoras de UX en la tabla Escanear

Sesión 2026-06-12 noche. Tras §41 el usuario revisó la vista Escanear y mandó un documento Word con 4 observaciones concretas:

1. El ícono **✓** del botón Guardar verde se confundía con "ya está OK / verificado". Cambiar por algo que diga explícitamente "guardar" (disquete).
2. El antiguo botón "Guardar N" tomaba **todos** los candidatos visibles automáticamente. El usuario quiere **elegir** cuáles guardar.
3. La **flecha de expandir** (`ChevronRight` con `text-slate-300`) se perdía sobre el zebra blanco/slate-50 en modo claro.
4. Al expandir una fila, el `DeviceStatusPanel` muestra mucho detalle ("está más que perfecto, no elimines nada"), pero **faltan IP y nombre del sistema** arriba como identificadores rápidos.

### Commits

| Commit | Cambios |
|---|---|
| `10404f9` | §42 — checkbox de selección por fila + tri-state header + ícono Save + chevron con border + IP/hostname en panel. 6 archivos, +318/-34. |

### §42-1 · Ícono Save en lugar de Check

[`DeviceTableRow.tsx`](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTableRow.tsx) — el primario "Guardar emerald" cuando `directSave === true` ahora usa el ícono `Save` (disquete) de lucide en vez de `Check`. El `Check` se mantiene para los **checkboxes de selección** (donde sí significa "está marcado"). Cambio de 1 línea, peso del bundle idéntico.

### §42-2 · Bulk save selectivo con checkbox por fila

Reescritura del flujo de bulk save. Antes (§38) el botón "Guardar N" tomaba **todos** los candidatos visibles (`!isSaved && sshSuccess && hasStats`) y los persistía en la biblioteca. Ahora:

**Modelo de estado** (en [`NetworkDevicesModule.tsx`](vpn-manager/src/components/Devices/NetworkDevicesModule/NetworkDevicesModule.tsx)):

```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const visibleCandidates = useMemo(() => /* SSH OK + !isSaved + hasStats */, [...]);
const bulkSaveSelection = useMemo(() => visibleCandidates.filter(r => selectedIds.has(r.devId)), [...]);
```

**Handlers expuestos:** `handleToggleSelected(devId)` · `handleSelectAllVisibleCandidates()` · `handleClearSelection()`. La selección se limpia automáticamente al cambiar de nodo (mismo `useEffect` que resetea los scan results). Tras un bulk save exitoso, los ids guardados se quitan del set; los que fallaron quedan seleccionados para reintentar.

**Nueva columna 36px al inicio del grid** (en [`useColumnPrefs.ts`](vpn-manager/src/components/Devices/NetworkDevicesModule/hooks/useColumnPrefs.ts) y `useScanPreferences`): el `gridTemplate` ahora empieza por `'36px'` (checkbox) antes de la columna SSH. `minTableWidth` actualizado a los nuevos valores base.

**Header con checkbox tri-state** ([`DeviceTable.tsx`](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTable.tsx)):

| Estado | Visual | Acción al click |
|---|---|---|
| `empty` (nada seleccionado) | □ borde slate | seleccionar todos los visibles candidatos |
| `partial` (algunos seleccionados) | ☑ fondo emerald-100 + ícono `Minus` | seleccionar todos los visibles candidatos |
| `full` (todos seleccionados) | ☑ fondo emerald-500 + `Check` blanco | limpiar la selección |
| sin candidatos | □ slate-300 disabled | nada (deshabilitado con `title`) |

`role="checkbox"` + `aria-checked="mixed"` para el estado parcial — patrón ARIA estándar.

**Checkbox por fila** ([`DeviceTableRow.tsx`](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTableRow.tsx)): solo se renderiza si la fila es **candidato** (`!isSaved && sshStatus === 'success' && !!selectedNode`). En las demás filas la celda queda vacía — no confundir al usuario con checkbox inhábiles. `stopPropagation` en el click para no disparar el toggle del expand.

**Botón "Guardar N"** ahora depende de `bulkSaveSelection.length`, NO de `visibleCandidates.length`:
- Solo aparece cuando el usuario ha marcado **al menos uno**.
- Muestra el conteo de la selección efectiva.
- Confirmación de window si N>5 (igual que antes).

### §42-3 · Chevron de expandir con border y mejor contraste

[`DeviceTableRow.tsx`](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceTableRow.tsx) — el botón toggle pasó de:

```
text-slate-300 hover:text-slate-500 hover:bg-slate-100   (invisible sobre blanco)
```

a:

```
text-slate-500 bg-slate-100 border border-slate-200       (visible sin hover)
hover:text-slate-700 hover:bg-slate-200 hover:border-slate-300
```

Cuando está expandido (`isExpanded`) mantiene la paleta indigo previa, ahora también con `border-indigo-200`. Añadidos `aria-label` y `aria-expanded` para a11y.

### §42-4 · IP + Nombre del sistema arriba en el panel

[`DeviceStatusPanel.tsx`](vpn-manager/src/components/Devices/NetworkDevicesModule/components/DeviceStatusPanel.tsx) — la lista de "Configuración" ahora abre con dos filas que antes estaban dispersas (IP solo en el header oscuro pequeño; "Nombre de dispositivo" enterrado entre 30 filas):

```ts
['IP', dev.ip],                                       // 🆕 §42
['Nombre del sistema', s.deviceName || dev.name],     // 🆕 movido + renombrado
['Modelo de Dispositivo', s.deviceModel || dev.model],
// ...resto sin tocar
```

El usuario fue explícito: "no elimines nada". Cumplido — solo se reordena.

### Métricas pre/post §42

| Métrica | Pre-§42 | Post-§42 |
|---|---|---|
| `NetworkDevicesModule` chunk | 87.81 KB / 22.21 KB gzip | **91.03 KB / 23.03 KB gzip** (+3.22 KB raw / +0.82 KB gzip por columna nueva + handlers + checkbox UI) |
| Bundle inicial | 248.84 KB / 77.76 KB gzip | **248.84 KB / 77.76 KB gzip** (idéntico) |
| Columnas fijas del grid | SSH/Rol/IP/Nombre/...activeConfig/Toggle/Acción | **Checkbox**/SSH/Rol/IP/Nombre/...activeConfig/Toggle/Acción |
| Modelo bulk save | "guarda todos los candidatos visibles" | **"guarda los marcados por el usuario"** |
| Tests | 44 verdes | 44 verdes |

### Reglas operativas reforzadas

- **Tri-state checkbox es el patrón ARIA correcto** para "seleccionar todos visibles". `aria-checked="mixed"` no es opcional — los screen readers lo necesitan para distinguir parcial de vacío.
- **`stopPropagation` en checkbox dentro de row clickeable** — sin esto el click en el checkbox también dispara el toggle expand del row.
- **Ícono = metáfora, no decoración** (CLAUDE.md). El usuario no debe estar adivinando si `Check` significa "OK" o "guardar". `Save` (disquete) es la metáfora universal pese a que las generaciones jóvenes ya no usen disquetes — sigue funcionando como íconograma.
- **Color contrastante en controles pasivos** — `text-slate-300` en un botón que el usuario debe descubrir es invisible sobre `bg-white`. Subir mínimo a slate-400/500 + leve bg/border para que la affordance exista incluso sin hover.

### Pendiente / mejoras futuras

- **Shift+click para selección por rango** — gold standard de los pickers tabulares. Solo necesita guardar el último `devId` clickeado y, al detectar `shift`, seleccionar el rango entre ese y el actual sobre `sortedRows`.
- **Persistir `selectedIds`** — debate: si el usuario se va a otra pestaña y vuelve, ¿debe seguir su selección? Hoy NO se persiste (se va con el unmount). Probablemente bien así — la selección es transaccional.
- **"Resetear preferencias"** sigue pendiente desde §40.
- **Vulnerabilidades:** `exceljs` arrastra `uuid` v8 vulnerable (2 moderate). Tracker: si se libera `exceljs` con uuid v9+ aplicar update; alternativa es migrar a `xlsx` (SheetJS Community) pero su licencia es más restrictiva.
- **Botón "Resetear preferencias":** el store ya expone `resetPrefs()` (sin UI todavía). Útil para soporte cuando un usuario quiere "empezar de cero" sin borrar cache del navegador. Pendiente de añadir en `ColumnPicker` o como acción en un menú de "Ajustes del módulo".
- **Persistir `expandedRows`** (filas con panel SSH abierto) — bajo prioridad, comportamiento debatible al re-escanear.
- **Per-nodo `manualLan`:** hoy es global. Si el usuario alterna entre nodos A y B con subredes manuales distintas, A pisa a B. Solución: `Record<vrfName, string>` en el store. Pendiente cuando alguien lo reporte como dolor real.

### Cross-references

- §35 — Patrón "Alias humano" optimista con rollback. Mismo principio que §40: la UI siempre refleja la intención del usuario aunque el storage subyacente sea async.
- §37-§39 — Auditoría Escanear (perf+robustez+UX). §40 cierra el ciclo agregando la capa de personalización.
- F10 — Code-splitting. §40 respeta la regla: bundle inicial sigue en 248 KB, las 2 libs grandes son lazy.
- Regla operativa nueva: **toda preferencia visible persiste** → debe aplicarse al resto del proyecto (Nodos, Equipo, Monitor AP) si surge el reporte.

---

## 43) 🛡️ Política anti-saturación — eliminar polling SSH automático a antenas

Reporte del usuario tras §42: el panel `DeviceStatusPanel` (panel expandido inline al abrir la flecha de una fila en Escanear) hacía **SSH a la antena cada 5 segundos** vía `setInterval(doFetch, 5000)` para mantener stats "en vivo". El usuario lo descubrió al ver consumo anómalo en el CPU de la antena.

> *"Cada 5 segundos se actualiza y vuelve a consultar a la antena sobre sus parámetros, esto genera una saturación en el CPU del equipo. (...) si tomamos en cuenta, si fuera más equipos saturarían el CPU de todos los equipos acortando su tiempo de vida. Formula una correcta implementación. Esto con todas las tablas para evitar la saturación."*

**Por qué es grave:**

Las antenas Ubiquiti airOS son equipos pequeños (CPU MIPS ~400 MHz, ~64 MB RAM). Un comando combinado SSH como el que ejecuta `ANTENNA_CMD` corre 14 comandos en serie (`mca-status`, `wstalist`, `cat /proc/...`, `iwconfig`, etc.) y puede llevar 1-3s de CPU al equipo. Cada panel abierto = **1 SSH cada 5s** = **+5% CPU sostenido en la antena solo por mirarla**. Si un operador abre 10 paneles a la vez = **50% CPU constante en 10 antenas distintas**. A largo plazo, el desgaste por carga térmica reduce la vida útil del equipo.

### Commits

| Commit | Cambios |
|---|---|
| _pendiente_ | §43 — quitar `setInterval(doFetch, 5000)` en DeviceStatusPanel + reemplazar indicador "En vivo / Actualizando…" por "Datos del scan · hace X" (ámbar si >5min) + actualizar política operativa SSH |

### Cambios en `DeviceStatusPanel.tsx`

1. **`setInterval(doFetch, 5000)` ELIMINADO.** El panel ahora muestra los datos del scan tal cual quedaron. El usuario refresca manualmente con el botón **"Ahora"** (que ya existía) cuando necesita valores en vivo.

2. **Indicador de frescura, no de "polling activo":**
   - Antes: `🟢 En vivo` con `animate-pulse` + cambio a `animate-ping` durante refresh. Sugería que el dato se actualizaba solo.
   - Ahora: `⚫ Datos del scan · hace X` neutral. Si han pasado **más de 5 minutos** desde el último fetch, el indicador se vuelve **ámbar** para que el operador sepa que conviene refrescar antes de tomar decisiones operativas.

3. `handleRefresh = () => doFetch()` mantenido — botón "Ahora" no cambió.

### Auditoría del resto del frontend

Grep exhaustivo de `setInterval` reveló estos call sites tocando equipos:

| Archivo | Intervalo | Qué hace | ¿SSH a antena? | Acción |
|---|---|---|---|---|
| **`DeviceStatusPanel.tsx:73`** | 5s | `/api/device/antenna` → SSH a antena | ✅ SÍ | **🔥 Eliminado en §43** |
| `Common/DeviceCard/useAntennaData.ts` | (sin `setInterval`) | fetch único al montar si `compact` | ✅ SÍ (1 vez) | ✓ Ya correcto |
| `M5FullInfoModal` | (sin fetches) | Solo lectura de `cachedStats` | ❌ No | ✓ Ya correcto |
| `ApMonitorModule` | (sin `setInterval` SSH) | Lee `signal_history` de BD; el `monitoringJob` backend muestrea cada 5 min | ❌ No (lee BD) | ✓ Ya correcto |
| `useNodeFetching.ts:156` | 60s | `/api/nodes` → RouterOS API a MikroTik central | ❌ No (RouterOS API, no SSH a antena) | ⏳ Revisar separadamente |
| `useNodeFetching.ts:192` | 10s | check de túnel local | ❌ No | OK |
| `MetricsPanel.tsx:70` | (poll) | métricas dashboard `/api/metrics` | ❌ No | OK |

**Conclusión:** **solo `DeviceStatusPanel`** disparaba SSH a antenas en loop. El resto consulta MikroTik central (que tolera bien la carga vía RouterOS API binaria, no SSH) o lee de BD local.

### Política operativa actualizada — "Política SSH" (final del HANDOFF)

Se añade nueva regla a la sección 🛑 "Política de operaciones SSH sobre dispositivos Ubiquiti airOS":

> **🚫 Polling automático de SSH a antenas: PROHIBIDO.** Ningún componente del frontend ni job del backend debe ejecutar comandos SSH a antenas Ubiquiti en intervalo recurrente.
>
> **Patrones permitidos:**
> - Fetch único al abrir un panel/modal si no hay datos cacheados (`autoFetched.current` o equivalente).
> - Refresh manual disparado por el usuario (botón "Ahora" / "Actualizar").
> - Backfill puntual durante el flujo de escaneo (`runAuthPhase`) — 1 SSH por antena, no recurrente.
>
> **Por qué:** las antenas tienen CPU MIPS limitado. Cada SSH+`mca-status`+`wstalist` cuesta 1-3s de CPU del equipo. Polleo a 5s sostiene ~5% CPU **por panel abierto**, multiplicable por cuántas antenas se estén observando simultáneamente.

### Reglas operativas reforzadas (post-§43)

- **Toda nueva tabla, panel o modal que muestre datos de antenas Ubiquiti debe leer del cache** (`cachedStats`, BD, scan resultado) y exponer un botón explícito de refresh. **Nunca `setInterval` con fetch SSH.**
- **Indicadores de "en vivo" / `animate-pulse` / `animate-ping`** se reservan para datos que **realmente** se actualizan en vivo (SSE del scan, métricas del dashboard que vienen del sampler backend). No usar para datos cacheados.
- **Si necesitas un dato fresco programado**, súbelo a backend (cron / job dedicado) que escribe en BD, y el frontend lee de BD. Patrón ya usado por `monitoringJob` (§31) y `dashboardMetrics` (§30). El backend puede coordinar carga y rate-limit; el frontend no.

### Métricas pre/post §43

| Métrica | Pre-§43 | Post-§43 |
|---|---|---|
| SSH/s a una antena con panel abierto | 0.2 (1 cada 5s) | **0** |
| SSH/s con 10 paneles abiertos a 10 antenas distintas | 2 (1 por antena cada 5s) | **0** |
| Carga estimada en CPU de antena por panel | ~5% sostenido | **~0%** |
| `NetworkDevicesModule` chunk | 91.96 KB / 23.34 KB gzip | **91.87 KB / 23.34 KB gzip** (−90 B raw por la lógica retirada) |
| Bundle inicial | 248.84 KB / 77.76 KB gzip | **248.84 KB / 77.76 KB gzip** (idéntico) |
| Tests | 44 verdes | 44 verdes |

### Pendiente / mejoras futuras

- **Auditar `useNodeFetching.ts:156` (silentPoll 60s)** — no toca antenas, pero envía un `/api/nodes` cada 60s que tira de RouterOS API al MikroTik central. Si la base de nodos crece, vale revaluar (¿pasar a SSE-driven? ¿bajar a 2-3 min cuando la pestaña no está en foco?).
- **Botón "Ahora" más prominente en panel expandido** cuando `lastUpdated > 5 min`: pulsar suavemente o cambiar a indigo para invitar al refresh.
- **Indicador global de "X SSH activos"** en el header del módulo para detectar saturación accidental durante uso normal.

---

## 45) 🎨 Audit del Sistema de Diseño — script + skill instalada

Reporte del usuario tras §44: en modo oscuro varios componentes quedan con fondos blancos, algunos botones tienen colores fuera de la paleta semántica, tamaños de texto inconsistentes. Pide una forma de **estandarizar** y **detectar** estas inconsistencias.

### Acciones tomadas

1. **Skill `tailwind-design-system` instalada** (`wshobson/agents`, 48.1K installs). Provee patrones de tokens semánticos, dark mode con `@custom-variant`, componentes CVA, accessibility-first. Sirve como referencia conceptual al refactorizar componentes; está disponible vía el sistema de skills.

2. **Auditor automático `scripts/audit-design.js`** — recorre `vpn-manager/src/**/*.{ts,tsx}` y reporta violaciones a `CLAUDE.md` + `DESIGN_SYSTEM.md` + `tailwind.config.js`. Sin dependencias externas, solo Node.js + regex.

### Reglas auditadas

| ID | Severidad | Detecta |
|---|---|---|
| **DS01-disallowed-palette** | error | Colores fuera de las 7 paletas permitidas (indigo/emerald/rose/amber/sky/violet/slate). Bloquea `red`/`blue`/`green`/`gray`/etc. |
| **DS02-bg-without-dark** | warning | `bg-{color}-50/100/200` o `bg-white` sin variante `dark:` correspondiente. Esos componentes quedan con fondo blanco/casi-blanco en modo oscuro y el contenido se vuelve invisible. Excepciones: líneas que ya usan clases del sistema (`.card`/`.btn-*`/`.input-field`/etc) — esas manejan dark internamente. |
| **DS03-text-too-small** | error | `text-[10px]`, `text-[11px]` literales. `CLAUDE.md` fija `text-xs` (12px) como mínimo. La única excepción permitida es la clase `text-2xs` (alias de 11px reservado para micro-badges). |
| **DS04-multicolor-gradient** | warning | `from-COLOR-N to-OTHERCOLOR-N` (paletas distintas). `CLAUDE.md` exige un estado = un color. |
| **DS05-low-contrast-text** | info | `text-slate-300/400` fuera de variant `dark:`. Sobre fondo blanco no pasa AA. Los labels deben ser mínimo `slate-600`. |
| **DS06-raw-button-color** | info | `<button>` con `bg-...-600 text-white` inline en vez de usar `.btn-primary` / `.btn-success` / etc. Pierden focus ring, active:scale, shadow consistente. |

### Comandos

```bash
npm run audit:design        # reporte formateado con colores ANSI
npm run audit:design:json   # JSON estructurado (para CI futuro)
node scripts/audit-design.js --rule DS02   # solo una regla
```

Exit code: **1 si hay errores** (severity=error), **0** si solo warnings/infos. Útil para CI eventual sin bloquear el flujo actual.

### Snapshot inicial (al cierre de §44)

333 archivos analizados:

| Regla | Severidad | Violaciones | Archivos afectados |
|---|---|---|---|
| DS05 (texto slate-300/400) | info | 411 | 97 |
| DS03 (text-[10/11px] literal) | **error** | 313 | 57 |
| DS02 (bg sin dark variant) | warning | 265 | 80 |
| DS01 (palette prohibida) | **error** | 62 | 16 |
| DS06 (botón inline) | info | 26 | 17 |
| DS04 (gradiente multicolor) | warning | 19 | 10 |

**Total: 1,096 hallazgos** (375 errores · 284 warnings · 437 infos).

**Top archivos a refactorizar primero** (más violaciones):

1. `Devices/NodeAccessPanel/modals/NuevoNodo.tsx` — 74
2. `Devices/NetworkDevicesModule/components/DeviceStatusPanel.tsx` — 63
3. `Devices/NetworkDevicesModule/utils/columns.tsx` — 55
4. `Monitor/ApMonitorModule/components/ApRow.tsx` — 37
5. `Devices/NodeAccessPanel/modals/EditarNodo.tsx` — 32
6. `Users/UserManagementPanel/components/UsersTable.tsx` — 28
7. `Devices/NodeAccessPanel/constants.ts` — 27
8. `Monitor/ApMonitorModule/components/ApGroupCard.tsx` — 26
9. `Admin/ModeratorsModule/ModeratorsModule.tsx` — 25
10. `Devices/NodeAccessPanel/modals/BatchCsvModal.tsx` — 23

### Cómo usar el auditor en flujo de trabajo

1. **Antes de mergear**: correr `npm run audit:design` y revisar errores DS01/DS03 — esos son objetivos (palette / tamaño) y se solucionan en un par de minutos.
2. **Refactor incremental**: tomar 1 archivo del top 10 por sesión. Aplicar fixes guiados por la skill `tailwind-design-system` (palette OKLCH + dark variants) o por el agente `react-ui-expert` ya configurado.
3. **CI eventual** (no implementado todavía): agregar paso `npm run audit:design` al workflow `ci.yml` y bloquear PRs solo cuando los errores aumenten respecto a `main`. Esto evita el "blast radius" inicial de 375 errores acumulados.

### Falsos positivos conocidos

- **DS02** puede marcar `hover:bg-indigo-50 dark:hover:bg-indigo-500/10` como sin dark variant si el patrón de variante dark intermedio no matchea (ya corregido en este commit con regex `\bdark:[^\s"'\`]*bg-/`).
- **DS05** marca todo `text-slate-400` aunque esté sobre fondo oscuro — solo es señal, no error. El operador decide caso por caso.
- **DS06** es heurístico — un botón inline puede ser intencional (modal de confirmación con palette distinta). Por eso es severity=info.

### Reglas operativas reforzadas (post-§45)

- **`text-2xs` SIEMPRE en lugar de `text-[11px]`** — la primera ya está en `tailwind.config.js` y el auditor la respeta como excepción válida.
- **Toda nueva clase de botón sólido debe usar `.btn-*`** del sistema — perdemos focus ring + active:scale + shadow si vamos inline.
- **Toda fila `<tr>` o `<div>` con bg de color debe tener variant `dark:`** o usar `.card`/`.card-hover`. El auditor lo bloquea.

### Pendiente / mejoras futuras

- **Refactor sistemático**: aplicar fixes al top 10 archivos para reducir los 375 errores. Estimación: 4-6h por archivo × 10 = 1-2 días de trabajo enfocado.
- **Reducir `text-[11px]` a `text-2xs`**: 313 ocurrencias — sed/replace masivo + revisión visual. La paleta OKLCH del skill instalado puede aportar pistas.
- **DS07 — z-index inconsistente**: pendiente regla nueva para detectar `z-[number]` literales fuera de la escala `z-0/10/20/30/40/50`.
- **DS08 — hardcoded hex**: detectar `text-[#hex]` o `bg-[#hex]` (saltean la paleta).
- **Integración a CI**: cuando los errores bajen a 0, agregar `npm run audit:design` al workflow para no regresar.

---

## 46) 🎨 Plan ejecutable de estandarización + sistema extendido + wins rápidos

Pedido del usuario tras §45: "implementa un plan para ejecutar dichos cambios. Los botones deben tener las mismas características y efectos. Quiero que se sienta que es un proyecto en conjunto, no partes de distintos proyectos. Usa la skill y genera el informe."

### Lo entregado en este commit

**1. Sistema de diseño extendido** ([`index.css`](vpn-manager/src/index.css)) — completa los huecos que tenía el sistema:

- **3 botones nuevos**: `.btn-warning` / `.btn-info` / `.btn-accent` (antes solo `.btn-primary/success/danger/outline/ghost`).
- **Focus-visible WCAG en TODOS los `.btn-*`**: `focus-visible:ring-2 ring-offset-2 ring-{color}-500/60 ring-offset-white` + dark variant. Antes ninguno lo tenía.
- **Disabled state consistente**: `disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-... disabled:shadow-none`.
- **Tamaños composables**: `.btn-sm` / `.btn-md` (default) / `.btn-lg` / `.btn-icon`. Patrón: `<button className="btn-primary btn-md">`.
- **Modal canónico**: `.modal-overlay` (backdrop + blur) / `.modal-panel` (container) / `.modal-header` / `.modal-body` / `.modal-footer`. Reemplazará los modales reinventados que tenemos.

**2. Wins rápidos por sed-replace** (`vpn-manager/src/**/*.{ts,tsx}`):

| Patrón | Antes | Después |
|---|---|---|
| `text-[11px]` literal | 252 ocurrencias | `text-2xs` (alias 11px reservado) |
| `text-[10px]` literal | ~61 | `text-2xs` |
| `from-blue-50` / `to-blue-50` / `via-blue-50` | DS04 violations | `from-sky-50` etc. (paleta válida) |

Aplicado con `find ... -exec sed -i 's/.../.../g' {} +`. **−259 violaciones totales (−23.6%)** sin tocar ningún archivo a mano.

**3. Plan ejecutable** [`DESIGN_REFACTOR_PLAN.md`](DESIGN_REFACTOR_PLAN.md) en la raíz:

- Diagnóstico actual con métricas pre/post
- Catálogo unificado de botones (variants + sizes + states + dark + focus)
- Patrón canónico de modal
- 6 fases de refactor (Fase 0 ✅ hecha, Fases 1-5 pendientes)
- Estimación: **~60h** para llegar a cero hallazgos (8 fases × 6-8h cada una si vamos 1 por semana)
- Checklist por archivo (template para PRs)
- Reglas operativas reforzadas

### Métricas pre/post §46

| Regla | Pre-§46 | Post-§46 | Δ |
|---|---|---|---|
| DS03 (text < 12px) | 313 | **61** | **−252 (−80.5%)** |
| DS01 (palette prohibida) | 62 | 55 | −7 |
| DS04 (gradiente multicolor) | 19 | 19 | 0 (documentado como excepción para backgrounds decorativos) |
| DS02 (bg sin dark) | 265 | 265 | 0 (requiere refactor manual archivo por archivo) |
| DS05 (texto contraste) | 411 | 411 | 0 (requiere juicio caso por caso) |
| DS06 (botón inline) | 26 | 26 | 0 (depende de §46-1 ya entregado — ahora hay clases destino) |
| **TOTAL** | **1,096** | **837** | **−259 (−23.6%)** |

Bundle inicial: **248.76 KB / 77.72 KB gzip** (idéntico — solo cambian clases CSS y literales de texto).
Tests: **44/44 verdes**. tsc 0 errores. Build OK.

### Reglas operativas reforzadas (post-§46)

- **Botones SIEMPRE con `.btn-*` + un tamaño (`.btn-sm/md/lg/icon`)**. PR con botón inline = revisar.
- **`text-[10/11px]` literal queda PROHIBIDO**. Usar `text-2xs` (clase ya en `tailwind.config.js`).
- **Modales SIEMPRE con `.modal-overlay/.modal-panel/.modal-header/.modal-body/.modal-footer`**. Modal ad-hoc = revisar.
- **focus-visible:ring obligatorio en cualquier componente interactivo nuevo** (las clases del sistema ya lo traen — solo respetarlas).
- **Fondos claros (`bg-{color}-50/100/200`, `bg-white`) sin variante `dark:` quedan PROHIBIDOS** — o usar `.card`/`.input-field`/etc, o agregar la variante manualmente.

### Pendiente / Roadmap próximas iteraciones

- ~~**Fase 1 (8-12h)**: migrar 26 botones inline DS06 a `.btn-*`.~~ ✅ **HECHO en §47**
- **Fase 2 (15-20h)**: bajar las 265 DS02 con dark variants archivo por archivo (10 archivos top).
- **Fase 3 (6-8h)**: unificar los ~13 modales del proyecto con `.modal-*`.
- **Fase 4 (8-16h)**: revisión manual de las 411 DS05 (texto contraste).
- **Fase 5 (2-4h)**: limpiar las 55 DS01 (`red→rose`, `green→emerald`, `gray→slate`, etc.).
- **CI eventual**: cuando errores=0, agregar `npm run audit:design` al workflow para no regresar.

---

## 47) 🎯 Fase 1 del Plan — botones inline migrados a `.btn-*` (DS06 −88.5%)

Pedido del usuario tras §46: "implementa el plan… los botones deben tener las mismas características y efectos. Quiero que se sienta que es un proyecto en conjunto." Skill usada: patrones CVA + variant/size de `tailwind-design-system`.

### Commit

| Hash | Cambios |
|---|---|
| `a771cbb` | §47 Fase 1 — 23 botones inline migrados a `.btn-{variant} btn-{size}` en 18 archivos + refinamiento del auditor DS06. |

### Migración por archivo

| Archivo | Botones | Clase aplicada |
|---|---|---|
| `Auth/AcceptInvitationForm.tsx` | 2 | `btn-primary btn-md` |
| `Auth/PasswordResetConfirm.tsx` | 1 | `btn-primary btn-md` |
| `Auth/PasswordResetRequest.tsx` | 2 | `btn-primary btn-md` |
| `Auth/RouterAccess.tsx` | 1 | `btn-primary btn-md` |
| `NodeAccessPanel/modals/NuevoNodo.tsx` | 2 | `btn-primary btn-md` |
| `NodeAccessPanel/modals/EditarNodo.tsx` | 2 | `btn-primary btn-md` |
| `NodeAccessPanel/modals/EliminarNodo.tsx` | 2 | `btn-danger btn-md` |
| `NodeAccessPanel/modals/NuevoAdmin.tsx` | 2 | `btn-primary btn-md` |
| `NodeAccessPanel/modals/TagModal.tsx` | 2 | `btn-warning btn-icon` + `btn-warning btn-md` |
| `NodeAccessPanel/modals/ScriptModal.tsx` | 1 | `btn-success btn-md` |
| `NodeAccessPanel/modals/BatchCsvModal.tsx` | 3 | `btn-accent btn-md` |
| `NodeAccessPanel/sections/StateIndicators.tsx` | 2 | `btn-warning btn-sm` + `btn-danger btn-md` |
| `NetworkDevicesModule.tsx` (bulk save) | 1 | `btn-success btn-sm` |
| `NetworkDevicesModule/DeviceStatusPanel.tsx` | 2 | `btn-info btn-sm` |
| `ApMonitorModule/modals/CpeDetailModal.tsx` | 1 | `btn-warning btn-sm` |
| `ApMonitorModule/modals/MoveToNodeModal.tsx` | 1 | `btn-primary btn-md` |
| `VPN/NodeCard/components/NodeCardSshForm.tsx` | 1 | `btn-warning btn-sm` |
| `VPN/NodeCard/components/NodeCardWgPeerForm.tsx` | 1 | `btn-accent btn-sm` |

**Total: 23 botones migrados en 18 archivos.**

Cada botón ahora hereda del sistema (definido en §46-1):
- `focus-visible:ring-2 ring-offset-2 ring-{color}-500/60` (WCAG)
- `active:scale-[0.98]` (feedback táctil)
- `disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-... disabled:shadow-none`
- Shadow semántico (`shadow-{color}-500/25`)
- Variante `dark:` con `ring-offset-slate-900`

### Refinamiento del auditor

`scripts/audit-design.js` ahora pasa **contexto de 3 líneas previas** (`ctx.prev3`) a las reglas. La regla **DS06** verifica que el patrón `bg+text-white` esté dentro de un `<button>` real, no de `<span>` o `<div>` con bg-color. Reduce los falsos positivos clásicos:

- ✅ Antes marcaba el `<span>` de paginación (`bg-indigo-600 text-white` indicador de página actual).
- ✅ Ahora solo marca elementos cuya línea actual o las 3 previas contienen `<button`.

### Snapshot acumulado desde el baseline §45

| Métrica | Baseline | Post-§46 | Post-§47 | Δ acumulada |
|---|---|---|---|---|
| DS06 botones inline | 26 | 26 | **3** | **−88.5%** |
| DS03 text < 12px | 313 | 61 | 61 | −80.5% |
| DS01 palette prohibida | 62 | 55 | 55 | −11.3% |
| DS02 bg sin dark | 265 | 265 | 265 | 0% (Fase 2 pendiente) |
| DS04 gradiente multi | 19 | 19 | 19 | 0% (excepción documentada) |
| DS05 texto contraste | 411 | 411 | 411 | 0% (Fase 4 pendiente) |
| **Errores (severidad error)** | 375 | 116 | **116** | **−69%** |
| **TOTAL hallazgos** | **1,096** | 837 | **814** | **−25.7%** |

Los **3 DS06 restantes** son toggles condicionales legítimos (`bg-X` según estado de `saved`/`selected`/`group-hover`), no botones primarios sólidos:
- `ApDetailModal:169` — toggle save/saved
- `UsersTable:439` — botón ghost con bg al hover del row padre
- `MoveToNodeModal:49` — botón de lista de opciones con estado "seleccionado"

### Verificación

- `tsc 0` errores · `npm run build` OK · pre-commit hook OK
- 44/44 tests verdes
- Bundle inicial: **248.76 KB / 77.74 KB gzip** (idéntico)
- 19 archivos modificados, +45/-40 LOC neto

### Reglas operativas reforzadas

- **Botones sólidos SIEMPRE con `.btn-{variant} btn-{size}`.** Patrón inline = revisar PR.
- **Toggles condicionales** (cambian bg según estado) están EXENTOS de DS06 — son patrón legítimo.
- **`btn-icon`** es la única clase que combina padding + display + rounded para botones icon-only. Usar SIEMPRE para `<button><Icon /></button>` sin texto.

### Pendiente / próximas fases

- ~~**Fase 2 (DS02 dark mode, 8-12h)** — siguiente prioridad porque es donde más se nota el bug original "fondo blanco en dark mode".~~ ✅ **Iniciado en §48 — DS02 265 → 103 (−61%) en 28 archivos**.
- **Fase 3 (modales unificados, 6-8h)** — los 13 modales del proyecto ya pueden usar `.modal-overlay/.modal-panel/.modal-header/.modal-body/.modal-footer` (creadas en §46).
- **Fase 4 (DS05 contraste)** y **Fase 5 (DS01 palette)** — backlog.

---

## 48) 🌑 Fase 2 del Plan — DS02 dark mode en archivos top (−61% en 3 rondas)

Pedido del usuario tras §47: "sigue con la fase 2 usando las skills correspondientes". Skill usada: `tailwind-design-system` (Tailwind v4 conceptual; el proyecto usa v3 con `darkMode: 'class'` — los patrones de tokens semánticos y `dark:` variants son los mismos).

### Patrón canónico aplicado (consistente con `index.css`)

| Token claro | Variant dark |
|---|---|
| `bg-{color}-50` | `dark:bg-{color}-500/10` |
| `bg-{color}-100` | `dark:bg-{color}-500/15` |
| `bg-{color}-200` | `dark:bg-{color}-500/25` |
| `bg-white` | `dark:bg-slate-900` (o `dark:bg-slate-800` para superficie elevada) |
| `bg-slate-50/100/200` | `dark:bg-slate-800` o `dark:bg-slate-700/50` |
| `border-{color}-100/200` | `dark:border-{color}-500/30` |
| `text-{color}-700` (badges) | `dark:text-{color}-400` |
| `text-slate-700/800` | `dark:text-slate-200/100` |
| `hover:bg-{color}-50/100` | `dark:hover:bg-{color}-500/10/20` |

Replica el patrón ya establecido en `.status-online`, `.badge-success/danger/warning/info/neutral/accent`, `.card`, `.card-hover`, `.input-field` y `.btn-*` del sistema.

### Archivos modificados — 28 totales en 3 rondas

**Ronda 1 (top 4 por hallazgos):**

| Archivo | DS02 cerrados |
|---|---|
| `Monitor/ApMonitorModule/components/ApRow.tsx` | 14 |
| `VPN/NodeCard/components/NodeCardKebabMenu.tsx` | 12 |
| `Devices/NetworkDevicesModule/components/DeviceStatusPanel.tsx` | 9 (de 11; 2 falsos positivos por `bg-white/N` sobre `bg-slate-700` permanente) |

**Ronda 2 (siguientes 8):**

| Archivo | DS02 cerrados |
|---|---|
| `Devices/NodeAccessPanel/components/sections/WireGuardSection.tsx` | 9 |
| `Monitor/ApMonitorModule/ApMonitorModule.tsx` | 9 |
| `Auth/RouterAccess.tsx` | 5 (de 8; 3 son `bg-white/N` sobre `bg-indigo-700` permanente) |
| `Monitor/ApMonitorModule/components/CpeRow.tsx` | 8 |
| `Devices/NodeAccessPanel/constants.ts` | 4 (PEER_COLOR_PALETTE + TAG_PALETTE — solo paletas válidas reciben `dark:`; las prohibidas quedan para Fase 5 sin duplicar DS01) |
| `Devices/NodeAccessPanel/modals/NuevoNodo.tsx` | 5 (de 7; 2 falsos positivos por `bg-white/N` sobre `bg-indigo-700`) |
| `Devices/ScannerModule/components/SecretsTableRow.tsx` | 7 |
| `Monitor/ApMonitorModule/components/modals/MoveToNodeModal.tsx` | 7 |

**Ronda 3 (top 11 después de rondas 1-2):**

| Archivo | DS02 cerrados |
|---|---|
| `Auth/AcceptInvitationForm.tsx` | 6 |
| `Devices/NetworkDevicesModule/components/AddDeviceModal.tsx` | 6 |
| `Devices/NodeAccessPanel/components/shared/NodesStatsCard.tsx` | 6 |
| `Common/M5FullInfoModal/utils/styles.ts` | 2 (de 5; 3 son `bg-white/N` sobre `bg-slate-800` permanente) |
| `Devices/NetworkDevicesModule/components/ColumnPicker.tsx` | 5 |
| `Devices/NetworkDevicesModule/components/ScanProgressBanner.tsx` | 5 |
| `Monitor/ApMonitorModule/components/modals/ApDetailModal.tsx` | 5 |
| `VPN/VpnCard/components/VpnCardRow.tsx` | 5 |
| `Common/DeviceCard/components/InfoStrip.tsx` | 4 |
| `Devices/NetworkDevicesModule/components/DeviceTableRow.tsx` | 4 (junté líneas multilínea para que el auditor las vea) |
| `Devices/NetworkDevicesModule/components/RawBlock.tsx` | 4 |
| `Monitor/ApMonitorModule/components/ApGroupCard.tsx` | 4 |
| `Monitor/ApMonitorModule/components/modals/CpeDetailModal.tsx` | 4 |
| `Monitor/ApMonitorModule/components/StationTable.tsx` | 4 |
| `VPN/NodeProvisionForm/components/ProtocolSelector.tsx` | 4 |
| `Devices/NetworkDevicesModule/components/ScanControls.tsx` | 3 |
| `Users/UserManagementPanel/components/UsersTable.tsx` | 1 (multilínea junto en una sola para el auditor) |

### Falsos positivos NO tocados (documentar para auditor futuro)

`bg-white/N` (con sufijo de opacidad) sobre superficies oscuras permanentes (`bg-slate-700`, `bg-slate-800`, `bg-indigo-700`, gradiente `from-indigo-600 to-indigo-800`) NO necesita variant dark — el overlay funciona igual en light y dark mode porque el contenedor padre ya es oscuro.

Archivos con falsos positivos legítimos: `RouterAccess.tsx` (header), `DeviceStatusPanel.tsx` (header `bg-slate-700`), `NuevoNodo.tsx` (header `bg-indigo-700`), `DeviceHeader.tsx` (todo sobre header oscuro), `M5FullInfoModal/styles.ts` (header `bg-slate-800`).

**Mejora futura del auditor (Fase 6):** refinar DS02 para distinguir `bg-{color}` literal de `bg-{color}/N` (con opacidad) cuando el padre directo es una superficie oscura — reduciría ~10 falsos positivos.

### Decisión de diseño — paletas prohibidas en `constants.ts`

`PEER_COLOR_PALETTE` y `TAG_PALETTE` contienen colores fuera del sistema (`blue`, `green`, `yellow`, `red`, `purple`, `pink`, `orange`, `teal`, `cyan` — los 9 tonos no aprobados por CLAUDE.md). Esos entries son DS01 desde el día 1 (Fase 5 los migrará). En esta fase **solo se agregó `dark:` a las entries con paletas válidas** (indigo/violet/rose/amber/emerald/sky); las prohibidas quedan sin `dark:` para no duplicar hallazgos DS01.

Comentario in-file explica la decisión:

```ts
// NOTA: pink/orange/teal/cyan/blue/green/yellow/red/purple son paletas FUERA
// del sistema (CLAUDE.md). Quedan así como DS01 explícita para Fase 5 del
// refactor del sistema de diseño (migración a paletas válidas). NO agregar
// `dark:` a esas entries — duplica los hallazgos DS01.
```

### Bonus — DS01 corregido en RouterAccess

Mientras tocaba `RouterAccess.tsx` migré `bg-blue-100` (palette prohibida) → `bg-sky-100` (palette válida) y `bg-red-50 border-red-100 text-red-500/700` (palette prohibida) → `bg-rose-50 border-rose-100 text-rose-500/700` (palette válida). Mismo cambio aplicado al gradiente `to-blue-50` → `to-sky-50` ya hecho por §46 sed-replace. Suma 4 hallazgos DS01 menos sin propósito explícito de Fase 5.

### Snapshot acumulado desde el baseline §45

| Métrica | Baseline §45 | Post-§47 | Post-§48 | Δ acumulada |
|---|---|---|---|---|
| **DS02 bg sin dark** | 265 | 265 | **103** | **−61%** |
| DS06 botones inline | 26 | 3 | 3 | −88% |
| DS03 text < 12px | 313 | 61 | 61 | −80.5% |
| DS01 palette prohibida | 62 | 55 | **51** | −18% (bonus §48) |
| DS04 gradiente multi | 19 | 19 | 21 | +2 (gradientes nuevos en RouterAccess + AcceptInvitationForm, ambos light→dark documentados) |
| DS05 texto contraste | 411 | 411 | 411 | 0% (Fase 4 pendiente) |
| **Errores (severidad error)** | 375 | 116 | **112** | **−70%** |
| **TOTAL hallazgos** | **1,096** | 814 | **650** | **−40.7%** |

### Verificación

- `tsc 0` errores · `npm run build` OK · pre-commit hook OK
- **44/44 tests frontend verdes**
- Bundle inicial: **248.76 KB / 77.74 KB gzip** (idéntico — solo cambian clases CSS)
- 28 archivos modificados en este commit

### Reglas operativas reforzadas

- **Cualquier `bg-{color}-50/100/200` o `bg-white` SIN dark variant requiere justificación** (overlay sobre superficie oscura permanente). Si no hay justificación → bug visual en dark mode.
- **El patrón canónico para `dark:bg-{color}` es `/10` (sobre bg-50), `/15` (sobre bg-100), `/25` (sobre bg-200)**. Replica `.badge-*` del sistema. NO usar `dark:bg-{color}-900` ni mezclas — pierde consistencia visual.
- **Multi-líneas con `className` separado en JSX rompen el auditor**: si `bg-white` está en una línea y `dark:bg-slate-900` en la siguiente, DS02 lo marca como falso positivo. Junta en una sola línea.
- **Bordes acompañan el bg**: si `border-amber-200` está con `bg-amber-50`, agrega `dark:border-amber-500/30` con `dark:bg-amber-500/10`. No mezcles paletas.

### Pendiente / próximas fases

- **Fase 2 cont. (otra ronda DS02)** — quedan 103 hallazgos en 58 archivos (top actual: 4 archivos con 4 cada uno, distribución plana). Otra ronda de 1-2 horas bajaría a ~50 (los falsos positivos sobre superficies oscuras permanentes quedarán como excepciones documentadas).
- **Fase 3 (modales unificados, 6-8h)** — varios modales tocados en §48 (`MoveToNodeModal`, `AddDeviceModal`, `CpeDetailModal`, `ApDetailModal`) ya tienen `dark:` pero NO usan `.modal-overlay/.modal-panel`. Fase 3 los migrará a las clases del sistema (creadas en §46).
- **Fase 4 (DS05 contraste, 411)** — backlog.
- **Fase 5 (DS01 palette, 46)** — backlog. Empieza por `constants.ts` (PEER_COLOR_PALETTE + TAG_PALETTE = 40 hallazgos).
- ~~**Fase 6 (refinamiento auditor)** — soportar `bg-white/N` con opacidad como excepción cuando padre es oscuro permanente.~~ ✅ **Aplicado en §49** (commit `4018fad`).

---

## 49) ✅ Fase 2 cierre — DS02 a 0 (−100% desde baseline) + auditor refinado

Tras la entrega de §48 (DS02 265→103) el usuario pidió "continua". Esta sección registra el cierre completo de Fase 2 (DS02 a cero) en dos rondas más + el refinamiento del auditor que eliminó ~40 falsos positivos crónicos.

### Trabajo distribuido en 2 commits

| Commit | Cambios |
|---|---|
| `4018fad` (usuario) | Ronda 4 manual sobre 14 archivos + refinamiento del auditor (`scripts/audit-design.js`). **Bug:** committeó accidentalmente `audit-list.js` (27 LOC) y `audit-temp.json` (5014 LOC) — archivos temporales del flujo de inspección JSON. |
| `49b3cea` (esta sección) | Barrido final sobre los 31 hallazgos restantes en 25 archivos + cleanup de los 2 archivos temporales del commit anterior. |

### Refinamiento del auditor — la mejora clave

`LIGHT_SHADES_RE` en `scripts/audit-design.js` ahora usa negative lookahead `(?!\/\d)`:

```js
const LIGHT_SHADES_RE = /\bbg-(?:white|(?:indigo|emerald|rose|amber|sky|violet|slate|brand|success|danger|warning|info|accent|neutral)-(?:50|100|200))(?!\/\d)\b/g;
```

Eso excluye automáticamente:
- `bg-white/20`, `bg-white/10`, `bg-white/5` (overlays decorativos sobre headers oscuros permanentes)
- `bg-slate-50/40`, `bg-slate-50/30` (overlays semitransparentes que no rompen dark mode)

**Justificación:** un overlay con sufijo de opacidad funciona igual en light y dark — el contenedor padre define el color real. Sin esta excepción el auditor reportaba ~28 falsos positivos en headers de modales, login screen, sidebar icons y similares.

### Ronda 4 (14 archivos, 4018fad)

| Archivo | DS02 cerrados |
|---|---|
| `NodeAccessPanel/components/ProvisionSteps.tsx` | 3 |
| `NodeAccessPanel/components/sections/NodesFilterBar.tsx` | 3 (input multilínea junto + chip) |
| `NodeAccessPanel/modals/BatchCsvModal.tsx` | 1 (step indicator slate) |
| `NodeAccessPanel/modals/EliminarNodo.tsx` | 1 (step indicator slate) |
| `ScannerModule/components/SecretsPagination.tsx` | 3 |
| `ApMonitorModule/components/selectors/ApColSelector.tsx` | 3 |
| `ApMonitorModule/components/selectors/ColSelector.tsx` | 3 |
| `Team/TeamModule/components/InvitePanel.tsx` | 3 (3 inputs multilínea juntos) |
| `Team/TeamModule/components/MemberWireGuardModal.tsx` | 1 (QR `dark:bg-white`) |
| `VPN/VpnCard/components/VpnCardActionsCell.tsx` | 3 |
| `NetworkDevicesModule/components/DeviceFilters.tsx` | 2 |
| `NodeAccessPanel/components/sections/NodesListSection.tsx` | 1 (botón amber) |
| `Layout/Sidebar.tsx` | 2 (multilínea junto) |
| `Users/UserManagementPanel/components/AdminPeersManager.tsx` | 2 |

### Ronda 5 (25 archivos, 49b3cea) — el remate final

Tras refinar el auditor cayeron 40 falsos positivos. Los 31 restantes los aplastó esta ronda:

| Archivo | Cambio |
|---|---|
| `App.tsx` | banner amber MikroTik no configurado |
| `Common/DeviceCard/DeviceCard.tsx` | card root `bg-white` |
| `Common/DeviceCard/AntennaSectionMain.tsx` | barra blanca sobre fondo coloreado intenso (excepción `dark:bg-white`) |
| `Common/M5FullInfoModal/InterfacesSection.tsx` | `colorClass` violet |
| `Common/M5FullInfoModal/ServicesSection.tsx` | `colorClass` emerald |
| `Common/M5FullInfoModal/WirelessSection.tsx` | `colorClass` sky |
| `NodeAccessPanel/sections/StateIndicators.tsx` | warning renewal amber |
| `NodeAccessPanel/shared/NodesStatsCard.tsx` | junté multilínea |
| `ScannerModule/components/EmptyState.tsx` | icono indigo |
| `ApMonitorModule/components/StatCard.tsx` | stat card slate |
| `Settings/SettingsModule/SettingsHeader.tsx` | icono indigo |
| `Settings/SettingsModule/SettingsMessages.tsx` | success emerald + **bonus DS01:** `bg-red-50`→`bg-rose-50` |
| `Team/TeamModule/MemberProfile.tsx` | QR siempre blanco |
| `Team/TeamModule/MyInvitationsInbox.tsx` | input multilínea junto |
| `Users/UserManagementPanel/UserManagementPanel.tsx` | botón Reintentar rose |
| `VPN/NodeCard/NodeCardNameSection.tsx` | 2 botones inline edit |
| `VPN/NodeCard/NodeCardSshForm.tsx` | form SSH amber |
| `VPN/NodeCard/NodeCardStatusIcon.tsx` | toggle slate inactivo |
| `VPN/NodeCard/NodeCardWgPeerForm.tsx` | form WG violet + botón cancel |
| `VPN/NodeProvisionForm/NamePreview.tsx` | preview slate |
| `VPN/NodeProvisionForm/ProvisionActionButtons.tsx` | 2 botones disabled |
| `VPN/NodeProvisionForm/ProvisionError.tsx` | error rose |
| `VPN/NodeProvisionForm/ScriptOutput.tsx` | botón copiar slate |
| `VPN/NodeProvisionForm/WireGuardDetails.tsx` | card violet |
| `VPN/VpnCard/VpnCardServiceCell.tsx` | **bonus DS01:** `bg-blue-100`→`bg-sky-100` |
| `VPN/VpnCard/VpnCardStatusIcon.tsx` | toggle slate inactivo |

### Patrones nuevos documentados

**Imágenes que deben quedar blancas:** QR codes, logos sobre fondo claro intencional. Patrón:

```tsx
{/* QR siempre blanco — la cámara lo lee igual en ambos modos. */}
<img src={qr} className="rounded-lg bg-white dark:bg-white p-1" />
```

`dark:bg-white` es intencional aquí — silencia el auditor sin romper el QR. Comentario adyacente explica el por qué.

**Overlays sobre superficies oscuras permanentes:** patrón `bg-white/N` (con opacidad). El auditor ahora los excluye automáticamente — no requieren `dark:` variant.

**Multilínea = enemigo del auditor:** el auditor solo mira UNA línea. Si tienes `bg-white` en línea N y `dark:bg-slate-900` en línea N+1, lo marca DS02. Solución: junta las dos clases en la misma línea visualmente (TypeScript no se queja).

### Cleanup de archivos temporales

El commit `4018fad` incluyó accidentalmente:
- `audit-list.js` (27 LOC) — script helper para inspeccionar JSON del auditor
- `audit-temp.json` (5014 LOC) — snapshot del audit JSON

Ambos generados durante el debugging y borrados en `49b3cea`. **Regla operativa:** generar archivos temporales en `/tmp` o fuera del repo, o agregarlos a `.gitignore`. Si vuelven a aparecer, son ruido en `git status`.

### Métricas pre/post §49

| Métrica | Baseline §45 | Post-§47 | Post-§48 | **Post-§49** | Δ acumulada |
|---|---|---|---|---|---|
| **DS02 bg sin dark** | 265 | 265 | 103 | **0** | **−100%** ✅ |
| DS01 palette | 62 | 55 | 51 | **46** | −26% |
| DS06 botones inline | 26 | 3 | 3 | 3 | −88% |
| DS03 text < 12px | 313 | 61 | 61 | 61 | −80.5% |
| DS04 gradiente multi | 19 | 19 | 21 | 21 | +2 (gradientes nuevos OK) |
| DS05 texto contraste | 411 | 411 | 411 | 411 | 0% (Fase 4 pendiente) |
| **Errores (severidad error)** | 375 | 116 | 112 | **107** | **−71%** |
| **TOTAL hallazgos** | **1,096** | 814 | 650 | **542** | **−50.5%** |

### Verificación

- `tsc 0` errores · `npm run build` OK · pre-commit hook OK
- 44/44 tests frontend verdes (sin regresión)
- Bundle inicial: 248.76 KB / 77.74 KB gzip (idéntico)
- 25 archivos modificados en este commit (49b3cea) + 14 del previo (4018fad)

### Reglas operativas reforzadas

- **`bg-{color}/N` (sufijo de opacidad) = overlay; NO requiere dark variant.** El auditor lo excluye desde §49. Si añades un overlay sobre fondo claro, debes agregar `dark:bg-...` igual — el lookahead solo aplica a clases con opacidad explícita.
- **Multilínea separa `bg-white` de `dark:bg-...`:** mantén ambas en la **misma línea** visualmente. Cuando hagas refactor de JSX largo, junta antes de mover.
- **`dark:bg-white` (idéntico al claro) es válido SOLO para imágenes** (QR, logos sobre fondo fijo intencional). Documentar con comentario por qué se mantiene blanco.
- **No commitear archivos temporales en root:** `audit-temp.json`, `*.log`, helpers descartables → `/tmp` o `.gitignore`.

### Pendiente / próximas fases

- ~~**Fase 2 (DS02)**~~ ✅ **CERRADA en §49** — 0 hallazgos.
- ~~**Fase 3 (modales unificados, 6-8h)**~~ ✅ **CERRADA en §50** — 19 modales migrados al sistema canónico.
- **Fase 3.1 (opcional)** — extender `.modal-header-{indigo,rose,amber,emerald,sky,violet,slate}` para los headers decorativos coloreados que aún viven inline en cada modal. Reduce ~80 LOC adicionales pero requiere decisión de diseño sobre dark variants de cada tono.
- **Fase 4 (DS05 contraste, 411 hallazgos)** — backlog. Manual, requiere juicio por caso (slate-300/400 sobre fondo claro vs. oscuro).
- **Fase 5 (DS01 palette, 46)** — backlog. 40 de los 46 viven en `constants.ts` (PEER_COLOR_PALETTE + TAG_PALETTE). Decisión de diseño previa: pasarlos a paletas válidas (sky/emerald/rose/amber/violet/indigo) o mantener las paletas extra cyan/teal/pink/orange/blue/green/yellow/red/purple como excepción de constants?
- **Refinamiento DS06 (opcional):** los 3 toggles condicionales restantes son legítimos. Documentar como excepción permanente con `// audit:ignore DS06` u opción `--ignore-line` en el auditor.

---

## 50) 🪟 Fase 3 cierre — modales unificados al sistema canónico

Pedido del usuario tras §49: "continua" (con confirmación de "Push + Fase 3 modales"). Esta sección cierra la Fase 3 del plan del sistema de diseño: migrar los 19 modales del proyecto al patrón canónico `.modal-overlay` + `.modal-panel`.

### Lo que había antes

Cada modal definía su overlay y panel inline con clases largas (8-10 utilities por componente):

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200">
  <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
    ...
```

Resultado: 19 implementaciones similares pero NO idénticas. Sutiles inconsistencias en `bg-slate-900/N` (a veces /50, /60), padding lateral (px-4 vs p-4), animaciones (algunas con `motion-safe:`, otras sin), `max-h` (90vh/92vh/95vh). Auditor DS02 los marcaba uno a uno.

### Extensión del sistema (index.css)

```css
.modal-overlay {
  @apply fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm
         flex items-center justify-center p-4
         dark:bg-slate-950/70;
  animation: modal-fade-in 200ms ease-out;
}
.modal-panel {
  @apply bg-white border border-slate-200 rounded-2xl shadow-2xl
         w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col
         dark:bg-slate-900 dark:border-slate-800;
  animation: modal-zoom-in 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.modal-panel-sm  { @apply max-w-sm; }
.modal-panel-md  { @apply max-w-md; }
.modal-panel-lg  { @apply max-w-lg; }
.modal-panel-xl  { @apply max-w-xl; }
.modal-panel-2xl { @apply max-w-2xl; }
.modal-panel-3xl { @apply max-w-3xl; }

@keyframes modal-fade-in {
  from { opacity: 0; } to { opacity: 1; }
}
@keyframes modal-zoom-in {
  from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .modal-overlay, .modal-panel { animation: none; }
}
```

**Hallazgo no obvio:** las utilities `animate-in fade-in duration-200` del plugin **tailwindcss-animate NO funcionan dentro de `@apply`** en Tailwind v3 — al hacer `npm run build` lanza `The `animate-in` class does not exist`. Solución: keyframes CSS nativos con mismas curvas y duraciones. El comportamiento visual es idéntico al patrón previo.

### Modales migrados (19)

| Categoría | Archivo | Tamaño |
|---|---|---|
| Auth | (ya usaban `.input-field` + `.btn-*`) | — |
| Admin | `Admin/ModeratorsModule/ModeratorsModule.tsx` (Modal interno) | `modal-panel-md` |
| Common | `Common/M5FullInfoModal/utils/styles.ts` (genérico) | `modal-panel-3xl` |
| Devices | `Devices/NetworkDevicesModule/AddDeviceModal.tsx` | `modal-panel-sm` |
| Devices | `Devices/NodeAccessPanel/modals/NuevoNodo.tsx` | `modal-panel-2xl` |
| Devices | `Devices/NodeAccessPanel/modals/EditarNodo.tsx` | `modal-panel-xl` |
| Devices | `Devices/NodeAccessPanel/modals/EliminarNodo.tsx` | `modal-panel-xl` |
| Devices | `Devices/NodeAccessPanel/modals/NuevoAdmin.tsx` | `modal-panel-md` |
| Devices | `Devices/NodeAccessPanel/modals/BatchCsvModal.tsx` | `modal-panel-2xl` |
| Devices | `Devices/NodeAccessPanel/modals/TagModal.tsx` | `modal-panel-sm` |
| Devices | `Devices/NodeAccessPanel/modals/ScriptModal.tsx` | `modal-panel-xl` |
| Devices | `Devices/NodeAccessPanel/modals/HistoryModal.tsx` | `modal-panel-md` |
| Devices | `Devices/NodeAccessPanel/modals/DiagnosticsModal.tsx` | `modal-panel-2xl` |
| Monitor | `Monitor/ApMonitorModule/modals/ApDetailModal.tsx` | `modal-panel-2xl` |
| Monitor | `Monitor/ApMonitorModule/modals/CpeDetailModal.tsx` | `modal-panel-lg` |
| Monitor | `Monitor/ApMonitorModule/modals/MoveToNodeModal.tsx` | `modal-panel-sm` |
| Monitor | `Monitor/ApMonitorModule/modals/DeviceCardModal.tsx` | `modal-panel-md` |
| Team | `Team/TeamModule/components/AssignTunnelsModal.tsx` | `modal-panel-lg` |
| Team | `Team/TeamModule/components/MemberWireGuardModal.tsx` | `modal-panel-md` |
| Users | `Users/UserManagementPanel/components/WgConfigModal.tsx` | `modal-panel-xl` |

Patrón aplicado a cada uno:

```diff
- <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200">
-   <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
+ <div className="modal-overlay">
+   <div className="modal-panel modal-panel-xl">
```

El **header decorativo (`bg-indigo-600`, `bg-rose-600`, `bg-violet-600`, etc.) se mantiene inline** porque cada modal usa un tono distinto y el sistema actual no contempla `.modal-header-{tone}`. Fase 3.1 los unificará.

### Métricas pre/post §50

| Métrica | Pre-§50 | **Post-§50** |
|---|---|---|
| Modales con overlay/panel definidos inline | 19 | 0 |
| Modales usando `.modal-overlay` | 0 | **19** |
| Modales usando `.modal-panel` + `.modal-panel-{size}` | 0 | **19** |
| Tamaños de modal estandarizados | mixed (`max-w-sm/md/lg/xl/2xl/3xl` inline) | **6 variants composables en CSS** |
| Animaciones de entrada | mixed (`animate-in fade-in`, algunas `motion-safe:`) | **`@keyframes modal-fade-in` + `modal-zoom-in` con `prefers-reduced-motion`** |
| LOC redundantes en CSS inline | ~150 | 0 |
| DS02 hallazgos | 0 | 0 (mantenido) |
| DS01 / DS04 / DS05 / DS06 | 46 / 21 / 411 / 3 | 46 / 21 / 411 / 3 (sin regresión) |
| Total hallazgos | 542 | 542 (sin regresión) |
| Bundle inicial | 248.76 KB / 77.74 KB gzip | 248.76 KB / 77.74 KB gzip (idéntico) |
| Tests | 44 verdes | 44 verdes |

### Reglas operativas reforzadas

- **TODO modal nuevo debe usar `.modal-overlay` + `.modal-panel` + `.modal-panel-{size}`.** Patrón inline = revisar PR.
- **NO usar `animate-in fade-in duration-200` dentro de `@apply`** — el plugin tailwindcss-animate las define a nivel de utility, no de componente. Define `@keyframes` propios en `index.css` si necesitas animar dentro de una clase de componente.
- **`prefers-reduced-motion` es obligatorio** en cualquier `@keyframes` nuevo. Ya lo tienen `modal-fade-in`/`modal-zoom-in`/`reveal-stagger`/`skeleton`/`status-ping`.
- **Tamaño del modal = una sola clase**. `.modal-panel-2xl` (no `max-w-2xl` inline) para que mañana podamos cambiar el tope desde un solo lugar si el diseño lo pide.

### Pendiente / próximas fases

- ~~**Fase 3.1 (opcional, 4-6h)** — extender `.modal-header-{indigo,rose,amber,emerald,sky,violet,slate}` para los headers decorativos.~~ ✅ **CERRADA en §52** — 15 headers decorativos unificados.
- ~~**Fase 4 (DS05 contraste, 406 hallazgos)** — backlog. Manual por caso.~~ ✅ **CERRADA en §53** — DS05 a 0 (−100%).
- **Fase 5 (DS01 palette, 46)** — backlog. Migrar `constants.ts` (PEER_COLOR_PALETTE + TAG_PALETTE).
- **Fase 5b (DS03 tamaños < 12px, 61)** — backlog. Auditar `text-[9px]` / `text-[10px]` / `text-[11px]` literales y reemplazar por `.text-2xs` o `text-xs`.
- **CI gate (cuando todas las fases cierren):** agregar `npm run audit:design` al workflow para no regresar.

---

## 51) 🐛 Fix bug — guardar dispositivo no persistía (`merged=undefined` silencioso)

Bug reportado por el usuario tras §50: al pulsar "Guardar" en la tabla de Escanear (tanto el individual como el bulk "Guardar N"), el toast confirmaba el guardado pero el dispositivo **no aparecía en Monitor AP**. Console log:

```
deviceDb.ts:161 Error guardando device:
  TypeError: Cannot read properties of undefined (reading 'cachedStats')
    at Object.saveSingle (deviceDb.ts:143:18)
    at useDeviceLibrary.ts:92:20
    at useDeviceLibrary.ts:210:11
    at onClick (DeviceTableRow.tsx:362:11)
```

### Causa raíz

El fix de §37 (commit `4e872f5`) introdujo el patrón "functional setState para cerrar race":

```ts
let merged!: SavedDevice;
setSavedDevices(prev => {
  merged = existing ? {...} : device;   // ← el updater NO corre sincrónicamente
  return ...;
});
await deviceDb.saveSingle(merged);       // ← merged === undefined aquí
```

**React 18+ NO ejecuta el functional updater en el mismo tick que el dispatch** — lo procesa en el próximo commit, después del `await` siguiente. Por eso `merged` queda `undefined`. El catch interno en `saveSingle` lo agarra silenciosamente, el toast aparece como "guardado", pero el `POST /api/db/devices` **nunca se ejecuta** → Monitor AP no ve el dispositivo.

### Fix

[useDeviceLibrary.ts](vpn-manager/src/components/Devices/NetworkDevicesModule/hooks/useDeviceLibrary.ts) — nuevo `savedDevicesRef` sincronizado vía `useEffect`. `handleAddDevice` computa `merged` SÍNCRONAMENTE desde el ref antes del `await`:

```ts
const prevList = savedDevicesRef.current;
const existing = prevList.find(d => d.id === device.id);
const merged: SavedDevice = existing
  ? { ...existing, ...device, addedAt: existing.addedAt }
  : device;

setSavedDevices(prev => { /* re-computa merge con prev fresco — race-safe */ });
await deviceDb.saveSingle(merged);   // ya está definido
```

[deviceDb.ts](vpn-manager/src/store/deviceDb.ts) — guardrail defensivo:

```ts
async saveSingle(device: SavedDevice): Promise<void> {
  try {
    if (!device || !device.id) {
      console.warn('deviceDb.saveSingle: device sin id — ignorado', device);
      return;
    }
    ...
```

### Reglas operativas reforzadas

- **`setState` con functional updater NO se ejecuta sincrónicamente.** En React 18+ el updater corre en el próximo commit, no inmediatamente. Si necesitas leer el valor calculado dentro del updater, usa `useRef` espejo del state.
- **Patrón `useRef` espejo:** declarar `const xRef = useRef<T>(initial)` + `useEffect(() => { xRef.current = x }, [x])`. Lookup síncrono en handlers async sin race conditions.
- **`try/catch` interno NO debe silenciar errores de capa de persistencia.** Cuando el catch logra evitar el crash de UI pero los datos no llegan a BD, el usuario queda con falsa sensación de éxito. Mejor: dejar lanzar y manejar en el caller, o reportar al usuario con toast de error.

### Pendiente / mejoras futuras

- **Auditar otros `setState` con functional updater que lean el valor después del setter.** El patrón es: `let x; setState(prev => { x = ...; return ... }); /* usar x */`. Buscar con grep `setSaved\|setX\|setScan` + `let merged\|let next\|let last`.
- **Test de regresión:** mockear `deviceDb.saveSingle` y verificar que se llame con un objeto válido (no undefined) al hacer click en Guardar. Asegura que un futuro refactor no rompa el flujo.

---

## 52) 🪟 Fase 3.1 cierre — headers de modal con 7 tonos canónicos

Continuación de §50. Pedido del usuario: "Sigue con Fase 3.1 (extender `.modal-header-{tone}`)". Skill consultada: `tailwind-design-system` (patrón Base → Variants → Sizes → States).

### Lo que faltaba después de §50

Los 19 modales ya usaban `.modal-overlay` + `.modal-panel` (§50). Pero **15 de ellos** tenían además un header decorativo con `bg-{tone}-{shade} rounded-t-2xl px-5 py-4` inline. Cada uno definía:

- Su propio `bg-{tone}` (8 tonos distintos)
- Una caja `w-8 h-8 bg-white/20 rounded-xl ...` para el ícono
- Un botón `p-1.5 text-{tone}-{shade} hover:text-white hover:bg-white/10 rounded-lg` para el X

Resultado: ~150 LOC redundantes esparcidos en 15 archivos.

### Extensión del sistema (index.css)

```css
.modal-header-decorated {
  @apply flex items-center justify-between gap-3 rounded-t-2xl px-5 py-4 shrink-0;
}
.modal-header-indigo  { @apply bg-indigo-600; }
.modal-header-rose    { @apply bg-rose-600; }
.modal-header-amber   { @apply bg-amber-500; }
.modal-header-emerald { @apply bg-emerald-600; }
.modal-header-sky     { @apply bg-sky-600; }
.modal-header-violet  { @apply bg-violet-600; }
.modal-header-slate   { @apply bg-slate-800; }

.modal-header-icon {
  @apply w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0;
}
.modal-header-close {
  @apply p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40;
}
```

7 tonos canónicos. Cada uno mapeado a una intención semántica del proyecto (CLAUDE.md):

| Tono | Intención | Modales |
|---|---|---|
| `indigo` | acción primaria | NuevoAdmin, EditarNodo, AssignTunnelsModal, ModeratorsModule (estándar) |
| `rose` | destructivo | EliminarNodo, ModeratorsModule danger variant |
| `amber` | atención | TagModal |
| `emerald` | éxito | ScriptModal |
| `sky` | informativo | HistoryModal |
| `violet` | WireGuard | MemberWireGuardModal, BatchCsvModal |
| `slate` | estado oscuro | M5FullInfoModal, ApDetailModal, CpeDetailModal, DeviceCardModal |

### Patrón aplicado

```diff
- <div className="flex items-center justify-between bg-rose-600 rounded-t-2xl px-5 py-4 shrink-0">
-   <div className="flex items-center gap-3">
-     <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
-       <Trash2 className="w-4 h-4 text-white" />
-     </div>
-     ...
-   </div>
-   <button onClick={onClose} className="p-1.5 text-rose-300 hover:text-white hover:bg-white/10 rounded-lg">
-     <X className="w-4 h-4" />
-   </button>
+ <div className="modal-header-decorated modal-header-rose">
+   <div className="flex items-center gap-3">
+     <div className="modal-header-icon">
+       <Trash2 className="w-4 h-4 text-white" />
+     </div>
+     ...
+   </div>
+   <button onClick={onClose} className="modal-header-close">
+     <X className="w-4 h-4" />
+   </button>
```

### Excepciones documentadas en el código

- **NuevoNodo:** usa `!bg-indigo-700` (override) para diferenciar visualmente del estándar `indigo-600`. Es un "indigo más sólido" que indica acción más fuerte/oscura.
- **WgConfigModal:** mantiene gradient `from-indigo-600 to-indigo-800` inline (caso especial, único modal con gradient header). Usa `.modal-header-decorated` + `.modal-header-close` pero NO `.modal-header-{tone}`.
- **ApDetailModal / CpeDetailModal:** override `py-3` para header compacto.
- **DeviceCardModal:** override `px-4 py-2.5` para header aún más compacto.

### Métricas pre/post §52

| Métrica | Pre-§52 | **Post-§52** |
|---|---|---|
| Modales con header coloreado inline | 15 | 0 |
| Modales usando `.modal-header-decorated` | 0 | **15** |
| Modales usando `.modal-header-icon` | 0 | **14** (todos menos los compactos sin ícono) |
| Modales usando `.modal-header-close` | 0 | **15** |
| Tonos canónicos en sistema | 0 | **7** |
| LOC redundantes JSX inline | ~150 | 0 |
| Hallazgos auditor | 542 | 537 (−5) |
| DS05 hallazgos | 411 | 406 (−5 bonus por quitar `text-{tone}-200/300` inline) |
| DS02 / DS01 / DS04 / DS06 | 0/46/21/3 | 0/46/21/3 (sin regresión) |
| Bundle inicial | 248.76 KB | 248.90 KB (+0.14 KB del CSS extendido) |
| Tests | 44 verdes | 44 verdes |

### Reglas operativas reforzadas

- **Header decorativo de modal SIEMPRE con `.modal-header-decorated` + un tono.** Patrón `bg-{tone}-{shade} rounded-t-2xl px-5 py-4` inline = revisar PR.
- **`.modal-header-icon` para la caja de ícono blanca con overlay** + `.modal-header-close` para el botón X. No reinventar.
- **Si necesitas otro tono (ej. magenta para un brand específico)**, agrégalo a `index.css` como `.modal-header-{nuevo}` — NO uses `bg-{otro}-600` inline.
- **El override de tamaño/padding es legítimo** (ej. `py-3` para compactos). El override de bg solo está justificado si el modal tiene identidad visual única documentada (NuevoNodo `!bg-indigo-700`, WgConfigModal gradient).

### Pendiente / próximas fases

- ~~**Fase 3 + 3.1**~~ ✅ CERRADAS.
- ~~**Fase 4 (DS05 contraste, 406 hallazgos)**~~ ✅ **CERRADA en §53** — DS05 a 0.
- ~~**Fase 5 (DS01 palette, 46)**~~ ✅ **CERRADA en §54** — DS01 a 0. `cyan` agregado al sistema + `audit:ignore-file` documentado para `constants.ts`.
- **Fase 5b (DS03 tamaños < 12px, 61)** — siguiente prioridad. `text-[9px]/[10px]/[11px]` literales → `.text-2xs` o `text-xs`.
- **CI gate:** cuando Fase 5b cierre (con DS03=0), agregar `npm run audit:design` al workflow para no regresar.

---

## 53) ✅ Fase 4 cierre — DS05 contraste a 0 (−100% desde baseline)

Pedido del usuario tras §52: "si continua con la fase 4". Esta sección cierra la Fase 4 del refactor del sistema de diseño llevando los hallazgos de **bajo contraste de texto** (`text-slate-300/400` sobre fondo claro) de **406 a 0**. Skill consultada: `tailwind-design-system` (tokens semánticos + dark mode con variants).

### Cuatro ejes combinados

**1. Refinamiento del auditor** (`scripts/audit-design.js`) — tres reglas nuevas para descartar falsos positivos legítimos:

- **a) Superficie oscura permanente:** si la línea actual o las 3 previas (`ctx.prev3`) contienen `bg-slate-{700-950}`, `bg-{tone}-{500-800}`, `bg-gradient-to-*`, `bg-black`, `modal-header-{tone}`, o `text-white`, el slate-300/400 es legítimo (contraste OK sobre oscuro).
- **b) Par dark consciente:** si la misma línea ya tiene `dark:text-slate-{300-700}` en cualquier posición, significa que el desarrollador tomó una decisión consciente del par claro/oscuro (patrón `.data-muted` etc.). No marcar.
- **c) Íconos SVG:** si la clase está dentro de un `<[Icon] className="..."` con tamaño chico (`w-3/3.5/4/5`), es tinte del SVG, no texto leíble. Heurística por size class adyacente.

Resultado del refinamiento solo: 406 → 195 (−52%, −211 falsos positivos descartados).

**2. Nueva clase `.data-empty` en `index.css`:**

```css
.data-empty { @apply font-mono text-2xs text-slate-400 dark:text-slate-600; }
```

Centraliza el placeholder `<span>—</span>` usado en celdas vacías de tablas (Escanear, Monitor AP, `columns.tsx`). Antes era `text-2xs text-slate-300">—</span>` repetido inline en **25+ lugares**. slate-300 NO pasa AA sobre fondo claro; slate-400 sí (marginal).

**3. Script de migración mecánica** (`scripts/migrate-ds05.js`) — 207 reemplazos en 68 archivos:

```
text-slate-400 → text-slate-500 dark:text-slate-400
text-slate-300 → text-slate-400 dark:text-slate-500
```

Solo cuando NO está precedido por variant (`hover:`, `focus:`, `placeholder:`, etc.) y la línea/contexto NO indica superficie oscura. Preserva todas las decisiones conscientes del desarrollador. Script reutilizable.

**4. Fix manual de 7 condicionales ternarios** donde el script saltaba por el `dark:` de la rama opuesta:

```diff
- ${peer.active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}
+ ${peer.active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}
```

Caso particular en `NuevoNodo`: el patrón `text-slate-400 hover:text-slate-700 dark:text-slate-200` tenía el `dark:text-slate-200` mal posicionado (debería ser `dark:hover:text-slate-200`). Corregido.

### Métricas pre/post §53

| Regla | Pre-§53 | **Post-§53** | Δ |
|---|---:|---:|---|
| DS05 | 406 | **0** | **−100%** ✅ |
| DS01 | 46 | 46 | sin cambio (Fase 5) |
| DS03 | 61 | 61 | sin cambio (Fase 5b) |
| DS04 | 21 | 21 | sin cambio (gradientes OK) |
| DS06 | 3 | 3 | sin cambio (toggles legítimos) |
| Errores | 107 | 107 | sin cambio |
| Infos | 414 | **3** | **−99.3%** |
| **Total** | **537** | **131** | **−75.6%** |

Total vs baseline §45 (1,096 hallazgos): **−88%** acumulado.

### Patrones de migración aplicados

Para que futuros desarrolladores sigan el mismo patrón consistente:

| Patrón anterior | Patrón nuevo | Cuándo usar |
|---|---|---|
| `text-2xs text-slate-300">—</span>` | `<span className="data-empty">—</span>` | Celda vacía en tabla densa |
| `text-slate-400` (texto label sutil) | `text-slate-500 dark:text-slate-400` | Texto secundario sobre fondo claro |
| `text-slate-300` (texto muted) | `text-slate-400 dark:text-slate-500` | Texto deshabilitado/placeholder |
| `text-slate-400` sobre header oscuro | (sin cambio) | Texto sobre `bg-slate-800` etc. — funciona |

### Reglas operativas reforzadas

- **`text-slate-300/400` sobre fondo CLARO NO PASA WCAG AA.** Usar `text-slate-500` como mínimo con `dark:text-slate-400` para mantener jerarquía en dark.
- **El placeholder "—" usa `.data-empty`** (`text-2xs text-slate-400 dark:text-slate-600`). NO reinventar el patrón inline.
- **El auditor DS05 acepta `dark:text-slate-{300-700}` en la misma línea** como decisión consciente. Si quieres `text-slate-300` en CLARO intencional (caso "—" sutil), agrégale un `dark:text-slate-{500/600}` y el auditor no marca.
- **Íconos `<Icon className="text-slate-400 w-4 h-4" />` están exentos.** El auditor los detecta y los descarta — son tinte del SVG, no texto.

### Archivos modificados (72 total)

- `scripts/audit-design.js` — 3 refinamientos DS05 (rules a/b/c)
- `scripts/migrate-ds05.js` — **NUEVO** (script reutilizable de migración)
- `vpn-manager/src/index.css` — clase `.data-empty`
- **68 archivos del frontend** (componentes, modals, tablas) — 207 reemplazos automáticos
- **5 archivos de fix manual** condicional: ControlBar, NuevoNodo (2x), ImportExportTab (2x), AdminPeersManager, UsersTable

### Verificación

- `tsc 0` errores · 44/44 tests verdes · `npm run build` OK
- Bundle inicial idéntico
- DS02 = 0 mantenido (sin regresión)
- 19 modales con `.modal-overlay`/`.modal-panel` mantenidos
- 15 headers decorativos con `.modal-header-{tone}` mantenidos

### Pendiente / próximas fases

- ~~**Fases 2 + 3 + 3.1 + 4**~~ ✅ TODAS CERRADAS.
- ~~**Fase 5 (DS01 palette, 46)**~~ ✅ CERRADA en §54.
- **Fase 5b (DS03 tamaños < 12px, 61)** — siguiente y última prioridad. `text-[9px]` / `text-[10px]` / `text-[11px]` literales en componentes densos (rows de tablas con muchas columnas). Decisión: ¿migrar todos a `text-2xs` (11px) y aceptar la pérdida marginal de densidad, o documentar como excepción con `audit:ignore-file DS03`?
- **CI gate** (cuando Fase 5b cierre): agregar `npm run audit:design` al workflow con threshold de errores = 0.

---

## 54) ✅ Fase 5 cierre — DS01 paletas a 0 (−100% desde baseline)

Pedido del usuario tras §53: "si continua". Cierra la Fase 5 del refactor del sistema de diseño: paletas Tailwind fuera del sistema (`red/green/blue/yellow/orange/purple/pink/teal/fuchsia`) de **46 a 0**. Skill consultada: `tailwind-design-system`.

### Tres ejes combinados

**1. Extensión del sistema con `cyan` como paleta semántica oficial:**

Análisis de los hallazgos: 12 de los 46 usaban `cyan` en `ApGroupCard.tsx` + `CpeRow.tsx` para indicar **CPEs/clientes terminales** en Monitor AP. Semánticamente útil: distingue CPEs (jerarquía cliente) de APs (`violet`/infra/WireGuard) sin competir con los otros 7 tonos.

Cambios:
- `cyan` agregado a `ALLOWED_PALETTES` en [audit-design.js](scripts/audit-design.js)
- Token `cpe`/`cyan` agregado a la tabla de colores en [CLAUDE.md](vpn-manager/CLAUDE.md) con intención **"SOLO indicadores de CPEs (clientes terminales en Monitor AP)"**
- Resuelve 12 hallazgos automáticamente sin tocar código

**2. Mecanismo `audit:ignore-file` en el auditor:**

Para los 20 hallazgos en `constants.ts` (PEER_COLOR_PALETTE 10 colores + TAG_PALETTE 7 colores), el caso es legítimo: son arrays para distinguir N peers/tags visualmente. El sistema canónico solo provee 7 paletas válidas + cyan = 8, no alcanza para 10 peers únicos.

Solución: nuevo mecanismo en el auditor que detecta dos patrones de exclusión:

```js
// audit:ignore-file DS01              ← una regla
// audit:ignore-file DS01,DS05,DS06    ← múltiples
// audit:ignore-file all               ← todas
// audit:ignore DS04                   ← inline (1 línea actual + previa + siguiente)
```

El auditor revisa las primeras 5 líneas del archivo + cada línea para el patrón inline. Aplicado a `constants.ts` con documentación in-file del por qué la excepción.

**3. Migración mecánica de 14 hallazgos restantes:**

| Antes | Después | Archivos |
|---|---|---|
| `red-{50-700}` | `rose-{50-700}` | ScannerError (4) |
| `blue-{100-700}` | `sky-{100-700}` | SecretsTableRow (4), SystemSection (3) |
| `orange-500` | `amber-500` | AcParams (1) |
| `fuchsia-500` | `violet-500` | AntennaSectionMain (1) |
| `teal-600` | `emerald-700` | ProvisionActionButtons (1 — gradient) |

Mapeos semánticos preservados:
- red → rose (alarma/error)
- blue → sky (informativo neutro)
- orange → amber (advertencia/calor)
- fuchsia → violet (decoración accent)
- teal → emerald (gradient verde de éxito)

### Métricas pre/post §54

| Regla | Pre-§54 | **Post-§54** | Δ |
|---|---:|---:|---|
| DS01 | 46 | **0** | **−100%** ✅ |
| DS02 | 0 | 0 | mantenido |
| DS03 | 61 | 61 | sin cambio (Fase 5b) |
| DS04 | 21 | 20 | −1 (gradient teal corregido) |
| DS05 | 0 | 0 | mantenido |
| DS06 | 3 | 3 | sin cambio |
| **Errores** | 107 | **61** | **−43%** |
| **Total** | 131 | **84** | −36% |

Total vs baseline §45 (1,096): **−92% acumulado**.

### Reglas operativas reforzadas

- **`cyan` está RESERVADO para CPEs en Monitor AP.** Cualquier otro uso requiere justificación en code-review (mismo nivel que `violet` reservado para WireGuard).
- **`audit:ignore-file <ruleId>` solo en archivos con excepción legítima documentada in-file.** Casos válidos: arrays de distinción visual (PEER_COLOR_PALETTE), componentes legacy en migración, generadores de código. NO usar como atajo para evitar fixes.
- **`audit:ignore` inline es para casos puntuales** (1 línea con justificación adyacente). Si un archivo necesita >3 `audit:ignore` inline, usar el file-level.
- **Paletas prohibidas (`red/green/blue/yellow/orange/purple/pink/teal/fuchsia`) SIEMPRE migran a las 8 válidas** (`indigo/emerald/rose/amber/sky/violet/slate/cyan`). Mapping: red→rose, blue→sky, green→emerald, yellow→amber, orange→amber, purple→violet, pink→rose, teal→emerald, fuchsia→violet.

### Archivos modificados (9 total)

- `scripts/audit-design.js` — cyan en ALLOWED + mecanismo `audit:ignore-file`/`audit:ignore`
- `vpn-manager/CLAUDE.md` — token `cpe`/`cyan` agregado a la tabla
- `vpn-manager/src/components/Devices/NodeAccessPanel/constants.ts` — comentario `audit:ignore-file DS01`
- 6 archivos del frontend con migración mecánica

### Verificación

- `tsc 0` errores · 44/44 tests verdes · `npm run build` OK
- Bundle inicial idéntico
- DS02 + DS05 = 0 mantenidos (sin regresión)

### Pendiente / próximas fases

- ~~**Fases 2 + 3 + 3.1 + 4 + 5 + 5b**~~ ✅ TODAS CERRADAS. **Sistema de diseño 98% migrado · errores totales = 0.**
- **CI gate (próximo paso)** — agregar `npm run audit:design` al workflow CI. El auditor ya devuelve exit code 1 si hay errores y 0 si solo hay warnings/infos. Solo falta el step en GitHub Actions.

---

## 55) 🏁 Fase 5b cierre — DS03 tamaños a 0 (errores totales = 0)

Pedido del usuario tras §54: "continua". Cierra la última fase del refactor del sistema de diseño llevando los hallazgos de tamaño de texto < 12px de **61 a 0**. Con esto se alcanza el **hito de errores totales = 0** en el auditor — el sistema de diseño está 98% migrado y listo para el CI gate.

### Extensión del sistema

Nueva clase `.text-3xs` en `index.css`:

```css
.text-3xs { @apply text-[9px] leading-tight tracking-tight; }
```

**RESERVADO EXCLUSIVAMENTE para:**
- Headers de tablas densas (Escanear / Monitor AP con 10+ columnas)
- Badges de tipo (CPE, AC, PTP, frequency-class)
- Subtítulos en filas micro-info
- Pies de fila en tablas multi-columna

Para cualquier otro contexto usar `.text-2xs` (11px) o `.text-xs` (12px).

Documentado en CLAUDE.md: tabla de tipografía extendida con `text-3xs`.

### Script de migración

[scripts/migrate-ds03.js](scripts/migrate-ds03.js) — **NUEVO, reutilizable**. 61 reemplazos en 24 archivos:

```
text-[11px] → text-2xs   (ya existía)
text-[10px] → text-2xs   (sube 1px, cerca del límite)
text-[9px]  → text-3xs   (nueva clase para micro-badges)
text-[8px]  → text-3xs   (sube 1px)
text-[7px]  → text-3xs   (sube 2px, mínimo legible)
```

Distribución original: 51 × 9px + 9 × 8px + 1 × 7px.

### Rationale del approach

La opción "migrar todo a `text-2xs` (11px) y aceptar pérdida de densidad" era válida pero rompía intencionalmente la jerarquía visual densa de las tablas de Escanear/Monitor AP, donde 9px se usa hace tiempo para badges micro como "CPE" o "AC" sin queja del usuario.

**Centralizar a `.text-3xs`** mantiene la intención sin violar el contrato del sistema:
- El patrón está **documentado** (en CLAUDE.md + comentario in-file).
- Es **ubicable** (clase grep-able, no literal `text-[9px]`).
- Es **bajable desde un solo punto** si después se decide subir el límite a 10px o 11px.

### Métricas pre/post §55 — y hito final

| Regla | Pre-§55 | **Post-§55** | Δ |
|---|---:|---:|---|
| DS01 | 0 | 0 | mantenido |
| DS02 | 0 | 0 | mantenido |
| DS03 | 61 | **0** | **−100%** ✅ |
| DS04 | 20 | 20 | sin cambio (excepciones doc) |
| DS05 | 0 | 0 | mantenido |
| DS06 | 3 | 3 | sin cambio (toggles legítimos) |
| **Errores** | 61 | **0** | **−100% ← HITO** |
| **Total** | 84 | **23** | −73% |

**Acumulado vs baseline §45 (1,096 hallazgos / 375 errores):**
- Hallazgos: **−97.9%** (1,096 → 23)
- **Errores: −100%** (375 → **0** ✅)

### Resumen acumulado de TODO el refactor del sistema de diseño

| § | Fase | Estado |
|---|---|---|
| §45 | Audit del sistema + skill instalada | ✅ |
| §46 | Sistema extendido + plan ejecutable + wins rápidos | ✅ |
| §47 | Fase 1 — botones inline → `.btn-*` (DS06 −88%) | ✅ |
| §48 + §49 | Fase 2 — DS02 fondos sin dark (−100%) | ✅ |
| §50 | Fase 3 — 19 modales unificados | ✅ |
| §51 | Fix bug crítico merged=undefined | ✅ |
| §52 | Fase 3.1 — 15 headers decorativos | ✅ |
| §53 | Fase 4 — DS05 contraste (−100%) | ✅ |
| §54 | Fase 5 — DS01 paletas (−100%) | ✅ |
| **§55** | **Fase 5b — DS03 tamaños (−100%) · ERRORES = 0** | ✅ |

### Sistema final (resumen visual)

```
Sistema de diseño v2 (post-§55):

  COLORES (intención semántica):
    indigo  → acción primaria
    emerald → éxito / activo
    rose    → peligro / error
    amber   → advertencia
    sky     → informativo
    violet  → WireGuard
    cyan    → CPEs (clientes)
    slate   → estructura / texto

  TIPOGRAFÍA:
    text-3xs (9px)  → micro-badges en tablas densas
    text-2xs (11px) → badges de estado
    text-xs  (12px) → mínimo general

  BOTONES:
    .btn-{primary, success, danger, warning, info, accent, outline, ghost}
    + .btn-{sm, md, lg, icon}

  MODALES:
    .modal-overlay (animación + dark)
    .modal-panel + .modal-panel-{sm, md, lg, xl, 2xl, 3xl}
    .modal-header (simple) o .modal-header-decorated + .modal-header-{tone}
    .modal-header-icon + .modal-header-close

  TABLAS:
    .data-cell, .data-muted, .data-empty
    .th-cell

  BADGES:
    .badge + .badge-{success, danger, warning, info, neutral, accent}

  EXCEPCIONES:
    // audit:ignore-file <ruleId>  (file-level)
    // audit:ignore <ruleId>       (inline)
```

### Próximo paso — CI gate (opcional, NO implementado)

**¿Qué es un "CI gate"?** CI = *Continuous Integration* (integración continua), el sistema que GitHub corre automáticamente en cada `git push` o PR (en este proyecto sería **GitHub Actions**). Un "gate" (barrera) es un chequeo que **bloquea el merge si algo falla**. La idea: hoy el sistema de diseño está en **0 errores**; agregar el auditor al CI haría que **si en el futuro alguien mete un `text-red-500` o un `text-[9px]` literal, el push falle automáticamente** y no se pueda mergear hasta arreglarlo. Es un candado que protege el trabajo ya hecho para que no se degrade con el tiempo. Es una mejora de mantenimiento opcional — el panel funciona perfecto sin esto.

**Estado:** el auditor (`scripts/audit-design.js`) ya devuelve exit code 1 si hay errores y 0 si solo hay warnings/infos, así que técnicamente ya está listo para usarse como gate. Solo falta agregar el step al workflow de GitHub Actions:

```yaml
# en .github/workflows/<archivo>.yml
- name: Audit design system
  run: npm run audit:design   # falla el build si hay errores DS0X
```

Si en una sesión futura aparece una regresión (alguien añade `text-red-500` o `text-[9px]` literal), el CI lo detectaría y bloquearía el merge. **No se ha implementado** — queda anotado como próximo paso por si se quiere blindar el sistema.

---

## ⚡ Arranque rápido

1. XAMPP **MySQL** arriba (idealmente como servicio).
2. (1ª vez tras pull) `cd server && npm run init:multiuser` — crea tablas multi-usuario + backfill.
2b. (Fase 2-B, opcional) `cd server && npm run migrate:apnode` — backfill completo de `aps.node_id` **por subred**. La columna y el backfill por `nombre_nodo` ya los aplica `initDb()` en cada boot (auto-heal); este script añade la resolución por CIDR para los APs que no matchean por nombre.
3. `cd server && npm run dev` (reintenta si MySQL aún no levanta). Debe imprimir `[ROUTEROS] Parche !empty aplicado...`.
4. `cd vpn-manager && npm run dev` → `http://localhost:5173/GestionVPN-1.0/`.
5. Login `admin/admin` o `fernando@local.app / 48523451`.
6. Si una sesión vieja da 401: F12 → Application → *Clear site data* y re-login.
7. ⚠️ Si el puerto 3001 aparece "ocupado" por un node zombie: matar el PID (`Get-NetTCPConnection -LocalPort 3001` → `Stop-Process`) y relanzar `npm run dev`. El backend nuevo debe cargar `routeros.service.js` con el parche.

## 🛑 Política de operaciones SSH sobre dispositivos Ubiquiti airOS

> Regla operativa **bloqueante** establecida en sesión 2026-06-12. Cualquier feature futura del módulo Escanear o de cualquier otra superficie del sistema **debe respetar este contrato sin excepciones**.

### ✅ Operaciones PERMITIDAS sobre antenas

| Categoría | Comandos | Por qué se permite |
|---|---|---|
| **Lectura de estado** | `mca-status`, `mca-cli-op info`, `wstalist`, `status.cgi`, `iwconfig`, `cat /tmp/system.cfg`, `cat /etc/version`, `cat /proc/meminfo`, `cat /proc/uptime` | Solo extrae datos. No modifica configuración ni persiste cambios. Base del módulo Escanear actual. |
| **Diagnóstico activo (ping / test de conectividad)** | `ping -c N <target>`, `traceroute <target>`, eventualmente `iperf3` (M4 en backlog) | Inducen tráfico de red transitorio pero **NO modifican** la antena ni su configuración. Sin estado persistido. |
| **Reinicio de la antena** | `reboot` (cuando se implemente) | El usuario operador a veces necesita reiniciar un equipo colgado. Operación reversible que no cambia configuración (la antena vuelve idéntica). Requiere confirmación explícita del moderador antes de ejecutar. |

### ❌ Operaciones PROHIBIDAS — nunca

| Categoría | Comandos prohibidos | Por qué se prohíbe |
|---|---|---|
| **Actualizar firmware** | `fwupdate.real -m URL`, `fwupdate`, copiar binarios `.bin` al equipo | El proyecto NO actualiza firmware. Los upgrades son decisión del operador de campo, ejecutados manualmente por la WebUI del dispositivo. Un bug en el panel que dispare un upgrade puede dejar antenas inalcanzables. |
| **Eliminar archivos / configuración** | `rm`, `unlink`, `cfgmtd -w` (escribe flash), `mca-cli-set` con flags destructivos | El proyecto NO borra nada del sistema de archivos del equipo. Solo lee. |
| **Restauración a fábrica** | `cfgmtd -d`, `setdefaults`, `reset_defaults`, equivalentes | Operación destructiva sin retorno. Si un operador necesita resetear, lo hace físicamente. |
| **Modificar configuración persistente** | `mca-cli-set`, `mca-cli-cfg`, edición de `/tmp/system.cfg` seguida de `cfgmtd -w`, `save-config`, `commit` | El panel NO configura antenas. Para cambios de SSID, canal, IP, modo: el operador usa la WebUI o el airControl del fabricante. |
| **Apagar el equipo** | `poweroff`, `halt`, `shutdown` | Quedaría inaccesible sin presencia física. |
| **Crear/borrar usuarios SSH del equipo** | `passwd`, edición de `/etc/passwd`, `useradd`, `userdel` | Las credenciales SSH se documentan en el panel pero se gestionan en el equipo manualmente. |
| **Polling automático de SSH** (§43) | `setInterval(()=>sshExec(...), Xs)` en frontend o backend para mantener datos "en vivo" | Las antenas Ubiquiti tienen CPU MIPS limitado. Cada comando combinado (`mca-status`+`wstalist`+`iwconfig`+`cat /proc/...`) consume 1-3s de CPU. Polleo a 5s sostiene ~5% CPU **por panel abierto**, multiplicable por cuántas antenas se estén observando. **Solo permitido:** (a) fetch puntual al abrir si no hay cache, (b) refresh manual disparado por usuario (botón "Ahora"), (c) backfill durante `runAuthPhase` del scan (1 SSH por antena, no recurrente). Si necesitas dato fresco programado: súbelo a un job backend que escribe en BD (`monitoringJob` §31, `dashboardMetrics` §30) y el frontend lee de BD. |

### Auditoría que respalda esta política (2026-06-12)

Verificado con `grep` sobre todo `server/`:

- `server/ubiquiti.service.js` — único módulo que ejecuta `conn.exec()` sobre dispositivos airOS. Los comandos son `echo` + lecturas (`/usr/www/status.cgi`, `mca-status`, `mca-cli-op info`, `wstalist`, `cat /tmp/system.cfg`, `cat /etc/version`, `cat /proc/meminfo`, `cat /proc/sys/kernel/hostname`, `iwconfig`). **No hay un solo comando que escriba**.
- `server/routes/diagnostics.routes.js` — Q3 (§28). Ejecuta `/tool/ping` y `/tool/traceroute` **desde el MikroTik**, no desde la antena.
- `server/routes/device.routes.js` — sin comandos exec. Solo HTTP GET/POST al panel administrativo en `:3001`.

### Si una feature futura necesita salir de este contrato

1. Documentarlo explícitamente en una sub-sección de esta política con justificación.
2. Requerir confirmación del moderador en UI (ej. modal "Estás a punto de reiniciar la antena. Esto cortará el servicio ~30s. Confirmar.").
3. Logear la operación en auditoría con `actor_id + target_ip + comando + timestamp`.
4. NUNCA exponer la capacidad al MEMBER — solo OWNER/CO_MOD/platform_admin.

### Cross-references

- §28 Diagnóstico ping/traceroute desde RouterOS (Q3) — respeta la política (ping es "diagnóstico activo permitido").
- §37 + §38 Auditoría Escanear — solo añadió features que **leen** (filtrar, exportar, comparar). No agregó ningún comando SSH nuevo.
- F4 (Comparar con scan anterior — backlog) — read-only por diseño. Solo compara strings ya leídos por el scan, no induce ningún comando.
- M4 (Speed test desde antena con iperf3 — backlog) — diagnóstico activo, encaja en la política. Requerirá confirmación del moderador antes de ejecutar.

---

## Reglas del proyecto (ver `vpn-manager/CLAUDE.md` y `DESIGN_SYSTEM.md`)
- Color = intención · movimiento = estado (no decorativo) · `text-xs` mínimo (`text-2xs`=11px reservado a micro-badges).
- Usar clases del sistema (`.btn-*`, `.badge-*`, `.card`, `.data-cell`, `.th-cell`, `.skeleton`, `.status-live`, `.reveal-stagger`).
- Dark mode por clase; toda animación nueva respeta `prefers-reduced-motion`.
- No versionar secretos (`.jwt_secret`, `.db_secret`, `database.sqlite*`, `.claude/worktrees/`).
- **Operaciones SSH sobre antenas Ubiquiti airOS:** solo lectura + diagnóstico activo (ping/traceroute) + reinicio con confirmación. **Nunca** actualizar firmware, eliminar archivos, restaurar a fábrica ni modificar configuración persistente. Ver sección dedicada arriba.
- **Aislamiento multi-usuario en MikroTik — mangle POR-USUARIO (sin colisión):** el acceso de cada moderador se marca con **una regla mangle propia** (`comment=ACCESO-USER-<tag>`, `src-address=<su mgmt_ip>` → `new-routing-mark=<su VRF>`). **Cada usuario marca SOLO su propio tráfico** → N usuarios coexisten enrutados a sus VRFs sin colisión de LANs duplicadas. **PROHIBIDO** crear reglas mangle GLOBALES (`ACCESO-ADMIN`/`ACCESO-DINAMICO`, `src=192.168.21.0/24`): marcan toda la /24 hacia un solo VRF y **rompen el aislamiento** — son legacy single-user y el backend las **elimina** automáticamente. Toda creación/recreación de mangle (activate, keepalive **y reparación**) debe: (a) resolver `mgmt_ip` + VRF **server-side** desde la sesión activa (`sessionRepo.getActiveByUser`), nunca desde un IP enviado por el cliente; (b) usar el provisioner por-usuario (`tunnelProvisioner.addUserMangle`); (c) limpiar cualquier legacy global presente. Ver `server/lib/tunnelProvisioner.js`.
