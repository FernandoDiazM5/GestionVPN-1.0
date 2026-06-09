# 📘 Documentación Técnica — Flujo VPN Actual (Backend + MikroTik)

> Análisis de ingeniería de redes + software, **basado en el código real** (no inventado).
> Todas las afirmaciones tienen referencia a archivo:línea.
> Fecha: 2026-06-06 · Router: RB750GL · RouterOS 7.19.3

---

## ÍNDICE

1. [Modelo de identidades y autenticación](#1)
2. [Crear un USUARIO VPN (peer de gestión)](#2)
3. [Crear un TÚNEL VPN (provisión de nodo)](#3)
4. [Activar un túnel (mangle + VRF) — el corazón del sistema](#4)
5. [Desactivar / keepalive / status](#5)
6. [Por qué HOY solo funciona un usuario a la vez](#6)
7. [Qué se necesita para multi-usuario simultáneo](#7)

---

<a name="1"></a>
## 1. Modelo de identidades y autenticación

### 1.1 Tres planos de "usuario" que conviven

| Plano | Qué es | Dónde vive |
|-------|--------|-----------|
| **Cuenta de la app** | Quién inicia sesión (admin/moderador/miembro) | MySQL `users` + `workspace_members` |
| **Peer WG de gestión** | Dispositivo físico con IP en `192.168.21.0/24` | MikroTik `/interface/wireguard/peers` (VPN-WG-MGMT) |
| **Nodo / túnel** | Torre remota (SSTP o WG) con su VRF | MikroTik `/ip/vrf` + `nodes` (MySQL) |

> ⚠️ **Insight clave:** la "cuenta de la app" y el "peer WG" hoy **no están ligados a nivel de enrutamiento**. El MikroTik solo ve IPs (`192.168.21.x`), no sabe qué cuenta de la app las usa.

### 1.2 Flujo de autenticación — `auth.middleware.js`

`verifyToken` ([auth.middleware.js:30](server/auth.middleware.js)):
1. Lee cookie `vpn_session` (JWT RBAC) → `req.account = { sub, email, workspace_id, role }`
2. Mapea rol RBAC → legacy: `MEMBER → viewer`, `OWNER/CO_MODERATOR → admin` ([:27](server/auth.middleware.js))
3. **`injectMikrotik(req)`** ([:16](server/auth.middleware.js)) inyecta credenciales del router desde `app_settings`:
   ```js
   MT_IP, MT_USER, MT_PASS  →  req.mikrotik = { ip, user, pass }
   ```

> ⚠️ **Hay UN solo MikroTik para toda la plataforma** (`MT_*` son settings globales). No hay router por workspace en el flujo de túnel.

---

<a name="2"></a>
## 2. Crear un USUARIO VPN (peer de gestión)

**Endpoint:** `POST /api/wireguard/peer/add` — [wireguard.routes.js:59](server/routes/wireguard.routes.js)

### 2.1 Qué hace en el backend
```
1. Lee todos los peers de VPN-WG-MGMT          (:67-68)
2. Calcula la siguiente IP libre en 192.168.21.x:
   maxIP = max(IPs usadas) ó 19 → nextIP = 192.168.21.(maxIP+1)   (:69-75)
3. Crea el peer en MikroTik                      (:76-81)
4. Registra dueño en mgmt_peer_owners (workspace) (:86-96)
```

### 2.2 Qué crea en MikroTik
```rsc
/interface/wireguard/peers/add
  interface=VPN-WG-MGMT
  public-key=<clave-publica-del-cliente>
  allowed-address=192.168.21.<N>/32
  comment=<nombre>
```

### 2.3 Resultado de red
- El dispositivo del usuario obtiene **una IP /32 en `192.168.21.0/24`**.
- Esa red es `LIST-MGMT-TRUSTED` y `vpn-activa` en el firewall (config.rsc:183, 199).
- Validación: solo se exige `publicKey` ([:63](server/routes/wireguard.routes.js)). La clave privada **nunca** llega al servidor (modelo seguro).

> 📌 La asignación de IP es **secuencial global** (no por workspace): peer nuevo = `max+1`. Esto será relevante para multi-usuario (ver §7).

---

<a name="3"></a>
## 3. Crear un TÚNEL VPN (provisión de nodo)

**Endpoint:** `POST /api/node/provision` — [node.routes.js](server/routes/node.routes.js) (~línea 300-516)

### 3.1 Secuencia en MikroTik (SSTP) — [:408-462](server/routes/node.routes.js)
```
Paso 1  PPP Secret           (/ppp/secret/add service=sstp profile=PROF-VPN-TOWERS)
Paso 2  Interfaz SSTP        (/interface/sstp-server/add user=<ppp>)
Paso 3  Interface Lists      (LIST-VPN-TOWERS + LIST-VPN-SSTP)
Paso 4  Address List         (LIST-NET-REMOTE-TOWERS ← cada subred LAN)
Paso 5  VRF                  (/ip/vrf/add interfaces=<iface>)
Paso 6a Ruta LAN remota      (dst=<lan> gateway=<iface>@<vrf> routing-table=<vrf>)
Paso 6b Ruta retorno MGMT    (dst=192.168.21.0/24 gateway=VPN-WG-MGMT routing-table=<vrf>)
```

### 3.2 Para WireGuard — [:~350-406](server/routes/node.routes.js)
Análogo, pero crea `/interface/wireguard` + IP `/30` core + peer con `allowed-address`, y la interfaz va a `LIST-VPN-WG`.

### 3.3 Persistencia (transacción ACID) — [:466-502](server/routes/node.routes.js)
```sql
BEGIN
  saveNode({ ppp_user, nombre_vrf, iface_name, lan_subnets, ip_tunnel,
             protocol, workspace_id })          -- nodes
  UPDATE nodes SET ppp_password_enc=?  (solo SSTP, AES-256-GCM)
COMMIT
```

### 3.4 El VRF resuelve el conflicto de IPs duplicadas
Cada torre tiene su **routing-table propia** (config.rsc:45-63). Por eso dos torres con `192.168.8.0/24` no chocan: viven en VRFs distintos.

> 📌 La **ruta de retorno** (`192.168.21.0/24 → VPN-WG-MGMT`, paso 6b) existe en **cada** tabla VRF. Esto significa: cualquier IP de gestión puede ser alcanzada desde cualquier torre. La segmentación por usuario **no** ocurre aquí, sino en el mangle (§4).

---

<a name="4"></a>
## 4. Activar un túnel — el corazón del sistema

**Endpoint:** `POST /api/tunnel/activate` — [core.routes.js:140](server/routes/core.routes.js)

### 4.1 Las dos fases

**Fase 1 — Limpieza** ([:152-171](server/routes/core.routes.js)):
```js
// Borra TODAS las reglas mangle con comment ACCESO-ADMIN o ACCESO-DINAMICO
allMangle.filter(m => m.comment === 'ACCESO-ADMIN' || m.comment === 'ACCESO-DINAMICO')
         .forEach(remove)
```

**Fase 2 — Crear la regla** ([:177-186](server/routes/core.routes.js)):
```rsc
/ip/firewall/mangle/add
  chain=prerouting
  action=mark-routing
  comment=ACCESO-ADMIN
  dst-address-list=LIST-NET-REMOTE-TOWERS
  new-routing-mark=<targetVRF>
  src-address=192.168.21.0/24      ← ⚠️ TODA la subred de gestión
  passthrough=yes
```

**Persistencia GLOBAL** ([:191-196](server/routes/core.routes.js)):
```js
setAppSetting('active_vrf',     targetVRF)    // ← UN solo valor para toda la app
setAppSetting('tunnel_ip',      tunnelIP)
setAppSetting('tunnel_expiry',  now + 30min)
broadcastTunnelEvent(targetVRF, expiry)        // ← SSE a TODOS los clientes
```

### 4.2 Flujo de tráfico resultante
```
Cualquier dispositivo 192.168.21.x
        │  destino ∈ LIST-NET-REMOTE-TOWERS
        ▼
Mangle prerouting → marca routing-mark = <targetVRF>
        ▼
Tabla VRF <targetVRF> → gateway = iface@vrf → Torre remota
        ▼
Firewall forward: src-address-list=vpn-activa → dst-address-list=LIST-NET-REMOTE-TOWERS  ACCEPT
        (config.rsc:235-237)
```

### 4.3 Validaciones presentes
- `tunnelIP` debe ser IPv4 válida ([:144](server/routes/core.routes.js))
- `targetVRF` requerido ([:145](server/routes/core.routes.js))
- `req.mikrotik` debe existir (router configurado) ([:141](server/routes/core.routes.js))

### 4.4 Validaciones AUSENTES (causa del problema multi-usuario)
- ❌ No usa `req.account.sub` — **no sabe qué usuario** activa
- ❌ No verifica `tunnel_assignments` aquí — **no valida permiso sobre ese VRF**
- ❌ No registra quién/cuándo por sesión (solo `app_settings` global)

---

<a name="5"></a>
## 5. Desactivar / Keepalive / Status

| Endpoint | Archivo | Qué hace |
|----------|---------|----------|
| `POST /tunnel/deactivate` | [core.routes.js:213](server/routes/core.routes.js) | `cleanTunnelRules()` borra TODO mangle ACCESO-* + limpia `app_settings` globales |
| `POST /tunnel/keepalive` | [core.routes.js:233](server/routes/core.routes.js) | Cada N seg recrea la mangle si falta (heartbeat). Frontend: [useTunnelKeepalive.ts](vpn-manager/src/context/hooks/useTunnelKeepalive.ts) |
| `GET /tunnel/status` | [core.routes.js:291](server/routes/core.routes.js) | Lee `active_vrf` global; si expiró, limpia |
| `GET /tunnel/events` (SSE) | [core.routes.js:280](server/routes/core.routes.js) | Push del estado **global** a todos |

**`cleanTunnelRules`** ([routeros.service.js:82](server/routeros.service.js)): borra cada mangle con `comment ∈ {ACCESO-ADMIN, ACCESO-DINAMICO}`. No distingue usuario.

---

<a name="6"></a>
## 6. Por qué HOY solo funciona un usuario a la vez

Cinco mecanismos lo fuerzan, **todos a la vez**:

### 🔴 6.1 El mangle usa la subred completa
`src-address=192.168.21.0/24` ([core.routes.js:184](server/routes/core.routes.js)) → la marca de ruteo aplica a **todos** los dispositivos de gestión, no al que activó. Si A activa ND1, el tráfico de B (misma subred) **también** se marca hacia ND1.

### 🔴 6.2 Una sola mangle a la vez
La Fase 1 borra la regla anterior antes de crear la nueva ([core.routes.js:155-163](server/routes/core.routes.js)). Solo puede existir **un** `new-routing-mark` activo.

### 🔴 6.3 Estado global en `app_settings`
`active_vrf` es **un único valor** ([core.routes.js:193](server/routes/core.routes.js)). No hay dimensión por usuario.

### 🔴 6.4 SSE difunde a todos
`broadcastTunnelEvent` ([core.routes.js:9](server/routes/core.routes.js)) → cada cliente sobrescribe su `activeNodeVrf` ([useTunnelSync.ts:63-68](vpn-manager/src/context/hooks/useTunnelSync.ts)). **Todos ven el mismo túnel.**

### 🔴 6.5 El frontend fuerza "desactivar antes de activar"
[useNodeActivation.ts:29-33](vpn-manager/src/components/VPN/NodeCard/hooks/useNodeActivation.ts):
```js
if (isAnyNodeActive) { await deactivateAllNodes(); }  // mata el túnel de quien sea
```

### Diagrama del problema
```
        ┌──────────── MISMO mangle src=192.168.21.0/24 → VRF-ND1 ───────────┐
        │                                                                     │
   Usuario A (192.168.21.20) ──┐                                              ▼
   Usuario B (192.168.21.21) ──┼──► TODOS marcados a VRF-ND1 ──► Torre ND1
   Usuario C (192.168.21.22) ──┘     (aunque B/C no lo activaron)
```

---

<a name="7"></a>
## 7. Qué se necesita para multi-usuario simultáneo

Objetivo: **A activa ND1, B activa ND4, al mismo tiempo, y cada uno solo ve/usa el suyo.**
(Regla acordada: **1 túnel activo por usuario a la vez.**)

### 7.1 Cambio conceptual: del mangle global a la regla por-IP

En lugar de `src-address=192.168.21.0/24`, **una mangle por dispositivo de usuario**:
```rsc
# Usuario A (192.168.21.20) → VRF-ND1
/ip/firewall/mangle/add chain=prerouting action=mark-routing \
  src-address=192.168.21.20 dst-address-list=LIST-NET-REMOTE-TOWERS \
  new-routing-mark=VRF-ND1 comment=ACCESO-USER-<idA> passthrough=yes

# Usuario B (192.168.21.21) → VRF-ND4   (coexiste con la de A)
/ip/firewall/mangle/add chain=prerouting action=mark-routing \
  src-address=192.168.21.21 dst-address-list=LIST-NET-REMOTE-TOWERS \
  new-routing-mark=VRF-ND4 comment=ACCESO-USER-<idB> passthrough=yes
```
- Ya **no** se borra "toda" mangle en cada activación — solo la del usuario actual (`comment=ACCESO-USER-<id>`).
- Coexisten N marcas simultáneas, una por usuario.

### 7.2 Aislamiento de acceso (firewall por IP + destino)
Hoy el firewall permite `vpn-activa → LIST-NET-REMOTE-TOWERS` global (config.rsc:235). Para que A **no** alcance la LAN de B:
```rsc
# A solo a la LAN de ND1
/ip/firewall/filter/add chain=forward src-address=192.168.21.20 \
  dst-address-list=LIST-NET-ND1-ONLY action=accept
# B solo a la LAN de ND4
/ip/firewall/filter/add chain=forward src-address=192.168.21.21 \
  dst-address-list=LIST-NET-ND4-ONLY action=accept
# (mantener el drop preventivo final, config.rsc:246)
```
→ Requiere una address-list **por nodo** (`LIST-NET-ND<n>-ONLY`).

### 7.3 Saber la IP de gestión de cada usuario
La clave es mapear **cuenta de la app → IP `192.168.21.x`**. Hoy:
- El peer se crea con `mgmt_peer_owners(public_key, workspace_id, allowed_address)` ([wireguard.routes.js:86-96](server/routes/wireguard.routes.js)) — pero **no liga `user_id`**.
- **Falta:** una tabla `user_id → allowed_address (192.168.21.x)`.

### 7.4 Estado por usuario (reemplazar `app_settings` global)
Nueva tabla (ya hay borrador en [migration_001](server/sql/migration_001_tunnel_user_sessions.sql)):
```sql
tunnel_user_sessions(
  user_id, workspace_id, tunnel_id, mgmt_ip,
  status, activated_at, mangle_id, firewall_rule_ids )
-- UNIQUE(workspace_id, user_id, status=ACTIVE)  → fuerza 1 activo por usuario
```

### 7.5 Cambios por capa (resumen)

| Capa | Archivo | Cambio |
|------|---------|--------|
| **BD** | `migration_001` | Tabla `tunnel_user_sessions` + ligar `user_id`↔`mgmt_ip` |
| **Backend** | `core.routes.js` `/tunnel/activate` | Usar `req.account.sub`; mangle por **IP del usuario** (no /24); validar `tunnel_assignments`; cleanup solo de SU sesión |
| **Backend** | `/tunnel/deactivate` | Borrar solo la mangle/firewall del usuario; cerrar su fila de sesión |
| **Backend** | `/tunnel/status` + SSE | Filtrar por `req.account.sub` (devolver SOLO mi túnel) |
| **Backend** | `node.routes.js` `filterNodesForRole` | Añadir `running_by_you` / `active_by_other` por sesión |
| **MikroTik** | firewall | Address-lists `LIST-NET-ND<n>-ONLY` + reglas forward por IP |
| **Frontend** | `useNodeActivation.ts` | Quitar `deactivateAllNodes()` global; desactivar **solo mi** túnel |
| **Frontend** | `useTunnelSync.ts` | SSE/`status` ya no son globales: reflejan mi sesión |

### 7.6 Resolución del conflicto de IPs (lo que ya funciona)
El VRF sigue siendo la garantía contra LANs duplicadas: cada usuario mapea a un VRF distinto, y dos VRFs con `192.168.8.0/24` no colisionan porque tienen tablas de ruteo separadas. **Multi-usuario = múltiples mangle por-IP apuntando a VRFs distintos simultáneamente.**

---

## RESUMEN EJECUTIVO

| Pregunta | Respuesta (hoy) |
|----------|-----------------|
| ¿Cómo se crea un usuario VPN? | Peer en `VPN-WG-MGMT` con IP `192.168.21.x/32` ([wireguard.routes.js:59](server/routes/wireguard.routes.js)) |
| ¿Cómo se crea un túnel? | 6 pasos: PPP/WG + iface + lists + address-list + VRF + rutas ([node.routes.js:408](server/routes/node.routes.js)) |
| ¿Qué pasa al activar? | 1 mangle `src=192.168.21.0/24 → VRF` + estado global ([core.routes.js:140](server/routes/core.routes.js)) |
| ¿Por qué 1 usuario a la vez? | mangle por /24 + 1 marca a la vez + estado global + SSE a todos + frontend desactiva-antes-de-activar |
| ¿Qué falta para multi-user? | mangle por-IP + firewall por-IP + tabla de sesiones + mapa user↔IP + estado/SSE por usuario |

---
**Fin** · Documentación basada en lectura directa del código (2026-06-06)
