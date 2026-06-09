# 🏗️ Plan de Implementación — Multi-usuario con Aislamiento por Sesión

> **Documento autoritativo.** Reemplaza cualquier versión previa.
> Basado en lectura directa del código (ver [DOC_FLUJO_VPN_ACTUAL.md](DOC_FLUJO_VPN_ACTUAL.md)).
> Fecha: 2026-06-06 · Regla de negocio: **1 túnel activo por usuario a la vez.**

---

## 0. Principio rector y decisiones de diseño

### 0.1 Por qué "1 túnel por usuario" es correcto (no una limitación)
El VRF evita el **conflicto de IPs entre torres con LANs iguales** (ej. `192.168.8.0/24`
existe en ND5 y ND13 — config.rsc:277, 325). Un **mismo dispositivo de usuario**
(una sola IP `192.168.21.x`) **no puede** rutear `192.168.8.0/24` a dos VRFs a la vez:
sería ambiguo. Por eso, **por usuario**, al activar un túnel nuevo se cierra el anterior.
✅ Esto se mantiene.

### 0.2 Qué cambia
Hoy ese "cerrar el anterior" es **global** (afecta a todos). El objetivo:
- El cierre/activación afecta **solo al usuario que actúa**.
- Cada usuario **solo ve** el túnel que él activó.
- Usuario A (ND1) y Usuario B (ND4) coexisten simultáneamente.

### 0.3 Cómo se logra (resumen técnico)
| Hoy (global) | Objetivo (por usuario) |
|--------------|------------------------|
| 1 mangle `src=192.168.21.0/24` | 1 mangle **por IP de usuario** `src=192.168.21.x` |
| cleanup borra TODAS las mangle ACCESO-* | cleanup borra solo `ACCESO-USER-<id>` del usuario actual |
| estado en `app_settings` global | estado en `tunnel_user_sessions` por `user_id` |
| SSE difunde a todos | SSE/`status` filtra por `req.account.sub` |
| firewall `vpn-activa → towers` (global) | firewall `src=192.168.21.x → LIST-NET-ND<n>-ONLY` |

### 0.4 El eje de todo: mapeo `user_id ↔ IP de gestión`
Sin saber **qué IP `192.168.21.x` corresponde al usuario logueado**, nada de lo anterior
funciona. Hallazgo del código:
- `adminIP` en el frontend está **hardcodeado a `192.168.21.20`** para todos
  ([useNodeManagement.ts:10](vpn-manager/src/context/hooks/useNodeManagement.ts)).
- `member_wireguard.allowed_ip` **sí** liga `user_id ↔ IP** (schema_rbac.sql:145-160) → para MEMBER.
- `mgmt_peer_owners` tiene `allowed_address` pero **sin `user_id`** → falta para OWNER/CO_MOD.

→ **Fase 0 (bloqueante):** garantizar que todo usuario que pueda activar túneles tenga
una IP de gestión conocida en el servidor, ligada a su `user_id`. **Nunca confiar en la IP que envía el cliente.**

---

## FASE 0 — Mapeo de identidad → IP (bloqueante)

### 0.1 Tabla unificada `user_mgmt_ips`
```sql
CREATE TABLE IF NOT EXISTS user_mgmt_ips (
  id            CHAR(36)    NOT NULL PRIMARY KEY,
  workspace_id  CHAR(36)    NOT NULL,
  user_id       CHAR(36)    NOT NULL,
  mgmt_ip       VARCHAR(64) NOT NULL,           -- 192.168.21.x (sin /32)
  public_key    VARCHAR(120) DEFAULT NULL,      -- peer WG asociado (si aplica)
  source        ENUM('member_wg','mgmt_peer','manual') NOT NULL,
  created_at    BIGINT      NOT NULL,
  UNIQUE KEY uq_user (workspace_id, user_id),
  UNIQUE KEY uq_ip (mgmt_ip),
  CONSTRAINT fk_umi_ws   FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  CONSTRAINT fk_umi_user FOREIGN KEY (user_id)      REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 0.2 Poblado
- **MEMBER:** copiar de `member_wireguard(user_id, allowed_ip)`.
- **OWNER/CO_MOD:** al crear peer en `/wireguard/peer/add`, escribir también aquí con `user_id`
  (hoy solo escribe `mgmt_peer_owners` sin user_id — [wireguard.routes.js:86](server/routes/wireguard.routes.js)).
- **Backfill:** script único que cruza `mgmt_peer_owners.comment`/workspace con usuarios.

### 0.3 Helper backend
```js
// server/db/repos/mgmtIpRepo.js
async function getMgmtIpForUser(workspace_id, user_id) { /* SELECT mgmt_ip ... */ }
```
> Regla de oro: el `src-address` de la mangle se toma de **aquí**, jamás del body del request.

---

## FASE 1 — Modelo de datos (sesiones)

Usar [migration_001_tunnel_user_sessions.sql](server/sql/migration_001_tunnel_user_sessions.sql)
(ya creado) con ajuste al modelo "1 por usuario":

```sql
tunnel_user_sessions (
  id, workspace_id, user_id, tunnel_id, mgmt_ip,
  status ENUM('ACTIVE','CLOSING'),
  activated_at, deactivated_at,
  mangle_id        VARCHAR(255),    -- .id de la mangle creada (cleanup preciso)
  firewall_rule_ids TEXT,           -- JSON [.id,...] de reglas forward (cleanup)
  UNIQUE KEY uq_user_active (workspace_id, user_id, status)  -- 1 ACTIVE/usuario
)
```
- `tunnel_session_logs` → auditoría append-only (quién/cuándo/acción).
- Eliminar dependencia de `app_settings.active_vrf` (queda solo como fallback legacy).

### Repos nuevos
```
server/db/repos/sessionRepo.js
  create({...}) · getActiveByUser(ws,user) · getActiveByTunnel(ws,tunnel)
  close(id) · listActiveForWorkspace(ws)  // admin
server/db/repos/mgmtIpRepo.js  (Fase 0)
```

---

## FASE 2 — MikroTik (configuración)

### 2.1 Address-lists por nodo (setup, una vez)
Para aislar el **acceso** (no solo el ruteo), cada nodo necesita su lista de LAN:
```rsc
/ip/firewall/address-list
add list=LIST-NET-ND1-ONLY  address=10.1.1.0/24     comment="LAN ND1"
add list=LIST-NET-ND4-ONLY  address=142.152.7.0/24  comment="LAN ND4"
# ... una por nodo (derivado de nodes.lan_subnets)
```
> El provisioning de nodo ([node.routes.js:428](server/routes/node.routes.js)) debe **además**
> crear `LIST-NET-ND<n>-ONLY` al dar de alta cada túnel.

### 2.2 Mangle POR IP (reemplaza la global)
**Activar** (lo que el backend ejecutará):
```rsc
/ip/firewall/mangle/add
  chain=prerouting action=mark-routing
  src-address=<mgmt_ip>                 # ej. 192.168.21.20 — del usuario
  dst-address-list=LIST-NET-REMOTE-TOWERS
  new-routing-mark=<targetVRF>
  comment=ACCESO-USER-<user_id8>        # marca de propiedad para cleanup
  passthrough=yes
```
**Cambiar de túnel (mismo usuario):** borrar solo `comment=ACCESO-USER-<user_id8>` y recrear → su anterior se cierra, los de otros usuarios intactos.

### 2.3 Firewall forward por IP (aislamiento de acceso)
```rsc
/ip/firewall/filter
# Permitir SOLO al usuario hacia la LAN de SU túnel activo
add chain=forward src-address=<mgmt_ip> dst-address-list=LIST-NET-ND<n>-ONLY \
    action=accept comment=FW-USER-<user_id8>
# (se mantiene el drop preventivo final, config.rsc:246)
```
> Importante: hoy la regla `vpn-activa → LIST-NET-REMOTE-TOWERS` (config.rsc:235) es **global**
> y permitiría a cualquiera llegar a cualquier torre. Debe **restringirse** o quedar por debajo
> de las reglas por-usuario, de modo que el acceso efectivo lo definan las `FW-USER-*`.

### 2.4 Limpieza al desactivar
```rsc
/ip/firewall/mangle/remove [find comment=ACCESO-USER-<user_id8>]
/ip/firewall/filter/remove [find comment=FW-USER-<user_id8>]
```

### 2.5 Conflicto de IP (garantía intacta)
Cada `mgmt_ip` mapea a **un** VRF a la vez. N usuarios = N mangle = N VRFs simultáneos,
sin colisión de LANs duplicadas (cada VRF tiene su tabla). ✅

---

## FASE 3 — Backend (Express)

### 3.1 `POST /api/tunnel/activate` — reescritura ([core.routes.js:140](server/routes/core.routes.js))
```
1. user_id = req.account.sub               // identidad real
2. mgmt_ip = mgmtIpRepo.getMgmtIpForUser(ws, user_id)
   - si no existe → 409 "Tu dispositivo de gestión no está registrado"
3. Validar permiso sobre el VRF:
   - OWNER/CO_MOD: el nodo pertenece a su workspace (nodeBelongsToRequester)
   - MEMBER: tunnel_assignments incluye ese tunnel_id      // node.routes.js:38-44
   - si no → 403
4. Cerrar sesión previa DEL MISMO USUARIO (si existe):
   - sessionRepo.getActiveByUser → si hay, remover su mangle (mangle_id) + fw rules
     y sessionRepo.close()        // "switch tunnel" = cierra el anterior, solo suyo
5. Crear en MikroTik (conexión limpia):
   - mangle src=mgmt_ip ... comment=ACCESO-USER-<id8>   → guardar .id
   - firewall forward src=mgmt_ip dst=LIST-NET-ND<n>-ONLY comment=FW-USER-<id8> → .ids
6. sessionRepo.create({ user_id, tunnel_id, mgmt_ip, mangle_id, firewall_rule_ids, ACTIVE })
7. tunnel_session_logs(ACTIVATE)
8. SSE: emitir SOLO al user_id (no broadcast global)
9. 200 { vrf, mgmt_ip }
```
**Quitar:** `setAppSetting('active_vrf'...)` global y el `broadcastTunnelEvent` a todos.

### 3.2 `POST /api/tunnel/deactivate` ([core.routes.js:213](server/routes/core.routes.js))
```
1. session = sessionRepo.getActiveByUser(ws, req.account.sub)
2. si no es suya / no existe → 404
3. MikroTik: remover mangle (session.mangle_id) + fw rules (session.firewall_rule_ids)
4. sessionRepo.close(session.id) ; log(DEACTIVATE)
5. SSE al user_id ; 200
```
> `cleanTunnelRules` global ([routeros.service.js:82](server/routeros.service.js)) **ya no** se usa
> en el flujo normal (queda como herramienta de admin/repair).

### 3.3 `GET /api/tunnel/status` — por usuario ([core.routes.js:291](server/routes/core.routes.js))
Devuelve **solo** la sesión activa de `req.account.sub` (o `null`). Nada global.

### 3.4 SSE `GET /api/tunnel/events` ([core.routes.js:280](server/routes/core.routes.js))
- Mantener un mapa `user_id → Set<res>`.
- `broadcastTunnelEvent` → `emitToUser(user_id, payload)`. Admin puede recibir todos.

### 3.5 `POST /api/nodes` — flags por usuario ([node.routes.js:75](server/routes/node.routes.js))
Tras `filterNodesForRole`, anexar por nodo:
```js
node.running_by_you  = !!sessionRepo.getActiveByUser(ws, sub, node.nombre_vrf)
node.active_by_other = (admin) ? sessionRepo.getActiveByTunnel(ws, node.nombre_vrf) : null
```
> Para no-admin: NO revelar que otro usuario lo tiene activo (privacidad). Para admin: sí.

### 3.6 `/tunnel/keepalive` ([core.routes.js:233](server/routes/core.routes.js))
Recrea la mangle **del usuario** (`ACCESO-USER-<id8>` con su `mgmt_ip`), no la global.

### 3.7 `/tunnel/mangle-access` y `/tunnel/repair`
Migrar a modelo por-IP o marcar como **admin-only** (hoy crean mangle global — [core.routes.js:601-630, 729](server/routes/core.routes.js)).

### 3.8 Escaneo y acceso a equipos (consistencia)
El escaneo SSH/airOS rutea por el túnel activo. Validar que el escaneo de un usuario use
**su** VRF activo (su `mgmt_ip`), de modo que A no escanee la LAN de B.
Revisar `device.routes.js` / `node.routes.js` scan-stream para atar el origen al `mgmt_ip` del solicitante.

---

## FASE 4 — Frontend (React)

### 4.1 Estado: de global a "mi sesión"
- `activeNodeVrf` pasa a significar **mi** VRF activo (viene de `/tunnel/status` filtrado).
- **Eliminar** el `adminIP` hardcodeado ([useNodeManagement.ts:10](vpn-manager/src/context/hooks/useNodeManagement.ts),
  [VpnProvider.tsx:104](vpn-manager/src/context/VpnProvider.tsx)): el backend ya no lo necesita del cliente.

### 4.2 `useNodeActivation.ts` ([ruta](vpn-manager/src/components/VPN/NodeCard/hooks/useNodeActivation.ts))
- Quitar el `deactivateAllNodes()` global (líneas 29-33). El backend ya cierra **solo** la sesión propia al activar otra.
- `activate` ya no envía `tunnelIP/ip/user/pass` (el backend usa `req.mikrotik` + `mgmt_ip` server-side). Enviar solo `{ targetVRF }`.

### 4.3 `useTunnelSync.ts` ([ruta](vpn-manager/src/context/hooks/useTunnelSync.ts))
- `/tunnel/status` y SSE ahora son por-usuario → el estado refleja solo lo mío.
- `BroadcastChannel` entre pestañas del **mismo** usuario sigue válido.

### 4.4 UI — `NodeCard`
- `running_by_you === true` → botón **Desactivar** + badge "Activo (tú)".
- `running_by_you === false` → botón **Activar** (cierra mi anterior si tengo otro).
- (Admin) `active_by_other` → badge informativo "En uso por {nombre}".
- Indicador "1 activo a la vez": si tengo otro activo, el botón Activar muestra
  "Cambiar a este túnel (cerrará el actual)".

### 4.5 Vista "Mi sesión activa"
Pequeño panel en Dashboard/Nodos: muestra mi túnel activo + tiempo + botón desactivar.

---

## FASE 5 — Secuencia de despliegue (orden seguro)

```
1. BD: migrar user_mgmt_ips + tunnel_user_sessions + logs        (no rompe nada)
2. Backend: poblar user_mgmt_ips (member_wg + backfill peers)    (idempotente)
3. MikroTik: crear LIST-NET-ND<n>-ONLY por nodo                  (aditivo)
4. Backend: desplegar endpoints nuevos en modo "doble escritura":
   - escribe sesión por-usuario Y mantiene app_settings legacy   (compatible)
5. Frontend: desplegar UI por-usuario detrás de flag             (canary)
6. MikroTik: cambiar mangle global → por-IP; ajustar firewall    (corte controlado)
7. Quitar legacy (app_settings.active_vrf, broadcast global)     (limpieza)
```
Cada paso es reversible; el corte real de red es solo el paso 6.

---

## FASE 6 — Casos borde, seguridad y rollback

### Seguridad
- **IP spoofing:** el `src-address` SIEMPRE sale de `user_mgmt_ips` (server-side), nunca del body.
- **Permisos:** activar valida workspace (OWNER/CO_MOD) o `tunnel_assignments` (MEMBER).
- **Ownership:** desactivar solo la sesión propia (admin puede forzar cierre de cualquiera).

### Casos borde
| Caso | Manejo |
|------|--------|
| Usuario sin `mgmt_ip` | 409 con instrucción de registrar su WireGuard |
| Dos usuarios **comparten** la misma IP de gestión | Ruteo no puede distinguirlos (límite físico). La **visibilidad** sí se aísla (por `user_id`). Recomendado: 1 peer por dispositivo/usuario |
| Expiración (30 min) | Job que cierra sesiones vencidas + limpia su mangle/fw |
| Caída de MikroTik a media activación | Transacción: si MikroTik falla, no se persiste sesión ACTIVE (rollback) |
| Logout | Cerrar sesión activa del usuario (cleanup MikroTik) |

### Rollback
- Revertir paso 6 (restaurar mangle global desde backup de config).
- Backend vuelve a modo legacy (`app_settings.active_vrf`).

---

## FASE 7 — Checklist de validación

```
[ ] A activa ND1 y B activa ND4 simultáneamente → ambos funcionan
[ ] A NO ve el túnel de B (no-admin)  ·  Admin SÍ ve ambos
[ ] A activa ND5 teniendo ND1 → su ND1 se cierra, el de B intacto
[ ] A no puede desactivar la sesión de B (404/403)
[ ] Firewall: A no alcanza la LAN de B (ping/scan bloqueado)
[ ] Conflicto de IP: A(ND5=192.168.8.0/24) y B(ND13=192.168.8.0/24) coexisten sin choque
[ ] Escaneo de A usa su VRF; no ve equipos de B
[ ] Logout de A cierra su mangle/fw en MikroTik
[ ] Expiración 30min limpia mangle/fw
[ ] mgmt_ip se toma del server, no del cliente (probar spoof → ignorado)
```

---

## RESUMEN DE ARCHIVOS A TOCAR

| Capa | Archivo | Acción |
|------|---------|--------|
| BD | `sql/migration_001_*.sql`, nuevo `migration_002_user_mgmt_ips.sql` | crear tablas |
| BD | `db/repos/sessionRepo.js`, `db/repos/mgmtIpRepo.js` | nuevos repos |
| Backend | `routes/core.routes.js` | reescribir activate/deactivate/status/SSE/keepalive |
| Backend | `routes/node.routes.js` | flags `running_by_you`; crear `LIST-NET-ND<n>-ONLY` en provisión |
| Backend | `routes/wireguard.routes.js` | escribir `user_mgmt_ips` al crear peer |
| Backend | `routes/device.routes.js` | atar escaneo al `mgmt_ip` del solicitante |
| Frontend | `context/hooks/useNodeManagement.ts` | quitar `adminIP` hardcodeado |
| Frontend | `components/VPN/NodeCard/hooks/useNodeActivation.ts` | quitar deactivate global; payload mínimo |
| Frontend | `context/hooks/useTunnelSync.ts` | status/SSE por-usuario |
| Frontend | `components/VPN/NodeCard/*` | UI por-usuario (running_by_you) |
| MikroTik | config | address-lists por nodo; mangle/firewall por-IP |

---
**Fin del plan** · Single source of truth (2026-06-06)
