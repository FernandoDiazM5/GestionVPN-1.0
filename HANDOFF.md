# 📦 Handoff Técnico — MikroTikVPN Remote Manager (`GestionVPN-1.0`)

> Documento de migración de contexto entre sesiones.
> Rama de trabajo: **`dev`** · Remote: `github.com/FernandoDiazM5/GestionVPN-1.0`.
> Última actualización: entrega de sesión (multi-tenant + MySQL + invitaciones + UX).

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

**Estado de salud:** `tsc 0` · `vite build ✓` · backend `node --check ✓`. Árbol de trabajo limpio.

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

**Endpoints clave:**
- Auth: `POST /api/auth/login` · `/api/account/{bridge,me,logout}`.
- Admin (platform_admin): `GET /api/admin/{summary,moderators}` · `POST /api/admin/moderators` · `PATCH|DELETE /api/admin/moderators/:id`.
- Nodos (aislados): `POST /api/nodes` (lista, cache fallback) · `/api/node/{provision,deprovision,edit,...}` (con guarda de propiedad) · `/api/node/scan-stream` (guarda subred propia).
- Monitor/Equipos (aislados): `/api/ap-monitor/{nodos,cpes,...}` · `/api/db/devices`.
- Usuarios (peers WG): `POST /api/wireguard/peers` · `/api/wireguard/peer/{add,edit}`.
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

---

## 5) Tareas Pendientes (To-Do)

| Prioridad | Tarea |
|---|---|
| 🔴 Acción usuario | **O2 — Purga de historial git** (secretos en commits viejos en GitHub público). `git filter-repo`/BFG NO instalados (sin Python/Java). Requiere instalar, reescribir historial y **force-push**. |
| 🔴 Acción usuario | **Cambiar contraseñas reales** del MikroTik/SSH Ubiquiti — el plaintext era derivable del leak (clave + DB en historial). |
| 🟠 Infra | **O5 — MySQL como servicio** (XAMPP, admin). El `mysqld` se cae repetidamente; M2 ya reintenta pero la BD debe estar arriba. |
| 🟡 Pendiente | **Revisión en navegador** de los cambios UX (quedó interrumpida al abrir Chrome MCP). |
| 🟡 Mejora | **Escanear fase 2**: celdas internas de la tabla (`text-[9px]`, colores light-only en filas), badges Rol AP/CPE, barras de señal por intención. |
| 🟢 Nota | WireGuard de miembro es **best-effort** (depende del router 192.168.21.1, intermitente). |
| 🟢 Nota | Docker instalado pero su **engine no arranca** (WSL2/virtualización) → Semgrep no pudo correr. |
| 🟢 Limpieza | Borrar `server/.db_secret.bak-*` cuando se confirme todo OK. |

**Scripts:** `cd server && npm run init:rbac | migrate:sqlite | seed:roles` · `node db/rotateSecrets.js`.

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

## ⚡ Arranque rápido

1. XAMPP **MySQL** arriba (idealmente como servicio).
2. `cd server && npm run dev` (reintenta si MySQL aún no levanta).
3. `cd vpn-manager && npm run dev` → `http://localhost:5173/GestionVPN-1.0/`.
4. Login `admin/admin` o `fernando/48523451`.
5. Si una sesión vieja da 401: F12 → Application → *Clear site data* y re-login (el logout ya limpia todo).

## Reglas del proyecto (ver `vpn-manager/CLAUDE.md` y `DESIGN_SYSTEM.md`)
- Color = intención · movimiento = estado (no decorativo) · `text-xs` mínimo (`text-2xs`=11px reservado a micro-badges).
- Usar clases del sistema (`.btn-*`, `.badge-*`, `.card`, `.data-cell`, `.th-cell`, `.skeleton`, `.status-live`, `.reveal-stagger`).
- Dark mode por clase; toda animación nueva respeta `prefers-reduced-motion`.
- No versionar secretos (`.jwt_secret`, `.db_secret`, `database.sqlite*`, `.claude/worktrees/`).
