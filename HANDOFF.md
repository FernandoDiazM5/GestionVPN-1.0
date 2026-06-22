# 📦 Handoff — MikroTikVPN Remote Manager (`GestionVPN-1.0`)

> **Contexto DURABLE y vigente.** Léelo al iniciar cualquier sesión nueva.
> La narrativa cronológica por sesión vive en [`HANDOFF_LOG.md`](./HANDOFF_LOG.md) (append-only).
> Mantenimiento gobernado por la skill **`handoff-keeper`** (`.claude/skills/handoff-keeper/`).
> Rama de trabajo: **`dev`** · Remote: `github.com/FernandoDiazM5/GestionVPN-1.0`.

---

## 0) Estado actual

- **Tips:** `dev` = **`ee5afc0`** (esta sesión) · `main` = `57908cc` (se mergea a `main` tras validar la parte de RED en prod).
- **Salud:** `tsc` frontend 0 · `node --check` 0 · **271 tests backend verdes** · **66 tests frontend verdes** · contratos compilan · pre-commit (eslint+tsc) OK · **`audit:semgrep` 0 findings** (606 archivos, vía Docker) · `audit:design` 0 errores.
- **Última línea de trabajo (2026-06-21, cont. 3):** **La aceptación de invitación ya no se traga el fallo de provisión WG** (commit `7ac2543`, cierra pendiente §7). `AcceptResponse` gana `wgError {code,message}` (`ROUTER_UNREACHABLE`|`ROUTER_NOT_CONFIGURED`|`PROVISION_FAILED`); `/accept` e in-app lo pueblan (clasifica con `isUnreachable`, sin filtrar IPs/creds); `AcceptInvitationForm` muestra el motivo + botón **"Reintentar"** (self-service `/me/wireguard`, la cookie ya está puesta) que renderiza `.conf`/QR si el router ya responde. El alta de cuenta sigue siendo best-effort.
- **Incidente de red resuelto (2026-06-21):** el usuario borró su propio peer WG de administración → el panel perdió acceso al router (todo 503, provisión WG "saltada"). Recreado el peer admin (**`10.14.250.2` → router `10.14.250.1`**, plano `VPN-WG-ADMIN`); verificado API OK. Regla durable nueva: **§4.19 — nunca borrar ese peer**. (No era bug de código.)
- **Trabajo previo (2026-06-21, cont. 2):** **Fix del cuelgue de la API RouterOS** (commit `654b09d`). Síntoma: el modal "Eliminar moderador" se quedaba pensando para siempre. Causa raíz doble: (1) **código** — `connectToMikrotik` confiaba en el `timeout` de `node-routeros` (`socket.setTimeout`), que NO dispara durante el login de la API; el router aceptaba el TCP pero, si no respondía al `/login`, la promesa quedaba colgada y el `fetch` del frontend (sin timeout) dejaba el spinner eterno. Fix: deadline DURO de 9s (`connectWithDeadline`, destruye el socket y rechaza) + el DELETE ahora borra en BD y responde primero, con la limpieza del router en segundo plano (best-effort). (2) **router** — `/ip service api address=` tenía su PROPIA allow-list (independiente del firewall/`LIST-MGMT-TRUSTED`) con solo el plano viejo `192.168.21.0/24`; el backend sale por `10.13.250.x`, no incluido → login descartado en silencio. **Arreglado en el router en vivo** (usuario corrió `/ip service set api/api-ssl address=` con los `10.x`); verificado: login OK en ~130ms a `10.13.250.1` y `10.14.250.1` (`GW-VPN-CORE-ISP`). `migrate-mgmt-net.rsc` ahora trae **FASE 2b** para no repetir el olvido en otros entornos.
- **Trabajo previo (2026-06-21, cont.):** **Auditoría integral** del branch con la nueva skill `/auditoria-completa` (orquesta seguridad/lógica/eficiencia/BD/validación en informe por severidad, read-only). 0 críticos; **5 hallazgos arreglados** (commit `b964309`): (1) collation de `workspace_scan_ip` `unicode_ci`→`general_ci` (los JOIN reventaban "Illegal mix of collations"; `ALTER` idempotente en `migrateScanIp.js`, también arregla prod en el próximo deploy). (2) Eliminada la ruta viva `POST /tunnel/mangle-access` que inyectaba mangles GLOBALES `ACCESO-ADMIN` con `src=<toda la /24>` (violaba §4.3; sin consumidor). (3) `splitStatements` CRLF-safe (`split(/\r?\n/)`) — el `\r` dejaba pasar el `;` de comentarios inline y truncaba `CREATE TABLE aps`/`mgmt_peer_owners` en BD fresca Windows. (4) `buildClientConf` **lanza** si falta `allowedIps` en vez de caer a `0.0.0.0/0` (footgun §4.10). (5) Seed con passwords por env (`SEED_ADMIN_PASSWORD`/`SEED_MOD_PASSWORD`). **Tooling** (commit `64adc7b`): `npm run audit:semgrep` (imagen Docker fijada, no hay binario Windows) + skill `auditoria-completa`. Migraciones notif/monitoring/dropcomod verificadas/aplicadas en local.
- **Trabajo previo (2026-06-21):** Opción C reforzada (scan-IP amarrada al workspace al crearse, `scanLock.tryAcquire` en Monitor AP) + retiro total de co-moderadores (`CO_MODERATOR` fuera de enum/contratos/guards/rutas/UI/tests, `migrate:dropcomod`). Detalle en LOG.
- **Trabajo previo (2026-06-20):** ciclo de vida WireGuard de gestión + borrado en cascada (`.conf` split-tunnel, recuperación WG self-service, `nodeDeprovision`, reutilización de IPs, 503 en cortes). Detalle en LOG.
- **Estado de datos (2026-06-20):** **0 nodos** en BD (ND2 TorreHousenet + ND3 TorreOmar borrados — tenían `workspace_id=NULL`); **2 workspaces** (Soporte, Espacio de admin), 4 users; zombies del soft-delete purgados.
- **Acciones de RED pendientes del usuario:** ver §7 (pendientes) y los runbooks de §6.

> Resumen de cada sesión anterior: ver [`HANDOFF_LOG.md`](./HANDOFF_LOG.md). Para no inflar este doc, **aquí solo va lo que sigue siendo cierto hoy.**

---

## 1) Producto y roles (RBAC)

Panel **multi-tenant (SaaS)** para administrar túneles VPN sobre un **MikroTik central compartido** (SSTP + WireGuard) y monitorear equipos **Ubiquiti airOS** (AC/M5, APs/CPEs) en las LAN remotas vía VRF.

| Rol | Flag | Ve | No ve |
|---|---|---|---|
| **Administrador** (Sistemas) | `is_platform_admin=1` | Dashboard · Moderadores · **Ajustes** (config router core) | Nodos/Escanear/etc. |
| **Moderador** | `OWNER` de su workspace | Nodos · Escanear · Usuarios · Equipo · Monitor AP | Ajustes / config router |
| **View** (MEMBER) | — | Sus túneles asignados + perfil WireGuard | Todo lo demás |

**Un solo moderador por workspace:** cada workspace = **1 OWNER (moderador) + sus MEMBERs**. El rol `CO_MODERATOR` fue **retirado** (enum BD `('OWNER','MEMBER')`). Solo el OWNER escanea/gestiona; el MEMBER no. La scan-IP del VPS se amarra **al workspace** (no al usuario) al crearse (Opción C); el `scanLock` ahora serializa el escaneo interactivo del moderador contra el job de Monitor AP del mismo workspace.

---

## 2) Arquitectura y stack

| Capa | Tecnología |
|---|---|
| Frontend | **React 19** + **TypeScript (strict)** + **Vite** + **Tailwind v3** + `lucide-react` + `qrcode` + `localforage` |
| Estado | Context API (`VpnContext`, `WorkspaceSessionProvider`) + hooks por feature |
| Backend | **Node.js + Express** (JS plano), `mysql2/promise`, `node-routeros` (API :8728), `ssh2` (airOS), `bcryptjs`, `jsonwebtoken`, `zod`, `cookie-parser`, `nodemailer` |
| BD | **MySQL/MariaDB** — única BD (operativa + RBAC). XAMPP en local (`vpn_manager`); MariaDB 11 en prod (Docker) |
| Cripto | AES-256-GCM (`.db_secret`) para credenciales · JWT HS (`.jwt_secret`) para sesión (cookie HttpOnly `vpn_session`, 8h) |
| Puertos | Backend **:3001** · Frontend **:5173** (base `/GestionVPN-1.0/`) · Router MikroTik gestión `10.12.250.1` (plano `10.x` nuevo) |

**Auth:** cookie HttpOnly `vpn_session` leída por `verifyToken` (acepta cookie o Bearer). Login por email, `usuario@local.app` o nombre.

**Despliegue prod:** VPS DigitalOcean `134.199.212.232`, Docker (`docker-compose.prod.yml`: MariaDB 11 + backend `network_mode: host` + frontend nginx). Detalle en [`DESPLIEGUE_VPS.md`](./DESPLIEGUE_VPS.md).

**Plano de red de gestión (`10.x`, migrado desde `192.168.21.x`):** nodos WG `10.11.250.<ND>` · nodos SSTP `10.11.251.<ND>` · scan-pool VPS `10.11.252.0/24` · **VPN-WG-VPS** `10.12.250.1/24` · **VPN-WG-CLIENTES** `10.13.250.1/24` (mod/members) · **VPN-WG-ADMIN** `10.14.250.1/24` (admin). Fuente de verdad: `server/lib/mgmtNet.js` (backend) + `vpn-manager/src/config.ts` (frontend). Runbook: [`MIGRACION_RED_GESTION.md`](./MIGRACION_RED_GESTION.md).

---

## 3) Datos y APIs (referencia rápida)

**Esquemas MySQL** (`server/sql/`): `schema_ops.sql` (operativo: `nodes`, `node_ssh_creds`, `aps`, `cpes`, `signal_history`, `vpn_users`, `app_settings`, …) · `schema_rbac.sql` (`users`, `workspaces`, `workspace_members`, `invitations`, `tunnel_assignments`, `member_wireguard`, …) · `schema_multiuser.sql` (`user_mgmt_ips`, `tunnel_user_sessions`, `tunnel_session_logs`) · `workspace_scan_ip` (Opción C).

**Fuentes de verdad únicas (NO dupliques lógica fuera de aquí):**
- Script del CPE → `server/lib/cpeScript.js` (`buildCpeWgScript` + `buildCpeSstpScript`).
- Credenciales SSTP server-side → `server/lib/sstpCreds.js`.
- Red de gestión → `server/lib/mgmtNet.js` + `vpn-manager/src/config.ts`.
- Contratos API compartidos → paquete `@gestionvpn/contracts` (`packages/contracts`).

> Detalle de endpoints y código core: §3 y §6 de [`HANDOFF_LOG.md`](./HANDOFF_LOG.md).

---

## 4) 🔒 Reglas e invariantes del proyecto (NO romper)

Estas reglas son **durables**: aplican a toda sesión y a todo cambio. Si una feature necesita salirse de aquí, documentarlo explícitamente antes.

1. **Alta de nodo = todo server-side.** Dar de alta un nodo debe ser como dar de alta un usuario: el servidor **genera TODO** (llaves WG, usuario/contraseña SSTP, rutas de retorno) y entrega **un único script para pegar en el CPE**. El modo experto (pegar llaves/usuario propios) va OCULTO tras "Opciones avanzadas". Nunca volver a pedir la clave pública del CPE en el flujo normal.
2. **Toda la infra por-túnel se crea sola** (mangle, rutas de retorno, scan-route, IP de gestión por nodo). Nada de `.rsc` manual en el flujo normal.
3. **Aislamiento multi-usuario — mangle POR-USUARIO (sin colisión).** Cada moderador marca **solo su propio tráfico**: `comment=ACCESO-USER-<tag>`, `src-address=<su mgmt_ip>` → `new-routing-mark=<su VRF>`. **PROHIBIDO** crear reglas mangle GLOBALES (`ACCESO-ADMIN`/`src=<toda la /24>`): rompen el aislamiento y el backend las elimina. `mgmt_ip` + VRF se resuelven **server-side** desde la sesión activa (`sessionRepo.getActiveByUser`), **nunca** desde un IP del body. Usar `tunnelProvisioner.addUserMangle`. Aplica a activate, keepalive **y reparación**.
4. **Varios nodos pueden compartir la misma LAN a propósito** (arquitectura VRF + mangle). NO añadir avisos de "solape de LAN" como si fuera un error (memoria `arquitectura-lan-compartida-vrf-mangle`).
5. **Antispoofing en escaneo/Monitor AP:** la IP y credenciales del equipo se resuelven **server-side** del nodo/AP dueño (`ipInOwnedSubnet`, `ownsApUuid`), nunca del body del cliente. El navegador no envía contraseñas SSH.
6. **🛑 Operaciones SSH sobre antenas Ubiquiti airOS — SOLO:** lectura de estado + diagnóstico activo (ping/traceroute) + reinicio con confirmación explícita. **NUNCA:** actualizar firmware, borrar archivos, restaurar a fábrica, modificar config persistente, apagar, gestionar usuarios SSH, ni **polling SSH automático** (§43 del LOG). Detalle completo y matriz de comandos: sección "Política SSH" en [`HANDOFF_LOG.md`](./HANDOFF_LOG.md).
7. **Sistema de diseño:** color = intención, movimiento = estado (no decorativo). Usar clases del sistema (`.btn-*`, `.badge-*`, `.card`, `.modal-overlay/.modal-panel`, `.skeleton`, `.status-live`). Dark mode por clase; toda animación respeta `prefers-reduced-motion`. `text-xs` mínimo. Gate CI `audit:design` debe quedar en **0 errores**. Menús de acción **con color** (no gris) — memoria `pref-menu-accion-con-color`.
8. **No versionar secretos:** `.jwt_secret`, `.db_secret`, `database.sqlite*`, `.claude/worktrees/`, binarios. (El historial ya se purgó 2×; en el VPS usar `git fetch && git reset --hard origin/main`, NUNCA `git pull`.)
9. **`/settings/save` y config del router core = solo `platform_admin`.** Un moderador no muta settings globales por API.
10. **`.conf` de gestión = SPLIT-TUNNEL, NUNCA `0.0.0.0/0` (ni `0.0.0.0/1, 128.0.0.0/1`, que es lo mismo).** El router no da salida a internet a los clientes de gestión (CLIENTES); solo el plano ADMIN tiene internet (`Admin MGMT libre`+NAT). `0.0.0.0/0` deja a CLIENTES **sin internet**. AllowedIPs = base RFC1918 (`mgmtNet.mgmtAllowedIps`, env `MGMT_ALLOWED_IPS`) **+ LAN públicas de torre leídas DINÁMICAMENTE** del address-list `LIST-NET-REMOTE-TOWERS` del router (`readTowerLans` + `mgmtAllowedIpsFor(ws, {addressList})` en `lib/mgmtAllowedIps.js`) → cubre `142.152.7.0/24`, `142.153.0.0/24`, etc. sin hardcodear. Las privadas ya las cubre la base.
11. **Clasificar caídas del túnel como inalcanzable (503), no 500.** `isUnreachable` debe incluir cortes transitorios (`ECONNRESET`/`EPIPE`/`EHOSTDOWN`/`socket hang up`) para que la UI muestre el overlay "Router no alcanzable · Reintentar" en vez de un 500 duro.
12. **Borrar un moderador = de-provisionar sus nodos del router.** El cascade (`DELETE /admin/moderators/:id`) debe llamar `deprovisionNodeOnRouter` (`lib/nodeDeprovision.js`) por cada nodo (VRF + interfaz + rutas + mangle + peer), además de borrar peers de gestión (`routerCleanup`/`routerPeerState`, que usan `mgmtNet.userIfaces`, NO `VPN-WG-MGMT`). Best-effort: el router caído no bloquea el borrado en BD.
13. **NUNCA tocar el address-list `LIST-NET-REMOTE-TOWERS` al de-provisionar.** Varias torres comparten la misma LAN (aislamiento por VRF+mangle) → borrar la entrada rompería a los nodos hermanos. Las entradas sin ruta/VRF quedan inertes.
14. **IPs de gestión: amarradas al usuario, liberadas y reutilizadas.** `user_mgmt_ips` (`uq_umi_user`+`uq_umi_ip`) amarra 1 IP↔1 usuario; al borrar se libera. La asignación usa **menor octeto libre** (`lib/ipAlloc.lowestFreeOctet`), no `max+1` → reutiliza huecos de usuarios borrados.
15. **Scan-IP del VPS = amarrada al WORKSPACE, asignada al crearse.** `workspace_scan_ip` (`uq_wsi_workspace`+`uq_wsi_ip`) liga 1 scan-IP↔1 workspace. Se asigna **automáticamente** al crear el workspace (`scanIpRepo.allocateInTx` dentro de `workspaceRepo.createForOwner`, menor IP libre del pool `10.11.252.0/24`), best-effort: pool agotado NO rompe la creación (cae a escaneo legacy). NUNCA tomar la IP del request del cliente — siempre server-side (`resolveForWorkspace`). Se eligió el **workspace** (no el usuario) porque es el contenedor estable: sobrevive a rotación del moderador y el namespace de mangle ya es `SCAN-WS-<ws>`.
16. **Un solo moderador (OWNER) por workspace — sin co-moderadores.** El rol `CO_MODERATOR` está **retirado** del enum, contratos, guards, rutas y UI. `isModerator` = `OWNER` (o `platform_admin`). No hay promover/degradar (endpoint `/team/role` eliminado); `/team/invite` solo crea MEMBERs. El alta de un moderador la hace el Administrador (invitación rol `OWNER`). Job de Monitor AP: `scanLock.tryAcquire` (no bloqueante) para no estancar otros workspaces durante un escaneo interactivo largo.
17. **Toda conexión al router debe estar acotada por un deadline PROPIO.** `connectToMikrotik` (`routeros.service.js`) impone `connectWithDeadline` (9s) que destruye el socket y rechaza. **NO confiar en el `timeout` de `node-routeros`** (`socket.setTimeout`): NO dispara durante el login de la API — el router acepta el TCP pero, si no responde al `/login`, la promesa queda colgada para siempre. Toda operación de router es best-effort: una caída/cuelgue del router **nunca** debe bloquear una petición HTTP (el frontend no tiene timeout de fetch). Patrón: hacer el trabajo de BD y responder primero; la limpieza/sync del router corre aparte.
18. **El plano de gestión `10.x` debe estar en `/ip service api address=` (y `api-ssl`), no solo en el firewall.** `/ip service api` tiene su PROPIA allow-list por `address=`, **independiente** del firewall y de `LIST-MGMT-TRUSTED`. Si el origen del backend (`10.13.250.x`/`10.14.250.x`) no está ahí, RouterOS acepta el TCP pero **descarta el login en silencio** (no `!trap`, no cierre: cuelgue). Lo aplica `migrate-mgmt-net.rsc` FASE 2b. Síntoma de diagnóstico: TCP a :8728 abre en ms pero `connectToMikrotik` no retorna → revisar esta lista antes que credenciales/red.
19. **NUNCA borrar el peer WG de administración que da acceso al router.** El backend habla con el MikroTik (`MT_IP=10.14.250.1`) **solo** mientras la interfaz WG de gestión del admin esté arriba. El peer admin es **`10.14.250.2` → router `10.14.250.1`** (plano `VPN-WG-ADMIN`). Si se borra ese peer (o se cae el túnel del laptop), el panel pierde TODO acceso al router y **cada endpoint que toca el router devuelve 503** (router inalcanzable), y la provisión WG del moderador "se salta" en silencio (§7). Diagnóstico: `ping 10.14.250.1` / TCP a :8728 en timeout = túnel admin caído, NO es bug de código. Mantener ese peer y un handshake activo (PersistentKeepalive ya va en el `.conf`, `wgkeys.js`).

Ver también `vpn-manager/CLAUDE.md` y `DESIGN_SYSTEM.md`.

---

## 5) ⚙️ Procesos / funciones vigentes

> Aquí van los **flujos que siguen activos** (no cómo se construyeron). Cuando el usuario pida "enviar al handoff" una regla/función/proceso, va a §4 o §5.

- **Alta de nodo (WG):** backend genera el par de llaves si no se pega una propia, registra la pública en el peer del Core, embebe la privada en el script + rutas de retorno. Columnas `nodes.wg_cpe_public` + `wg_cpe_private_enc` (AES-GCM). Salida: script autocontenido.
- **Alta de nodo (SSTP):** no requiere ruta de retorno (RouterOS la arma con la `remote-address` del PPP). Usuario/contraseña PPP se generan server-side (`ppp-<nombre>-nd<ND>` + pass segura) y se embeben en el script.
- **Invitación de MEMBER (modelo seguro):** el invitado envía **solo su public key**; el server crea el peer, asigna el túnel de la invitación y devuelve `{allowedIp, serverPublicKey, endpoint, allowedIps}` para que arme su `.conf` (la clave privada nunca sale del dispositivo). Provisión WG = best-effort.
- **Recuperación WireGuard self-service:** `POST /api/team/me/wireguard` — el moderador/member (re)genera su propio acceso WG si quedó sin él (la provisión al aceptar es best-effort y puede fallar si el router está caído). UI en **Ajustes → tab WireGuard** (`WireGuardTab.tsx`) con QR + descargar `.conf` + regenerar. Idempotente: limpia el peer anterior al regenerar.
- **Enlace manual de invitaciones:** DO bloquea SMTP saliente → el correo puede no llegar. `invite-moderator` no falla si el email falla y devuelve `acceptUrl`; `GET /api/admin/invitations` lista pendientes y `POST .../:id/link` regenera el enlace. El admin lo comparte a mano hasta tener relay (Brevo por puerto 2525, pendiente activar cuenta).
- **IP pública WAN:** setting global del admin (`server_public_ip` en Ajustes); `NuevoNodo` la consume en solo-lectura.
- **Escaneo Opción C (VPS):** una scan-IP por workspace (`workspace_scan_ip`), **asignada al crear el workspace**; mangle namespace `SCAN-WS-<ws>`; el SSH/HTTP se ata a la scan-IP (`localAddress`) y la mangle por-origen del router lo enruta al VRF. Serializado por `scanLock` (interactivo `acquire`, Monitor AP `tryAcquire`). Sin scan-IP → escaneo legacy (dev local). Ruta de retorno del scan-pool se crea sola al provisionar nodo (`provision.routes.addScanReturnRoute`); `db/checkScanRoute.js` la verifica/repara.

---

## 6) ⚡ Arranque rápido + runbooks

**Local (dev):**
1. XAMPP **MySQL** arriba.
2. (1ª vez tras pull) `cd server && npm run init:multiuser` (+ `migrate:apnode` opcional).
3. `cd server && npm run dev` → debe imprimir `[ROUTEROS] Parche !empty aplicado...`.
4. `cd vpn-manager && npm run dev` → `http://localhost:5173/GestionVPN-1.0/`.
5. Login `admin/admin` o `fernando@local.app / 48523451`.
6. 401 de sesión vieja → F12 → Application → *Clear site data* → re-login.
7. Puerto 3001 ocupado por zombie → `Get-NetTCPConnection -LocalPort 3001` → `Stop-Process`.

**Scripts útiles:** `npm run init:rbac | init:multiuser | migrate:* | seed:roles` · `npm run analyze:queries` · `npm run audit:design` · `npm run scan:assign <workspaceId>` · `npm run purge:orphans`.
**Diagnóstico (read-only, seguro):** `npm run diagnose` (IPs de gestión/scan, sesiones, salud de cifrado MT_* — sin imprimir secretos) · `npm run check:scanroute [-- --apply]` (verifica/repara la ruta de retorno del scan-pool en cada VRF). Reemplazan los scripts sueltos de depuración ya retirados.

**Runbooks de RED (acciones del usuario en VPS/MikroTik):** [`DESPLIEGUE_VPS.md`](./DESPLIEGUE_VPS.md) · [`MIGRACION_RED_GESTION.md`](./MIGRACION_RED_GESTION.md) · `PLAN_IP_UNIFICADA.md`.

**Credenciales prod:** `admin / 48523451Fs` (en `vpn_users`). ⚠️ Considerar comprometidas las credenciales que vivieron en el viejo `database.sqlite` / que se expusieron en chat (rotar SMTP de Brevo).

---

## 7) 📌 Pendientes activos

| Prioridad | Tarea |
|---|---|
| 🟢 Una vez tras pull | `cd server && npm run migrate:notifications && npm run migrate:monitoring && npm run migrate:dropcomod` (este último degrada co-mods existentes a MEMBER y estrecha el enum). **Local ya aplicadas (2026-06-21)**: notif/monitoring ya estaban; `dropcomod` corrida ahora (0 filas degradadas, enum→`('OWNER','MEMBER')`). En prod van solas en `entrypoint.sh`. Solo re-aplica en entornos nuevos. |
| 🟡 RED en VPS | Aplicar runbook de migración `10.x` (fases del `migrate-mgmt-net.rsc`, incluida la nueva **FASE 2b** `/ip service set api/api-ssl address=` con los `10.x` — sin ella el login de la API se cuelga; ver §4.18 · corte final que elimina `VPN-WG-MGMT`) · activar cuenta Brevo (relay SMTP 2525) · cerrar puertos sobrantes en `ufw`. (En el router local ya se aplicó FASE 2b en vivo 2026-06-21. `scan:assign` ya NO es necesario en altas nuevas: la scan-IP se amarra al crear el workspace; úsalo solo para workspaces creados antes de este cambio.) |
| 🟡 Prueba en vivo | Alta WG/SSTP → script en CPE → handshake + ping gestión + escaneo > 0 · 2 moderadores contra el router (aislamiento mangle por-usuario). |
| 🟡 Router | **Limpieza puntual** de peers WG YA huérfanos en el router (del moderador borrado ANTES del fix de cascada) — el código nuevo solo cubre borrados futuros. Revisar en Winbox `/interface wireguard peers print` y borrar los que tengan comment de un email inexistente. |
| 🟡 Router | **Dedup del address-list** `LIST-NET-REMOTE-TOWERS`: pueden quedar entradas duplicadas/inertes (M3 solo evita NUEVAS; el borrado de nodo NO las toca a propósito). Un `:foreach` de limpieza puntual cuando convenga. |
| ✅ Hecho (2026-06-21) | ~~`/team/accept` traga el error de provisión WG en silencio~~ → **resuelto**: `/accept` e in-app devuelven `wgError {code,message}` (contrato `AcceptResponse`); `AcceptInvitationForm` muestra el motivo + botón "Reintentar" (self-service `/me/wireguard`). |
| 🟡 Datos | El alta de nodo debe setear `workspace_id` (ND2/ND3 salieron NULL). Verificar que `provision.routes` lo persiste; si no, es la raíz del problema de cascada/aislamiento. |
| 🟡 Feature | Toggle **Local/VPS** para `MT_IP`/endpoint del router (local `10.14.250.1` / VPS `10.12.250.1`), análogo a `ScanModeToggle`. |
| 🟡 Backlog | M2 API pública con tokens scoped · M3 Webhooks · M4 Speed test iperf3 (con confirmación) · L1 Reportes SLA · L2 Diagnóstico con LLM · L3 PWA móvil · L4 Predicción de degradación. |

---

## 8) 🧭 Cómo mantener este documento

Este doc se mantiene con la skill **`handoff-keeper`** (`.claude/skills/handoff-keeper/SKILL.md`). En resumen:
- **Estado, reglas, funciones y procesos** → se **integran/actualizan en este `HANDOFF.md`** (§0, §4, §5) reemplazando lo viejo.
- **Narrativa de "qué hice esta sesión"** → se **añade** como nueva entrada arriba en [`HANDOFF_LOG.md`](./HANDOFF_LOG.md).
- Cuando el usuario diga *"envía esto al handoff"*: clasificar primero (¿regla/función/proceso durable, o evento de bitácora?) y colocarlo en el archivo correcto.
