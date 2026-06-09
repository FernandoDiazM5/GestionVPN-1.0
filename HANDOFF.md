# 📦 Handoff Técnico — MikroTikVPN Remote Manager (`GestionVPN-1.0`)

> Documento de migración de contexto entre sesiones.
> Rama de trabajo: **`dev`** · Remote: `github.com/FernandoDiazM5/GestionVPN-1.0`.
> Última actualización (2026-06-07 PM ext.): **Ajustes del moderador (perfil + workspace + import/export JSON) + Recuperar contraseña + sync MikroTik al deshabilitar + invitaciones por email + .conf WG server-side** (sesión PM extendida).
> Sesión AM: multi-usuario con aislamiento por sesión (mangle por-IP), parche `!empty` node-routeros, auditoría (Semgrep+security-review+code-review) y fixes C1–C7.
> Resumen extendido en `RESUMEN_CONTEXTO_MAESTRO.md`.

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

**Estado de salud:** `tsc 0` · `node --check ✓`. ⚠️ **Bug activo:** `POST /api/wireguard/peers` da 500 y tira el backend (puerto 3001 abajo) — sin capturar el stack aún (ver §5).

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
| 🔴 **ACTIVO** | **Crash `POST /api/wireguard/peers`** → 500 + tira el backend (3001 abajo) al abrir "Usuarios". Plan: reproducir server-side (script con `getAppSetting('MT_*')`+`decryptPass`, ejecutar `/interface/wireguard/print` y `/interface/wireguard/peers/print`) para capturar el stack. Verificar si es otro throw síncrono de node-routeros no cubierto por el parche `!empty`, o si `index.js` no contiene el error (no entra en `SAFE_CODES`). |
| 🟠 Seguridad | **V1 — `register-my-ip`** valida que el peer exista pero NO que sea del usuario → un MEMBER puede reclamar una IP de gestión ajena sin dueño. Fix: exigir `comment=member:<user_id>` == `req.account.sub`, o que el moderador asigne. |
| 🟡 Limpieza | Quitar `adminIP` hardcodeado (`useNodeManagement.ts`, ya no se usa) · warning MySQL2 `keepAliveInitialDelayMs` · job batch de expiración (hoy perezoso en `/tunnel/status`) · escaneo atado al `mgmt_ip` del solicitante. |
| 🟡 Mejora | **Fase 5 (opcional):** aislamiento de firewall por-IP + acotar regla "Admin MGMT libre" (defensa en profundidad; hoy el ruteo ya aísla). Dockerfile `USER` no-root (Semgrep S1). |
| 🟢 Resuelto | O2 repo privado · O5 MySQL estable · UX P6 · **multi-usuario activación (verificado)** · parche `!empty` · fixes C1–C7. |
| 🟢 Nota | Config MikroTik `v2.rsc` SIN mangle global (baseline limpio multi-usuario). Peer `peer27` de prueba con public-key placeholder `abcdEFGH...` (borrable). |

**Scripts:** `cd server && npm run init:rbac | init:multiuser | migrate:sqlite | seed:roles` · `node db/rotateSecrets.js` · `node db/mapUserMgmtIp.js <email> <ip>`.

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

## ⚡ Arranque rápido

1. XAMPP **MySQL** arriba (idealmente como servicio).
2. (1ª vez tras pull) `cd server && npm run init:multiuser` — crea tablas multi-usuario + backfill.
3. `cd server && npm run dev` (reintenta si MySQL aún no levanta). Debe imprimir `[ROUTEROS] Parche !empty aplicado...`.
4. `cd vpn-manager && npm run dev` → `http://localhost:5173/GestionVPN-1.0/`.
5. Login `admin/admin` o `fernando@local.app / 48523451`.
6. Si una sesión vieja da 401: F12 → Application → *Clear site data* y re-login.
7. ⚠️ Si el puerto 3001 aparece "ocupado" por un node zombie: matar el PID (`Get-NetTCPConnection -LocalPort 3001` → `Stop-Process`) y relanzar `npm run dev`. El backend nuevo debe cargar `routeros.service.js` con el parche.

## Reglas del proyecto (ver `vpn-manager/CLAUDE.md` y `DESIGN_SYSTEM.md`)
- Color = intención · movimiento = estado (no decorativo) · `text-xs` mínimo (`text-2xs`=11px reservado a micro-badges).
- Usar clases del sistema (`.btn-*`, `.badge-*`, `.card`, `.data-cell`, `.th-cell`, `.skeleton`, `.status-live`, `.reveal-stagger`).
- Dark mode por clase; toda animación nueva respeta `prefers-reduced-motion`.
- No versionar secretos (`.jwt_secret`, `.db_secret`, `database.sqlite*`, `.claude/worktrees/`).
