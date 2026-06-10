# 📦 Handoff Técnico — MikroTikVPN Remote Manager (`GestionVPN-1.0`)

> Documento de migración de contexto entre sesiones.
> Rama de trabajo: **`dev`** · Remote: `github.com/FernandoDiazM5/GestionVPN-1.0`.
> Última actualización (2026-06-10): **REFACTOR_PLAN fases 0-11 ejecutadas** (F5: monorepo + `@gestionvpn/contracts`; F6: `node.routes.js` → 8 archivos; F7: `core.routes.js` → 7 archivos; F8: `NetworkDevicesModule.tsx` **1313 LOC → 433** + 4 hooks + 5 componentes nuevos + fixup `5c19cb6` resolvió 2 bugs de perf y 2 anti-patterns; F9: observabilidad — `/api/health` enriquecido (mysql+routeros+smtp) + `GET /metrics` Prometheus + counters de auth/routeros/mailer; F10: code-splitting frontend — bundle inicial **1090 → 248 KB raw (-77%)** + `npm run analyze` con visualizer; F11: MySQL performance — pool con timeouts explícitos + 8 índices compuestos en `schema_perf_indexes.sql` + `npm run analyze:queries` con `EXPLAIN` sobre 13 queries del hot path). Bug del crash de `POST /api/wireguard/peers` resuelto. Ver §17, §18, §19, §20, §21, §22, §23 y §24.
> Sesión 2026-06-07 PM: Ajustes del moderador (perfil + workspace + import/export JSON) + Recuperar contraseña + sync MikroTik al deshabilitar + invitaciones por email + .conf WG server-side.
> Sesión 2026-06-07 AM: multi-usuario con aislamiento por sesión (mangle por-IP), parche `!empty` node-routeros, auditoría (Semgrep+security-review+code-review) y fixes C1–C7.
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

**Estado de salud:** `tsc 0` · `node --check ✓` · backend **62 tests verdes** (55 + 7 del parche routeros). Bug del crash de `POST /api/wireguard/peers` **resuelto** (ver §13.6).

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
| 🟠 Seguridad | **V1 — `register-my-ip`** valida que el peer exista pero NO que sea del usuario → un MEMBER puede reclamar una IP de gestión ajena sin dueño. Fix: exigir `comment=member:<user_id>` == `req.account.sub`, o que el moderador asigne. |
| 🟡 Limpieza | Quitar `adminIP` hardcodeado (`useNodeManagement.ts`, ya no se usa) · warning MySQL2 `keepAliveInitialDelayMs` · job batch de expiración (hoy perezoso en `/tunnel/status`) · escaneo atado al `mgmt_ip` del solicitante. |
| 🟡 Mejora | **Fase 5 (opcional):** aislamiento de firewall por-IP + acotar regla "Admin MGMT libre" (defensa en profundidad; hoy el ruteo ya aísla). Dockerfile `USER` no-root (Semgrep S1). |
| 🟢 Resuelto | O2 repo privado · O5 MySQL estable · UX P6 · **multi-usuario activación (verificado)** · parche `!empty` · fixes C1–C7 · **crash `POST /api/wireguard/peers` (parche generalizado a replies desconocidos + UNREGISTEREDTAG + handler 'error' en RouterOSAPI — ver §13.6)**. |
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

Sesión 2026-06-09 ejecutó las fases 0-4 del plan de refactor incremental
(ver [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md) para el detalle completo).

### Fases completadas

| Fase | Estado | Commits | Resultado |
|------|--------|---------|-----------|
| **F0** Preparación | ✅ | 7 | `.editorconfig`, husky + lint-staged pre-commit, GitHub Actions CI, README "Contribuir", ESLint thresholds documentados |
| **F1** Logger estructurado | ✅ | 8 | `pino@9` + `pino-http@10` + `pino-pretty@11` (dev). [server/lib/logger.js](server/lib/logger.js) con redact de password/token/secret/private_key/cookie/authorization. **0 `console.*`** en código productivo del backend (excepto scripts CLI en `db/init*.js`, `db/seed*.js`, etc.) |
| **F2** Headers de seguridad | ✅ | 4 | `helmet@8` con CSP API-only (`default-src 'none'`), HSTS solo en prod, COOP/COEP off para no romper CORS, `crossOriginResourcePolicy: same-site`. Cookies con `secure` automático en prod + `sameSite: lax`, helper `cookieBaseOptions()` garantiza que `clearSessionCookie` borra de verdad |
| **F3** Setup de testing | ✅ | 6 | Vitest 2 (backend + frontend), Supertest, Testing Library, MSW, jsdom, Playwright. Mocks (`routeros`, `mailer`, `mysql`), factories, helper `stubModule` para CJS, render wrapper con providers reales. CI corre Vitest en ambos jobs |
| **F4** Tests críticos | ✅ | 7 | **92 tests verde** (55 backend + 37 frontend). Suites: `wgkeys`, `crypto`, `passwordResetRepo`, `tenantScope`, `password-reset/*` (supertest), `permissions`, `sessionClient` (auth_expired), `WgConfigModal`. Thresholds suaves (5% lines / 45% branches) — F8/F11 los suben a 60% |
| **F5** Contracts compartidos + Bearer kill | ✅ | — | Monorepo npm workspaces; `packages/contracts` con schemas Zod (Auth, Account, Team, Admin, Workspace); backend importa schemas centralizados (5 routes migrados); frontend re-exporta tipos desde contracts; `auth.routes.js` usa `sendOk`/`sendError`; `apiFetch` ya no inyecta `Bearer` — sesión = cookie HttpOnly. **92 tests siguen verdes.** Ver §18 |
| **F6** Split `node.routes.js` | ✅ | — | `routes/node.routes.js` (1264 LOC) → `routes/nodes/{index,_shared,listing,provision,editing,tags,credentials,history,scan}.routes.js` (max **472 LOC**). Helpers comunes (`annotateSessions`, `filterNodesForRole`, `nodeBelongsToRequester`, `requireOperator`) en `_shared.js`. **92 tests siguen verdes.** Ver §19 |
| **F7** Split `core.routes.js` | ✅ | — | `routes/core.routes.js` (935 LOC) → `routes/core/{index,_shared,connection,ppp,interface,tunnel,tunnel-repair}.routes.js` (max **430 LOC**). Registry SSE singleton + helpers (`emitToUser`, `canUseTunnel`, `clientIpOf`) en `_shared.js`. **92 tests siguen verdes.** Ver §20 |
| **F8** Split `NetworkDevicesModule.tsx` | ✅ | — | Monolito 1313 LOC → **433** (orquestador) + 4 hooks (`useDeviceScan`, `useDeviceList`, `useColumnPrefs`, `useDeviceLibrary`) + 5 componentes (`ScanControls`, `ScanProgressBanner`, `DeviceFilters`, `DeviceTable`, `DeviceTableRow` memoizado). Virtualización con `@tanstack/react-virtual` queda para F10. **92 tests siguen verdes** + ESLint warnings bajaron 130 → **115** (tras fixup `5c19cb6`). Ver §21 |
| **F9** Observabilidad — health + Prometheus | ✅ | — | `prom-client@15`, [server/lib/metrics.js](server/lib/metrics.js) (registry + counters/histogram), middleware HTTP en [server/index.js](server/index.js) (latencia por método/ruta/status, excluye `/api/health` y `/metrics`), `GET /metrics` formato Prometheus (loopback-only por defecto; `METRICS_ALLOW_REMOTE=1` para scrape remoto), `GET /api/health` enriquecido (`mysql` + `routeros` + `smtp`) con cascada de status. **92 tests siguen verdes.** Ver §22 |
| **F10** Code-splitting frontend | ✅ | — | `React.lazy()` para 10 vistas (9 módulos + RouterAccess). [components/Common/ModuleSkeleton.tsx](vpn-manager/src/components/Common/ModuleSkeleton.tsx) como Suspense fallback compartido. `rollup-plugin-visualizer` + `npm run analyze` (dist/stats.html). **Bundle inicial: 1090 KB → 248 KB raw (-77%) · 252 KB → 77 KB gzip (-69%).** 45 chunks separados por módulo. **99 tests (62 backend + 37 frontend) verdes.** Ver §23 |
| **F11** Performance MySQL | ✅ | — | Pool con tuning explícito ([server/db/mysql.js](server/db/mysql.js) — `connectTimeout`/`maxIdle`/`keepAliveInitialDelayMs`/`acquireConnection` con `Promise.race`). [tools/analyze-queries.js](server/tools/analyze-queries.js) corre `EXPLAIN` sobre 13 queries del hot path (`npm run analyze:queries`). 8 índices compuestos nuevos en [sql/schema_perf_indexes.sql](server/sql/schema_perf_indexes.sql), idempotente ([db/migratePerf.js](server/db/migratePerf.js) → `npm run migrate:perf`) — cubren `tunnel_logs` (timeline ws + por túnel), `tunnel_user_sessions` (ACTIVE listing + current de un user + expirados), `tunnel_session_logs` (que NO tenía índice por ws), `invitations` (por email+status) y `password_resets` (activos por user). Auditoría de placeholders: 0 SQL injection — todas las concatenaciones son cláusulas `IN (?,?,...)` o keys hardcoded. **99 tests verdes (sin regresión).** Ver §24 |

### Fases pendientes

| Fase | Estado | Estimación | Bloquea a |
|------|--------|------------|-----------|
| **F12** Audit pass final + docs | ⏳ | 1 día 🟢 | — |

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
