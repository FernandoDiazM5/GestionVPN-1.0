# 🧭 Resumen de Contexto Maestro — ProyectoVPN_3.0 (GestionVPN-1.0)

> Documento de traspaso. Pégalo en un chat nuevo para dar contexto completo.
> Última actualización: 2026-06-07 · Rama: `dev`

---

## 1. Objetivo del Proyecto

Panel web **multi-tenant (SaaS)** para administrar túneles VPN sobre un **MikroTik central compartido** (RB750GL, RouterOS 7.19.3) y monitorear equipos **Ubiquiti airOS** (APs/CPEs) en las LAN remotas de torres de un ISP.

**Problema que resuelve:** un operador necesita acceder remotamente a las redes LAN de ~13 torres. Muchas torres tienen **rangos LAN idénticos** (ej. `192.168.8.0/24` en ND5 y ND13, `142.152.7.0/24` en varias) → para evitar **conflicto de IPs** se usa **VRF** (una tabla de ruteo por torre). El operador "activa" un túnel y su tráfico se enruta al VRF correcto.

**Evolución en curso (foco de esta sesión):** pasar de **single-user** (un solo túnel activo global; todos los que entran al sistema ven lo mismo) a **multi-usuario con aislamiento por sesión**: cada usuario activa su propio túnel, ve solo el suyo, y varios coexisten simultáneamente. Regla de negocio: **1 túnel activo por usuario a la vez** (cambiar de túnel cierra el anterior — necesario por el conflicto de IPs).

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript (strict) + Vite + Tailwind CSS v3 + lucide-react |
| Estado FE | Context API (`VpnContext`/`VpnProvider`, `WorkspaceSession`) + hooks por feature |
| Backend | **Node.js + Express** (JS plano, sin TS), puerto **:3001** |
| RouterOS | `node-routeros` v1.6.9 (API binaria :8728) |
| SSH | `ssh2` (Ubiquiti airOS) |
| BD | **MySQL/MariaDB** (XAMPP local, DB `vpn_manager`) — única BD (operativa + RBAC + multiusuario) |
| Auth | JWT (cookie HttpOnly `vpn_session`) + `bcryptjs`; cripto AES-256-GCM para credenciales |
| Infra | Docker disponible (engine ahora SÍ arranca); frontend `:5173` base `/GestionVPN-1.0/` |

**Credenciales prueba:** `admin/admin` (platform_admin) · `fernando@local.app` / `48523451` (OWNER, dueño de los 13 túneles) · `qateam@demo.com` (MEMBER). MikroTik: `MT_IP=192.168.21.1` (IP interna WG de gestión — el backend solo la alcanza con el túnel WireGuard de gestión levantado), `MT_USER=admin`, `MT_PASS` cifrada en `app_settings`.

---

## 3. Arquitectura y Lógica de Negocio

### 3.1 Modelo de identidades (3 planos)
- **Cuenta app** (`users` + `workspace_members`): quién inicia sesión. Roles: `OWNER`/`CO_MODERATOR`/`MEMBER` + flag `is_platform_admin`.
- **Peer WG de gestión** (`/interface/wireguard/peers` en `VPN-WG-MGMT`): dispositivo físico con IP `192.168.21.x/32`.
- **Nodo/túnel** (`/ip/vrf` + tabla `nodes`): torre remota (SSTP o WireGuard) con su VRF.

### 3.2 El mecanismo de aislamiento (decisión de diseño CLAVE)
En esta config, **el control de acceso lo hace el RUTEO (mangle + VRF), no el firewall**. Si el tráfico de `192.168.21.x` no recibe `routing-mark`, cae en tabla `main` → no hay ruta a la LAN remota → se descarta. Acceso = existe una regla mangle que marca tu tráfico.

- **Antes (single-user):** UNA mangle global `src=192.168.21.0/24 → VRF-NDx` (comment `ACCESO-ADMIN`). Marcaba a TODOS hacia el mismo VRF. Estado global en `app_settings.active_vrf`. SSE difundía a todos.
- **Ahora (multi-usuario):** UNA mangle **por IP de usuario**: `src=<su IP> dst-address-list=LIST-NET-REMOTE-TOWERS new-routing-mark=<su VRF> comment=ACCESO-USER-<userId8>`. N usuarios = N mangle = N VRFs simultáneos, sin colisión (cada VRF solo enruta su LAN). La IP **siempre se resuelve server-side** desde `user_mgmt_ips` (anti-spoofing; nunca del body).

### 3.3 Esquemas MySQL
- **`schema_ops.sql`** (operativo): `nodes` (+`workspace_id`,`nombre_vrf`,`ppp_user`,`lan_subnets`...), `node_ssh_creds`, `aps`, `cpes`, `app_settings` (col `` `key` `` reservada — guarda `MT_IP/MT_USER/MT_PASS`, legacy `active_vrf`), etc.
- **`schema_rbac.sql`**: `users`, `workspaces`, `workspace_members`, `invitations`, `tunnel_assignments` (qué túneles puede usar un MEMBER), `member_wireguard` (`user_id`↔`allowed_ip`), `tunnel_logs`, `auth_attempts`.
- **`schema_multiuser.sql`** (NUEVO esta sesión, ya migrado): 
  - `user_mgmt_ips` (`user_id`↔`mgmt_ip` 192.168.21.x, `UNIQUE(workspace,user)` + `UNIQUE(mgmt_ip)`) ← eje anti-spoofing.
  - `tunnel_user_sessions` (sesiones por usuario, `status ACTIVE/CLOSED`, `mgmt_ip`, `vrf_name`, `expires_at` TTL 30 min).
  - `tunnel_session_logs` (auditoría append-only).

### 3.4 Flujo de activación (`POST /api/tunnel/activate`)
```
1. user_id = req.account.sub
2. canUseTunnel(req, targetVRF)  → OWNER/CO_MOD: nodo de su workspace · MEMBER: tunnel_assignments
3. mgmtIp = user_mgmt_ips[user]   (409 NO_MGMT_IP si no tiene)
4. Conexión LECTURA: vrfExists + findUserMangleIds(suyas) + findLegacyGlobalMangleIds
5. Conexión ESCRITURA: remove (mangle previa del usuario + legacy global) + addUserMangle
6. sessionRepo.createSession (transacción: cierra ACTIVE previa + inserta nueva)
7. SSE emitToUser(user_id)  (NO broadcast global)
```
Deactivate/keepalive/status/SSE son **por usuario** (`req.account.sub`). `GET /api/nodes` anota `running_by_you` y `active_by_other` (solo admin), SIN sobrescribir `running` (= conectividad real de la torre).

---

## 4. Estado Actual

### ✅ Completado y funcionando
- **Activación multi-usuario por IP** — VERIFICADO end-to-end contra el router real (logs `[KEEPALIVE] user=...VRF-ND1-HOUSENET — OK` confirman sesión activa de fernando).
- **BD multiusuario migrada** (`npm run init:multiuser` corrido OK; 3 tablas creadas).
- **Mapeos creados:** fernando→`192.168.21.20` (OWNER, manual), qateam→`192.168.21.61` (MEMBER, auto desde member_wireguard).
- **Backend por-usuario:** activate/deactivate/keepalive/status/SSE reescritos (`core.routes.js`).
- **Auto-sanado:** elimina automáticamente la mangle global legacy `ACCESO-ADMIN` al activar.
- **Parche `!empty`** en `routeros.service.js`: RouterOS responde `!empty` en `/print` sin filas; node-routeros v1.6.9 lanzaba `UNKNOWNREPLY` (uncaughtException → 500). Parche en `Channel.processPacket` lo ignora → resultado vacío `[]`.
- **Auditoría completa** (Semgrep + security-review + code-review) en `AUDITORIA_2026-06-07.md`.
- **Fixes C1–C7 aplicados** (manejo de fallos RouterOS, fail-closed): deactivate no cierra sesión si falla el borrado; status expira limpiando mangle antes de cerrar; sin mangles duplicadas; `startMonitor` sin solapamiento.
- **MySQL estable** (health checks 10s + reconexión) y UX P6 (de sesiones previas).

### ⚠️ Problema ACTIVO (lo que falla AHORA MISMO)
- **`POST /api/wireguard/peers` → 500 y el servidor se CAE** (puerto 3001 queda abajo). Este endpoint (en `server/routes/wireguard.routes.js`, lista los peers de gestión de la sección "Usuarios") provoca un crash. Aún **no se ha capturado el error exacto**.
- **Hipótesis principal:** una excepción no capturada (probablemente otra respuesta de RouterOS no manejada, o un fallo en el parseo/listado de peers WG) que el `process.on('uncaughtException')` de `index.js` no contiene, o un throw síncrono dentro de node-routeros similar al de `!empty` pero en otro punto. Hay que **reproducirlo server-side** (como se hizo con activate) para ver el stack real.

### 🟠 Pendiente de seguridad (de la auditoría, no bloqueante)
- **V1:** `register-my-ip` valida que el peer EXISTA pero no que PERTENEZCA al usuario → un MEMBER podría reclamar una IP de gestión ajena sin dueño. Fix recomendado: exigir que el `comment=member:<user_id>` del peer coincida con `req.account.sub`, o que el moderador asigne el mapeo.

---

## 5. Archivos Clave

```
server/
├── index.js                         — Express, CORS, uncaughtException guard, bootstrap MySQL
├── routeros.service.js              — connectToMikrotik, safeWrite, ★PARCHE !empty★ (Channel.processPacket)
├── auth.middleware.js               — verifyToken (cookie/Bearer) → req.account {sub,workspace_id,role,platform_admin} + injectMikrotik (MT_* de app_settings)
├── db.service.js                    — shim MySQL (get/all/run/exec) + AES-256-GCM (encryptPass/decryptPass)
├── routes/
│   ├── core.routes.js               — ★ tunnel/activate · deactivate · keepalive · status · events(SSE) · register-my-ip · my-mgmt-ip · repair (todo POR USUARIO) ★
│   ├── node.routes.js               — /nodes (filterNodesForRole + annotateSessions: running_by_you/active_by_other) · provision · deprovision
│   ├── wireguard.routes.js          — ⚠️ /wireguard/peers (CRASH ACTUAL) · peer/add (crea peer MGMT + registra mgmt_peer_owners)
│   ├── team.routes.js               — invitaciones + provisionMemberWgByPublicKey (crea member_wireguard)
│   └── settings.routes.js           — MT_* solo platform_admin
├── lib/
│   └── tunnelProvisioner.js         — ★ mangle por-IP: addUserMangle/findUserMangleIds/removeMangleIds/vrfExists/hasUserMangle/findLegacyGlobalMangleIds (lecturas LANZAN ante fallo; removeMangleIds lanza si algún remove falla) ★
├── db/
│   ├── mysql.js                     — pool + withTransaction + startMonitor (health check, guard anti-solapamiento)
│   ├── initMultiuser.js             — crea schema_multiuser + backfill member_wg→user_mgmt_ips  (npm run init:multiuser)
│   ├── mapUserMgmtIp.js             — script: mapear usuario→IP  (node db/mapUserMgmtIp.js <email> <ip>)
│   └── repos/
│       ├── sessionRepo.js           — ★ createSession (1 ACTIVE/usuario, transacción) · getActiveByUser/ByTunnel · closeSession · touch · log ★
│       ├── mgmtIpRepo.js            — ★ getMgmtIpForUser (fuente del src-address, anti-spoofing) · upsert ★
│       └── assignmentRepo.js        — tunnel_assignments (permisos MEMBER)
└── sql/
    ├── schema_ops.sql · schema_rbac.sql · schema_multiuser.sql

vpn-manager/src/
├── context/hooks/
│   ├── useTunnelSync.ts             — status + SSE (ahora por-usuario) + BroadcastChannel entre pestañas
│   ├── useTunnelKeepalive.ts        — heartbeat cada N seg
│   └── useNodeManagement.ts         — estado nodos/activeNodeVrf/adminIP (★adminIP hardcodeado .20 — a eliminar★)
├── components/VPN/NodeCard/
│   ├── hooks/useNodeActivation.ts   — ★ handleActivate → POST /tunnel/activate {targetVRF}; maneja 409 NO_MGMT_IP ★
│   └── components/NodeCardNameSection.tsx — badge "en uso por X" (admin)
└── types/api.ts                     — NodeInfo.running_by_you/active_by_other; TunnelActivateResponse.sessionId/tunnelExpiry/code

DOCS (raíz):
├── RESUMEN_CONTEXTO_MAESTRO.md (este) · AUDITORIA_2026-06-07.md · IMPLEMENTACION_F1_F4.md
├── PLAN_IMPL_DETALLADO.md · PLAN_MULTIUSER_SESSIONS.md · DOC_FLUJO_VPN_ACTUAL.md · HANDOFF.md
```

**Comandos:** `cd server && npm run dev` (verás `[ROUTEROS] Parche !empty aplicado...` al arrancar) · `npm run init:multiuser` · `cd vpn-manager && npm run dev` → `http://localhost:5173/GestionVPN-1.0/`.

---

## 6. Próximos Pasos

### 🔴 INMEDIATO — Depurar el crash de `POST /api/wireguard/peers`
El servidor se cae (500 + puerto 3001 abajo) al abrir la sección "Usuarios"/WireGuard. 
**Plan:** reproducir server-side con un script de diagnóstico (como se hizo con activate) que: conecte a MikroTik con las creds reales (`getAppSetting('MT_*')` + `decryptPass`), ejecute lo mismo que el endpoint (`safeWrite(api,['/interface/wireguard/print'])` y `['/interface/wireguard/peers/print']`) y capture el stack exacto. Verificar si es otro throw síncrono de node-routeros no cubierto por el parche `!empty`, o un error de parseo. Confirmar también que `index.js` mantiene vivo el proceso (el `uncaughtException` guard) — si el server "se cae", puede que el error no entre en `SAFE_CODES`.

### 🟠 SIGUIENTE — V1 seguridad (`register-my-ip`)
Validar propiedad del peer antes del upsert (comment `member:<user_id>` == `req.account.sub`).

### 🟡 LUEGO — Limpiezas y robustez
- Quitar `adminIP` hardcodeado (`useNodeManagement.ts`) — ya no se usa server-side.
- Warning cosmético MySQL2 (`keepAliveInitialDelayMs invalid option`) — opcional limpiar.
- Job batch de expiración de sesiones (hoy es perezoso en `/tunnel/status`).
- Atar el escaneo (`device.routes.js`) al `mgmt_ip` del solicitante.
- **Fase 5 (opcional):** aislamiento de firewall por-IP + acotar regla "Admin MGMT libre" (config.rsc) — defensa en profundidad (hoy el ruteo ya aísla).
- Dockerfile: `USER` no-root (hallazgo Semgrep S1).

### Notas de estado del entorno
- Backend corre en proceso background del asistente; el puerto 3001 puede estar **caído** por el crash — relanzar con `npm run dev`.
- Config MikroTik actual (`v2.rsc`): SIN mangle global (baseline limpio multi-usuario). El backend crea las mangle por-IP dinámicamente.
- Hay 1 peer de prueba `peer27` con public-key placeholder (`abcdEFGH...`) creado por el flujo de invitaciones en pruebas — inválido, se puede borrar.
```
