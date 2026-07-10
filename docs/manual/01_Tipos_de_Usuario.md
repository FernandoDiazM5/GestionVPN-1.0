# 👥 01 — Tipos de usuario, roles y permisos (RBAC)

> Cómo el sistema decide **quién es quién** y **quién puede hacer qué**. Modelo multi-tenant (SaaS) sobre un MikroTik compartido.
> Fuentes de verdad: backend `server/auth.middleware.js`, `server/lib/jwt.js`, guards en cada `routes/*`; frontend `vpn-manager/src/utils/permissions.ts`. Volver al [índice](./00_Indice_y_Trazabilidad.md).

---

## 1) Los tres roles

| Rol | Flag técnico | Identidad | Ve | NO ve |
|---|---|---|---|---|
| **Administrador** (Sistemas) | `platform_admin = 1` | Operador de plataforma | Dashboard · Moderadores · **Ajustes** (config del router core) | Nodos / Escanear / Monitor AP |
| **Moderador** | `role = 'OWNER'` de su workspace | Dueño del workspace | Nodos · Escanear (Equipos) · Equipo · Monitor AP · Ajustes (perfil/workspace) | Config del router core |
| **View** | `role = 'MEMBER'` | Miembro del workspace | Sus túneles asignados + perfil (cambiar clave, vincular Telegram) | Todo lo demás |

> **Un solo moderador por workspace.** Cada workspace = **1 OWNER + N MEMBERs**. El rol `CO_MODERATOR` fue **retirado** del enum (`('OWNER','MEMBER')`), de los contratos, guards, rutas y UI. No existe "promover/degradar". El alta de un moderador la hace el Administrador (invitación con rol `OWNER`). Ver HANDOFF §16.

### Por qué el Administrador no ve los nodos
La configuración del **router core compartido** es infraestructura de plataforma: solo el Administrador la gestiona (`Ajustes → Configurar router`, que escribe `MT_IP`/`MT_USER`/`MT_PASS` cifrada en `app_settings`). Los nodos, en cambio, pertenecen a cada **workspace** y los opera su moderador. Por eso los conjuntos de módulos son disjuntos.

---

## 2) Módulos visibles por rol (código real)

Definido en `visibleModules(session)` — [vpn-manager/src/utils/permissions.ts:24](../../vpn-manager/src/utils/permissions.ts):

```ts
platform_admin → ['dashboard', 'moderators', 'settings']
MEMBER         → ['nodes', 'team', 'settings']     // settings = solo Perfil + Telegram
OWNER          → ['nodes', 'devices', 'team', 'monitor', 'settings']
```

- `App.tsx` monta cada módulo de forma lazy y `SettingsModuleRouter` decide qué "Ajustes" mostrar: `isPlatformAdmin(session)` → `SettingsModule` (router core); si no → `ModeratorSettingsModule` (perfil + workspace).
- El `ModeratorSettingsModule` filtra sus tabs internamente: el **MEMBER** solo ve "Perfil" y "Notificaciones (Telegram)".
- La **etiqueta de rol** de la UI sale de `roleLabel(session)` ([permissions.ts:52](../../vpn-manager/src/utils/permissions.ts)), nunca de `credentials.role` (que arrastra el string legacy `'admin'`). Mapeo: `platform_admin→Administrador · OWNER→Moderador · MEMBER→View` (HANDOFF §4.24).

Helpers asociados (mismo archivo):
- `isPlatformAdmin(s)` → `!!s.platform_admin`
- `isModerator(role)` / `isOwner(role)` → `role === 'OWNER'`
- `canInvite(role)` / `canRemoveMembers(role)` → `isModerator(role)`
- `canSeeModule(s, m)` → `visibleModules(s).includes(m)`

> El frontend **oculta** lo que no corresponde, pero la seguridad real está en el **backend**: cada ruta sensible revalida el rol server-side (§3). La UI nunca es la frontera de seguridad.

---

## 3) Cómo se autentica y autoriza (server-side)

### 3.1 Sesión = cookie HttpOnly `vpn_session`
- Al hacer login, el backend firma un JWT con `signSession(payload)` ([lib/jwt.js:15](../../server/lib/jwt.js)). **Payload:** `{ sub: userId, email, workspace_id, role, platform_admin }`.
- Se entrega como cookie **HttpOnly** `vpn_session` (`setSessionCookie`), `sameSite=lax`, `secure` solo en producción, `path=/`, vida **8h** (`JWT_EXPIRES`).
- 🟢 **Local:** `secure=false` (HTTP funciona). 🔵 **VPS:** `secure=true` → **exige HTTPS** o no hay sesión (de ahí que HTTPS no sea opcional en prod).

### 3.2 `verifyToken` — el portero de toda ruta protegida
[server/auth.middleware.js:31](../../server/auth.middleware.js):
1. Lee la cookie `vpn_session`; si es válida y trae `sub` + `workspace_id`, pone `req.account = { sub, email, workspace_id, role, platform_admin }` y sigue.
2. Fallback legacy: acepta `Authorization: Bearer <token>` o `?token=` (para `EventSource`/SSE, que no manda headers).
3. Sin token → `401`. Token expirado/ inválido → `403 { logout: true }` (la UI cierra sesión).
4. Inyecta las credenciales del router (`injectMikrotik`): lee `MT_IP`/`MT_USER`/`MT_PASS` de `app_settings`, descifra la pass, y pone `req.mikrotik` (o `null` si no está configurado).

Montaje en `index.js`: las rutas públicas (`/api/auth`, `/api/account`, `/api/team`, `/api/admin`, `/api/workspace`, `/api/health`) van sin `verifyToken`; las operativas (`core`, `nodes`, `device`, `wireguard`, `settings`, `diagnostics`, `dashboard`, `ap-monitor`) van **detrás** de `verifyToken`.

### 3.3 Guards de autorización por rol
- **Operador del workspace:** `requireOperator` (en `routes/nodes/_shared.js`) exige OWNER (o admin) para provisión/baja/escaneo.
- **Solo plataforma:** `routes/settings.routes.js` y la config del router exigen `platform_admin` (HANDOFF §4.9).
- **Pertenencia de recurso:** antes de mutar un nodo, `nodeBelongsToRequester(req, pppUser, vrfName)` valida que el nodo sea del workspace del solicitante (por `ppp_user` **O** `nombre_vrf`, §4.20). Análogos: `cpeForeign`, `ownsApUuid`, `ownsGroupUuid`.
- **Aislamiento de lectura:** `filterNodesForRole` / `lib/tenantScope.js` filtran por `workspace_id`.

> **Anti-spoofing (regla transversal §4.3/§4.5):** la IP de gestión, el VRF y las credenciales SSH se resuelven **server-side** desde la sesión (`sessionRepo.getActiveByUser`, `mgmtIpResolver`), **nunca** desde el body del cliente. El navegador jamás envía contraseñas ni IPs de control.

---

## 4) Identidad de red de cada usuario

Cada usuario (excepto el VPS) tiene una **IP de gestión** amarrada en `user_mgmt_ips` (1 IP ↔ 1 usuario):
- **Moderador / Member** → plano **CLIENTES** `10.13.250.x`.
- **Administrador** → plano **ADMIN** `10.14.250.x`.

Esa `mgmt_ip` es la que el mangle por-usuario del Core marca (`src-address=<mgmt_ip>`) para enrutar **solo** su tráfico a su VRF. La asignación usa el **menor octeto libre** (`ipAlloc.lowestFreeOctet`, §4.14) → reutiliza huecos de usuarios borrados. La escribe `mgmtIpRepo.upsert`; si falta al activar, `activateTunnel` la **auto-cura** resolviéndola del peer vivo (`lib/mgmtIpResolver.js`, §4.23).

> El **VPS** no es un "usuario": tiene su propia IP de control (`10.12.250.60`) y el **scan-pool** (`10.11.252.x`) para el escaneo (Opción C). La scan-IP se amarra al **workspace**, no al usuario (§4.15).

---

## 5) Flujos de ciclo de vida de usuarios

### 5.1 Setup inicial (primer Administrador)
En una BD **sin usuarios**, el panel muestra el **"Setup Inicial"**: el operador crea el Administrador con su propia contraseña.
- 🔵 **VPS:** `entrypoint.sh` deja la siembra de demo **apagada** (`SEED_DEMO_USERS` no `true`) → BD vacía → aparece el Setup Inicial.
- 🟢 **Local:** se puede sembrar `admin/admin` + moderador demo con `npm run seed:roles` (o `SEED_DEMO_USERS=true`).

### 5.2 Alta de moderador (la hace el Administrador)
1. `Moderadores → Nuevo Moderador` → crea una **invitación** rol `OWNER` (+ su workspace). La scan-IP del workspace se **amarra al crearse** (`scanIpRepo.allocateInTx`).
2. Si el correo no sale (🔵 en el VPS, DigitalOcean bloquea SMTP saliente), el panel muestra el **enlace de aceptación** para compartir a mano (`GET /api/admin/invitations` lista pendientes; `POST .../:id/link` regenera).
3. El moderador abre el enlace, define su contraseña y su **WireGuard de gestión** (envía solo su clave pública; el server crea el peer y devuelve el `.conf`/QR). Queda como OWNER único del workspace.

### 5.3 Alta de member (la hace el Moderador)
`Equipo → Invitar` crea una invitación rol `MEMBER`. Al aceptar, el server crea el peer WG del member y le asigna los túneles de la invitación. La provisión WG es **best-effort**: si el router está caído, el `AcceptResponse` trae `wgError {code,message}` y la UI ofrece **"Reintentar"** (self-service `POST /api/team/me/wireguard`).

### 5.4 Recuperación de WireGuard (self-service)
Cualquier moderador/member que se quedó sin acceso WG lo regenera en `Ajustes → WireGuard` (`WireGuardTab.tsx` → `POST /api/team/me/wireguard`): QR + descargar `.conf` + regenerar (idempotente, limpia el peer anterior).

### 5.5 Baja de moderador (cascada)
`DELETE /api/admin/moderators/:id` (Administrador): de-provisiona **cada nodo** del workspace en el router (`deprovisionNodeOnRouter`, §4.12), borra sus peers de gestión, libera sus `user_mgmt_ips`, y limpia ~16 tablas en cascada en BD. **Best-effort:** un router caído no bloquea el borrado en BD. **Nunca** toca `LIST-NET-REMOTE-TOWERS` (§4.13).

---

## 6) Resumen de qué puede hacer cada rol

| Acción | Admin | Moderador (OWNER) | View (MEMBER) |
|---|:--:|:--:|:--:|
| Configurar el router core (`MT_*`) | ✅ | ❌ | ❌ |
| Crear/borrar moderadores | ✅ | ❌ | ❌ |
| Dashboard de plataforma / métricas | ✅ | ❌ | ❌ |
| Dar de alta / baja nodos | ❌ | ✅ | ❌ |
| Activar/desactivar túneles | ✅¹ | ✅ | ✅ (solo asignados) |
| Escanear LAN / Monitor AP | ❌ | ✅ | ❌ |
| Invitar / remover members | ❌ | ✅ | ❌ |
| Cambiar su contraseña / vincular Telegram | ✅ | ✅ | ✅ |
| Regenerar su WireGuard | ✅ | ✅ | ✅ |

¹ El admin puede activar túneles desde su plano ADMIN para diagnóstico; la operación diaria de túneles es del moderador y sus members.

> Siguiente: [02 — Referencia de funciones](./02_Referencia_de_Funciones.md).
