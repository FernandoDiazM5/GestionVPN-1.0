# Plan de Implementación — Sistema de Roles Unificado (Admin / Moderador / View)

> Rama: `dev` · Continúa el trabajo multi-usuario (Fases 1-4 ya completadas).
> Objetivo: un único modelo de 3 roles, con visibilidad por rol, dashboard de
> administrador, CRUD de usuarios, configuración VPS/túneles y auto-provisión
> de WireGuard al dar de alta moderadores/miembros.

---

## 1. Diagnóstico — dos sistemas de roles conviviendo

| Sistema | Almacén | Roles | UI actual |
|---------|---------|-------|-----------|
| **Legacy** | SQLite (`users`) | `admin` / `viewer` | Ajustes → "Personal y Roles" (`/api/users`) |
| **RBAC** (Fases 2-4) | MySQL (`workspace_members`) | `OWNER` / `CO_MODERATOR` / `MEMBER` | Pestaña "Equipo" (`/api/team`) |

**Problema:** dar de alta usuarios en dos lugares con dos vocabularios. **Decisión:
unificar todo en el RBAC** (MySQL), que ya tiene invitaciones, OTP, auditoría y SSE.

### Modelo de negocio (CONFIRMADO) — SaaS multi-tenant con operador de plataforma

- **Administrador (Sistemas / operador de la plataforma):** TÚ. Das de alta a cada
  cliente que contrata el servicio creándole un usuario **Moderador**. Tu perfil
  es acotado: **Dashboard global** + **crear/gestionar Moderadores**. NO gestionas
  túneles tú mismo (eso es del Moderador).
- **Moderador (cliente):** dado de alta por el Administrador. Es **dueño de su
  propio espacio (workspace)** y usa el sistema en **toda su capacidad** (Nodos,
  Escanear, Usuarios, Equipo, Monitor AP, Ajustes de su perfil). **No puede crear
  otros Moderadores.** Invita a sus propios miembros (View).
- **View (miembro del Moderador):** invitado por un Moderador a su workspace; ve
  los túneles que se le asignan y recibe su acceso WireGuard.

### Mapeo de roles (canónico)
| Rol UI (es) | Técnico | Ámbito | Concepto |
|-------------|---------|--------|----------|
| **Administrador** | `PLATFORM_ADMIN` (flag global) | Toda la plataforma | Operador: dashboard + alta de Moderadores |
| **Moderador** | `OWNER` de su workspace | Su workspace | Cliente: sistema completo, sin crear Moderadores |
| **View** | `MEMBER` | Workspace del Moderador | Ve sus túneles asignados + acceso WG |

> El **Administrador es un rol por encima de los workspaces** (no es tenant).
> Cada **Moderador = OWNER de un workspace nuevo** que el Admin le crea.
> La pantalla legacy "Personal y Roles" se reemplaza por el panel RBAC.
> El login legacy ya está unificado (sesión por cookie, Fase 4).

---

## 2. Matriz de permisos y visibilidad

| Vista / Acción | Administrador (Sistemas) | Moderador (cliente) | View (miembro) |
|----------------|:---:|:---:|:---:|
| **Dashboard global** (todos los workspaces) | ✅ | ❌ | ❌ |
| **Crear/gestionar Moderadores** | ✅ | ❌ | ❌ |
| **Nodos** | ❌ (no opera túneles) | Todos los de su workspace | Solo asignados (conectar/revocar) |
| **Escanear** | ❌ | ✅ | ❌ |
| **Monitor AP** | ❌ | ✅ | ❌ |
| **Usuarios** (su equipo) | ❌ | ✅ | ❌ |
| **Equipo** (invitar View + WG) | ❌ | ✅ | Ver su perfil |
| **Ajustes → Config (VPS, túneles)** | ❌ | ✅ (de su workspace) | ❌ |
| **Ajustes → Mi perfil** | ✅ | ✅ | ✅ |

> El Administrador NO usa los módulos de red (Nodos/Escanear/etc.); su trabajo es
> operar la plataforma. El Moderador SÍ usa todo, dentro de su workspace.

**Visibilidad del sidebar por rol:**
- **Administrador:** Dashboard · Moderadores · Mi perfil
- **Moderador:** Nodos · Escanear · Usuarios · Equipo · Monitor AP · Ajustes(workspace+perfil)
- **View:** Nodos(sus túneles) · Equipo(perfil) · Ajustes(perfil)

---

## 3. Modelo de datos — cambios en MySQL

### 3.0 Administrador de plataforma (NUEVO)
El Administrador (Sistemas) es un rol global, por encima de los workspaces.
```sql
ALTER TABLE users ADD COLUMN is_platform_admin TINYINT(1) NOT NULL DEFAULT 0;
```
- Se marca al usuario `admin` actual como `is_platform_admin = 1` (seed/migración).
- En su JWT de sesión se incluye `platform_admin: true` → el frontend muestra
  Dashboard + Moderadores; el backend exige este flag para `/api/admin/*`.
- "Crear Moderador" = crear usuario + su workspace + membresía `OWNER`
  (reusa el helper `buildSessionForLegacyUser`/`createForOwner`, en transacción).

### 3.1 Asignación de túneles a miembros View (NUEVO)
Para que "el moderador solo vea SUS túneles":
```sql
CREATE TABLE tunnel_assignments (
  id            CHAR(36) PRIMARY KEY,
  workspace_id  CHAR(36) NOT NULL,
  tunnel_id     VARCHAR(160) NOT NULL,   -- ppp_user / vrf (textual, como en auditoría)
  user_id       CHAR(36) NOT NULL,       -- moderador/miembro
  assigned_by   CHAR(36),
  created_at    BIGINT NOT NULL,
  UNIQUE KEY uq_assign (workspace_id, tunnel_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
```
- Admin/Owner ve todos los túneles; Moderador/View ven solo los de `tunnel_assignments`.

### 3.2 WireGuard por miembro (NUEVO)
Al dar de alta un Moderador/Miembro, se le adjunta un peer WireGuard para su
dispositivo (móvil/laptop):
```sql
CREATE TABLE member_wireguard (
  id            CHAR(36) PRIMARY KEY,
  workspace_id  CHAR(36) NOT NULL,
  user_id       CHAR(36) NOT NULL,
  peer_name     VARCHAR(120) NOT NULL,
  allowed_ip    VARCHAR(64) NOT NULL,    -- IP asignada (ej. 192.168.21.X)
  public_key    VARCHAR(120),
  config_enc    TEXT,                    -- config .conf cifrada (AES-256-GCM)
  created_at    BIGINT NOT NULL,
  UNIQUE KEY uq_member_wg (workspace_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
```

---

## 4. Backend — endpoints nuevos / cambios

### 4.1 Usuarios (RBAC, reemplaza legacy `/api/users`)
- `GET  /api/team/members` — ya existe (listar con roles).
- `POST /api/team/role` · `DELETE /api/team/member/:id` — ya existen.
- **AMPLIADO** `POST /api/team/members` — alta de miembro que recibe además
  `{ tunnelIds: [], wireguard: { mode:'generate'|'publicKey', publicKey? } }` y,
  en UNA transacción, crea: membresía + `tunnel_assignments` + peer WG +
  `member_wireguard` (ver §6). Sustituye el invite "simple".
- `POST /api/team/invite` — variante por OTP que arrastra los mismos datos
  (túnel + WG) y los aplica al aceptar la invitación.
- **NUEVO (solo Administrador)** `POST /api/admin/moderators` — alta directa de
  un Moderador (usuario + workspace + OWNER). No disponible para Moderadores.

### 4.2 Asignación de túneles
- `GET  /api/team/assignments?userId=` — túneles asignados a un usuario.
- `POST /api/team/assignments` `{ userId, tunnelId }` — asignar (Admin/Moderador).
- `DELETE /api/team/assignments/:id` — desasignar.
- **Filtro en Nodos:** `/api/nodes` ya inyecta `req.account`; si rol ≠ OWNER,
  filtrar la respuesta a los `tunnel_id` asignados.

### 4.3 WireGuard por miembro
- `POST /api/team/member/:id/wireguard` — genera peer (reusa
  `/api/wireguard/peer/add`), asigna IP, guarda config cifrada, devuelve `.conf`.
- `GET  /api/team/member/:id/wireguard` — descarga la config (dueño o admin).

### 4.4 Dashboard
- `GET  /api/dashboard/summary` — métricas: nº usuarios por rol, nº túneles
  (activos/inactivos), nº APs, últimas acciones de auditoría, estado VPS.

---

## 5. Frontend — componentes y guardas

### 5.1 Guardas por rol (reutiliza `utils/permissions.ts`)
- Extender `permissions.ts`: `canSeeDashboard`, `canConfigGlobal`, `canManageUsers`,
  `canAssignTunnels`, etc.
- **Sidebar dinámico:** el `NAV` se filtra por `session.role` (ya tenemos `useSession`).
  Mostrar/ocultar Dashboard, Escanear, Monitor AP, Config Global según rol.
- **App.tsx:** cada módulo verifica el rol; si no autorizado → vista "sin permisos".

### 5.2 Vistas nuevas / cambios
- **Dashboard** (`components/Dashboard/`) — solo Admin. Tarjetas de resumen +
  timeline de auditoría (reusa `AuditTimeline`) + estado VPS.
- **Usuarios → unificar** con RBAC: la tabla de "Personal y Roles" pasa a usar
  `/api/team` (Administrador/Moderador/View) en vez de `/api/users` legacy.
- **Equipo → al invitar/crear miembro:** paso opcional "Generar acceso WireGuard"
  → muestra QR + botón descargar `.conf` para móvil/laptop.
- **Ajustes:** separar "Configuración Global" (solo Admin) de "Mi perfil" (todos).
- **Nodos:** para Moderador/View, la tabla ya viene filtrada por el backend.

### 5.3 Perfil
- `components/Profile/` — datos del usuario, cambiar contraseña, su acceso WireGuard
  (QR + descarga). Visible para todos los roles.

---

## 6. Alta de miembro = túnel-usuario + WireGuard en UN SOLO PASO

> **Requisito del cliente:** cuando el **Moderador** da de alta o invita a un
> miembro, en la MISMA acción debe **asignarle su túnel-usuario** y generarle el
> **acceso WireGuard**, para que el miembro pueda configurar su equipo (móvil/PC)
> de inmediato. No son pasos separados: el alta los crea juntos.

### Formulario de alta de miembro (Moderador, en "Equipo")
Campos en un único modal:
1. **Correo / nombre** del miembro.
2. **Rol** (View por defecto).
3. **Túnel(es) a asignar** — selector con los túneles del workspace del Moderador.
4. **Acceso WireGuard** — generar automáticamente (servidor crea las llaves) o
   pegar clave pública del cliente.

### Transacción atómica de alta (`POST /api/team/members` ampliado)
Todo en una sola transacción ACID:
1. Crea/encuentra el usuario (RBAC) + membresía `MEMBER` en el workspace.
2. Inserta los `tunnel_assignments` (los túneles seleccionados ↔ ese usuario).
3. Genera el par de claves WG (o usa la pública dada) → reusa
   `/api/wireguard/peer/add` para crear el peer en MikroTik con IP libre.
4. Construye el `.conf` (Interface + Peer + Endpoint del túnel asignado) y lo
   guarda cifrado en `member_wireguard` (AES-256-GCM).
5. Si es invitación OTP, el acceso WG se entrega al aceptar; si es alta directa,
   queda listo de una vez.

### Entrega al miembro (en su **Perfil**)
- **QR** del `.conf` para escanear desde la app WireGuard del **móvil**.
- Botón **Descargar `.conf`** para importar en **laptop/PC**.
- Datos del/los túnel(es) asignados y su estado.

> Nota: el `.conf` se ata al/los túnel(es) asignados — el miembro solo enruta
> hacia lo que el Moderador le habilitó (aislamiento por asignación).

---

## 7. Fases de implementación

### Fase A — Unificación de roles (base)
- Migrar usuarios legacy SQLite → RBAC MySQL (script idempotente).
- Etiquetas UI: Administrador / Moderador / View. Extender `permissions.ts`.
- Sidebar dinámico por rol + guardas de módulo en `App.tsx`.

### Fase B — Usuarios y alta directa
- `POST /api/team/admin/create` (alta directa por Admin con cualquier rol).
- Reemplazar "Personal y Roles" por el panel RBAC unificado (CRUD completo).

### Fase C — Asignación de túneles + filtrado por rol
- Tabla `tunnel_assignments` + endpoints.
- Filtrar `/api/nodes` por rol (View solo sus túneles asignados).

### Fase D — Dashboard de administrador
- `GET /api/dashboard/summary` + vista Dashboard (tarjetas + timeline + VPS).

### Fase E — Alta de miembro acoplada (túnel + WireGuard) + Perfil  ★ (requisito clave)
- Tabla `member_wireguard` + provisión WG.
- **Modal de alta unificado** (Moderador): correo + rol + **túnel(es)** + **acceso WG**,
  todo en una transacción (§6).
- Vista **Perfil** del miembro: QR + descarga `.conf` + túneles asignados.

---

## 8. Decisiones

1. ~~¿Mono-empresa o multi-empresa?~~ **RESUELTO: SaaS multi-tenant** con
   Administrador de plataforma que da de alta Moderadores (cada uno = OWNER de
   su workspace). Ver §3.0.
2. **Alta de moderador:** el Administrador crea el Moderador con sus credenciales
   (alta directa, sin OTP). Recomendado para tu flujo de onboarding. *(confirmar)*
3. **WireGuard:** el servidor genera el par de claves y entrega `.conf` + QR
   (más cómodo para el cliente final). *(confirmar)*
4. **"View" (miembro):** puede conectar/revocar sus túneles asignados (no editar
   ni crear). *(confirmar)*

> Pendiente menor a confirmar: ¿todos los Moderadores comparten **un mismo router
> MikroTik** (aislamiento lógico por workspace) o cada uno tiene **su propio
> router**? Hoy la app apunta a un router. Si es compartido, los túneles se
> etiquetan por workspace; si es por cliente, cada workspace guarda sus credenciales
> de router (tabla `workspace_routers` ya existe para esto).

---

## 9. Reutilización (lo que ya existe y NO se reescribe)
- Auth unificada por cookie + RBAC (Fases 2-4). ✅
- Invitaciones OTP, rate limiting, auditoría, SSE tiempo real. ✅
- Provisión de peers WireGuard en MikroTik (`/api/wireguard/peer/add`). ✅
- Cifrado AES-256-GCM (`lib/crypto.js`). ✅
- Design-system + dark mode (CLAUDE.md / DESIGN_SYSTEM.md). ✅
