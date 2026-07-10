# 🔌 C4 — MikroTik ↔ Funciones del Core

> Diagramas C4 (Mermaid) que muestran **cómo el backend opera el MikroTik core**: activar túnel, provisión/baja de nodo, escaneo, y el rol de **VRF + mangle**.
> Generado: **2026-06-24** sobre `cfa8de0`. Acompaña a [`Project_Architecture_Blueprint.md`](./Project_Architecture_Blueprint.md). El *porqué* de cada decisión vive en [`HANDOFF.md`](../../HANDOFF.md) §4.
> Niveles incluidos: **Context (1)** · **Component (3, foco RouterOS)** · **Dynamic** (activar túnel · provisión · escaneo · baja).

---

## 0) Modelo mental en una frase

El MikroTik core es **compartido por todos los tenants**. El aislamiento se logra con dos primitivas de RouterOS combinadas:

- **VRF** (`VRF-ND<n>-<NOMBRE>`) — una tabla de rutas aislada por nodo físico. Solo enruta la LAN de su torre.
- **mangle `mark-routing`** — marca el tráfico **por origen** (`src-address`) hacia un VRF. Hay un namespace por-usuario (`ACCESO-USER-<tag>`) para el acceso del moderador y otro por-workspace (`SCAN-WS-<ws>`) para el escaneo desde el VPS.

> N usuarios concurrentes = N mangles + N VRFs **sin colisión**, aunque varias torres compartan la misma LAN.

---

## 1) C4 Context — el sistema frente al Core y las antenas

```mermaid
C4Context
  title Context — GestionVPN frente al MikroTik core

  Person(adm, "Platform Admin", "Configura el router core")
  Person(mod, "Moderador (OWNER)", "Activa túneles, da de alta nodos, escanea")
  Person(mbr, "View (MEMBER)", "Usa sus túneles asignados")

  System(app, "GestionVPN-1.0", "Panel SaaS multi-tenant: provisión, túneles, escaneo")

  System_Ext(mt, "MikroTik core (GW-VPN-CORE-ISP)", "RouterOS: SSTP + WireGuard + VRF + mangle")
  System_Ext(ub, "Ubiquiti airOS", "APs / CPEs en las LAN remotas")
  System_Ext(cpe, "CPE de torre", "MikroTik/router cliente: termina el túnel SSTP/WG")

  Rel(adm, app, "Configura router core", "HTTPS")
  Rel(mod, app, "Provisiona / activa / escanea", "HTTPS")
  Rel(mbr, app, "Activa sus túneles", "HTTPS")

  Rel(app, mt, "RouterOS API (deadline 9s)", "API :8728")
  Rel(mt, cpe, "Túnel SSTP / WireGuard", "WAN")
  Rel(cpe, ub, "LAN de torre", "Ethernet")
  Rel(app, ub, "Escaneo / monitoreo (atado a scan-IP)", "SSH :22 + HTTP")

  UpdateRelStyle(app, mt, $textColor="blue", $lineColor="blue")
```

**Clave:** el panel **nunca** habla directo con las antenas en producción; el tráfico de escaneo/monitoreo sale atado a una **scan-IP** y el Core lo enruta al VRF correcto vía mangle. El CPE termina el túnel y expone la LAN de la torre.

---

## 2) C4 Component — funciones del backend que operan el Core

Foco: qué módulo del backend maneja qué objeto de RouterOS. Todo pasa por `routeros.service` (única conexión con deadline).

```mermaid
C4Component
  title Component — Backend ↔ RouterOS

  Container_Boundary(api, "server (Express)") {
    Component(provRoutes, "routes/nodes/provision", "Express", "Alta/baja de nodo: orquesta 10 pasos")
    Component(tunRoutes, "routes/core/tunnel", "Express", "Activar/desactivar/keepalive túnel")
    Component(scanRoutes, "routes/nodes/scan", "Express + Worker", "Escaneo SSE de la LAN")

    Component(provisioner, "lib/tunnelProvisioner", "JS", "mangle por-usuario y de escaneo (add/find/remove)")
    Component(scanMangle, "lib/scanMangle", "JS", "Ciclo de vida mangle SCAN-WS (setup/teardown)")
    Component(scanTarget, "lib/scanTarget", "JS", "Resuelve el VRF a escanear (prefiere sesión activa)")
    Component(deprov, "lib/nodeDeprovision", "JS", "Baja: VRF + iface + rutas + peer + mangle")
    Component(mgmtNet, "lib/mgmtNet", "JS", "Plano 10.x: rutas de retorno, IPs de nodo")
    Component(cpeScript, "lib/cpeScript", "JS", "Genera el script del CPE (WG/SSTP)")
    Component(wg0, "lib/wg0Sync", "JS", "Intención de AllowedIPs para el wg0 del VPS")

    Component(ros, "routeros.service", "node-routeros", "connectWithDeadline + safeWrite + writeIdempotent + parches")
  }

  System_Ext(mt, "MikroTik core", "RouterOS API :8728")

  Rel(provRoutes, ros, "VRF, peer WG, ppp/secret, rutas, address-list")
  Rel(provRoutes, mgmtNet, "rutas de retorno + IP de nodo")
  Rel(provRoutes, cpeScript, "script para el CPE")
  Rel(provRoutes, wg0, "registra LAN nueva (best-effort)")
  Rel(provRoutes, deprov, "baja → delega")

  Rel(tunRoutes, provisioner, "addUserMangle / findUserMangleIds / removeMangleIds")
  Rel(scanRoutes, scanTarget, "¿qué VRF escanear?")
  Rel(scanRoutes, scanMangle, "setup/teardown SCAN-WS")
  Rel(scanMangle, provisioner, "addScanMangle / findScanMangleIds")
  Rel(deprov, ros, "remove VRF/iface/rutas/peer/mangle")
  Rel(provisioner, ros, "/ip/firewall/mangle/*")

  Rel(provRoutes, mt, "vía routeros.service", "API :8728")
  UpdateRelStyle(provRoutes, mt, $textColor="blue", $lineColor="blue")
```

### Mapa objeto RouterOS ↔ función

| Objeto RouterOS | Lo crea/lee | Función | Comment / convención |
|---|---|---|---|
| `/ip/vrf` | provision · scanMangle (lee) | `computeNextAllocation`, `vrfExists` | `VRF-ND<n>-<NOMBRE>` |
| `/interface/wireguard` + `/peers` | provision | paso 1–3 | iface `WG-ND<n>-<NOMBRE>`, peer `Cliente ND<n>` |
| `/ppp/secret` + `/interface/sstp-server` | provision (SSTP) | paso 1–2 | secret `ppp-<nombre>-nd<n>` |
| `/ip/route` (LAN + retorno + scan) | provision | `addRouteOnce`, `addMgmtReturnRoutes`, `addScanReturnRoute` | ida dist 1, retorno **dist 2** |
| `/ip/firewall/address-list` `LIST-NET-REMOTE-TOWERS` | provision | `addTowerEntries` | nunca se borra al dar de baja (§4.13) |
| `/ip/firewall/mangle` (acceso) | tunnel | `addUserMangle` | `ACCESO-USER-<tag>` |
| `/ip/firewall/mangle` (escaneo) | scanMangle | `addScanMangle` | `SCAN-WS-<ws>` |
| `/interface/list/member` | provision | paso 4 | `LIST-VPN-TOWERS` + `LIST-VPN-WG`/`LIST-VPN-SSTP` |

---

## 3) C4 Dynamic — Activar túnel (mangle por-usuario → VRF)

`POST /tunnel/activate`. La IP de gestión y el VRF se resuelven **server-side** (anti-spoofing §4.3/§4.5); nunca del body.

```mermaid
C4Dynamic
  title Dynamic — Activar túnel (aislamiento por-usuario)

  Container(fe, "Frontend", "React", "NodeAccessPanel")
  ContainerDb(db, "MySQL", "mysql2", "sesiones + mgmt IPs")

  Container_Boundary(api, "server") {
    Component(tun, "routes/core/tunnel", "Express", "/tunnel/activate")
    Component(prov, "tunnelProvisioner", "JS", "mangle por-usuario")
    Component(ros, "routeros.service", "node-routeros", "API con deadline")
  }
  System_Ext(mt, "MikroTik core", "RouterOS")

  Rel(fe, tun, "1. POST /tunnel/activate {tunnelId} (cookie)", "JSON")
  Rel(tun, tun, "2. req.account.sub + canUseTunnel (RBAC)")
  Rel(tun, db, "3. mgmtIp del usuario (server-side)", "SQL")
  Rel(tun, prov, "4. vrfExists + findUserMangleIds + findLegacyGlobalMangleIds")
  Rel(prov, ros, "5. removeMangleIds(previas/legacy)", "API")
  Rel(prov, ros, "6. addUserMangle src=mgmtIp dst-list=LIST-NET-REMOTE-TOWERS mark=VRF", "API")
  Rel(ros, mt, "7. /ip/firewall/mangle/add", "API :8728")
  Rel(tun, db, "8. sessionRepo.createSession (tx: cierra ACTIVE previa)", "SQL")
  Rel(tun, fe, "9. {vrf, expiresAt} + SSE emitToUser", "JSON/SSE")

  UpdateRelStyle(prov, ros, $textColor="blue", $lineColor="blue", $offsetY="-20")
```

**Por qué así:** una regla mangle marca **solo** el tráfico cuyo `src-address` es la mgmt-IP de *ese* usuario → su tráfico entra a *su* VRF. Las mangle GLOBALES legacy (`ACCESO-ADMIN`, `src=<toda la /24>`) se eliminan automáticamente porque rompen el aislamiento (§4.3).

---

## 4) C4 Dynamic — Provisión de nodo WG (alta server-side, ~10 pasos)

`POST /node/provision`. El servidor genera todo y devuelve el script del CPE. Progreso por SSE (`provisionId`).

```mermaid
C4Dynamic
  title Dynamic — Provisión de nodo WireGuard

  Container(fe, "Frontend", "React", "NuevoNodo")
  ContainerDb(db, "MySQL", "mysql2", "nodes + creds cifradas")

  Container_Boundary(api, "server") {
    Component(prov, "routes/nodes/provision", "Express", "/node/provision")
    Component(keys, "lib/wgkeys", "JS", "par de llaves del CPE")
    Component(mnet, "lib/mgmtNet", "JS", "rutas de retorno + IP de nodo")
    Component(wg0, "lib/wg0Sync", "JS", "intención AllowedIPs")
    Component(ros, "routeros.service", "node-routeros", "writeIdempotent + addRouteOnce")
  }
  System_Ext(mt, "MikroTik core", "RouterOS")

  Rel(fe, prov, "1. POST {nodeName, lanSubnets, protocol=wireguard}", "JSON")
  Rel(prov, ros, "2. computeNextAllocation (lee /ip/vrf → ND libre)", "API")
  Rel(prov, keys, "3. genera par del CPE (si no pegan uno)")
  Rel(prov, ros, "4. add WG iface + peer(allowed=IP/32,LAN) + list-member", "API")
  Rel(prov, ros, "5. add/merge VRF-ND<n> (interfaces=iface)", "API")
  Rel(prov, mnet, "6. returnRoutes() + nodeMgmtIp()")
  Rel(prov, ros, "7. addRouteOnce: LAN(dist1) + retorno MGMT/scan(dist2) + IP/32", "API")
  Rel(prov, ros, "8. addTowerEntries → LIST-NET-REMOTE-TOWERS", "API")
  Rel(ros, mt, "→ /interface, /ip/vrf, /ip/route, /address-list", "API :8728")
  Rel(prov, db, "9. saveNode + wg_cpe_private_enc (AES-GCM), tx", "SQL")
  Rel(prov, wg0, "10. autosyncWg0(LAN) → intención (best-effort)")
  Rel(prov, fe, "→ {script CPE, serverPublicKey, steps}", "JSON")

  UpdateRelStyle(prov, ros, $textColor="green", $lineColor="green", $offsetY="-15")
```

**Notas de implementación verificadas:**
- **`addRouteOnce`** verifica antes de añadir: RouterOS trata `/ip/route/add` duplicado como ECMP (no lanza "already have") → sin esto se acumulaban rutas (§4.26). Set canónico: 1 ruta de ida (dist 1) + 4 de retorno (CLIENTES/ADMIN/VPS + scan, **dist 2**).
- **SSTP** NO crea la `/32` del mgmt-ip (el PPP la da dinámica vía `remote-address`); **WG sí**.
- **VRF merge:** si el VRF ya existe (nodo SSTP previo), se añade la iface WG; solo se borra en rollback si `vrfCreatedByUs`.
- **Rollback H4:** si un paso falla, `rollbackProvision` borra solo lo que esta llamada creó (por nombre/comment determinístico), nunca LANs compartidas.
- **wg0 autosync (§4.27):** `appendWg0Intent` escribe la LAN en `/wg0sync/allowedips.desired` (bind-mount); un watcher root del host la aplica con `wg syncconf`. El backend no gana privilegios.

---

## 5) C4 Dynamic — Escaneo desde el VPS (scan-IP → SCAN-WS → VRF)

`GET /node/scan-stream`. El escaneo sale atado a la **scan-IP del workspace** (`localAddress`); el Core la marca con la mangle `SCAN-WS-<ws>` hacia el VRF.

```mermaid
C4Dynamic
  title Dynamic — Escaneo de la LAN remota (Opción C)

  Container(fe, "Frontend", "React", "NetworkDevicesModule (SSE)")
  ContainerDb(db, "MySQL", "mysql2", "nodes + scan-IP + sesiones")

  Container_Boundary(api, "server") {
    Component(scan, "routes/nodes/scan", "Express + Worker", "/node/scan-stream")
    Component(tgt, "lib/scanTarget", "JS", "VRF a escanear")
    Component(sm, "lib/scanMangle", "JS", "setup/teardown SCAN-WS")
    Component(ros, "routeros.service", "node-routeros", "")
  }
  System_Ext(mt, "MikroTik core", "RouterOS + masquerade SSTP")
  System_Ext(ub, "Ubiquiti airOS", "CPEs de la torre")

  Rel(fe, scan, "1. abre SSE {nodeLan}", "SSE")
  Rel(scan, db, "2. scanIpRepo.resolveForWorkspace → scan-IP", "SQL")
  Rel(scan, tgt, "3. resolveScanTargetVrf (prefiere sesión activa)")
  Rel(scan, sm, "4. setup: vrfExists + addScanMangle src=scan-IP mark=VRF")
  Rel(sm, ros, "5. /ip/firewall/mangle/add SCAN-WS-<ws>", "API")
  Rel(scan, ub, "6. probe atado a scan-IP (HTTP 80/443 + SSH banner)", "localAddress")
  Rel(ub, mt, "7. retorno NATeado por masquerade LIST-VPN-SSTP", "conntrack")
  Rel(scan, fe, "8. stream de dispositivos detectados", "SSE")
  Rel(scan, sm, "9. teardown: removeMangleIds (best-effort)")

  UpdateRelStyle(scan, ub, $textColor="orange", $lineColor="orange", $offsetY="-15")
```

**Por qué funciona el retorno (§4.28):**
- La mangle `SCAN-WS-<ws>` marca `src=scan-IP AND dst-address-list=LIST-NET-REMOTE-TOWERS` → por eso la LAN **debe** estar en esa address-list (la añade `addTowerEntries` al provisionar).
- En **SSTP** el retorno lo resuelve el `masquerade out-interface-list=LIST-VPN-SSTP` del Core: reescribe el origen a la PPP-local `10.11.251.1`, así el CPE no necesita ruta del scan-pool (conntrack des-NATea).
- En **WG** el retorno necesita la ruta del scan-pool en el VRF (`addScanReturnRoute`, dist 2) **y** que el `wg0` del VPS rutee la LAN en sus `AllowedIPs` (§4.27).
- **Limitación actual:** el probe detecta **solo** Ubiquiti airOS (`status.cgi` + banner SSH). Hosts no-airOS no aparecen → feature "Otros" pendiente.

---

## 6) C4 Dynamic — Baja de nodo (cascada)

`POST /node/deprovision` → delega en `lib/nodeDeprovision.deprovisionNodeOnRouter`.

```mermaid
C4Dynamic
  title Dynamic — Baja de nodo (de-provisión)

  Container(fe, "Frontend", "React", "EliminarNodo")
  ContainerDb(db, "MySQL", "mysql2", "nodes + aps + cpes…")

  Container_Boundary(api, "server") {
    Component(prov, "routes/nodes/provision", "Express", "/node/deprovision")
    Component(shared, "routes/nodes/_shared", "JS", "nodeBelongsToRequester")
    Component(deprov, "lib/nodeDeprovision", "JS", "limpieza del router")
    Component(ros, "routeros.service", "node-routeros", "")
  }
  System_Ext(mt, "MikroTik core", "RouterOS")

  Rel(fe, prov, "1. POST {pppUser, vrfName, protocol}", "JSON")
  Rel(prov, shared, "2. nodeBelongsToRequester (ppp_user O vrf, §4.20)")
  Rel(prov, deprov, "3. deprovisionNodeOnRouter")
  Rel(deprov, ros, "4. remove peer/iface + rutas del VRF + VRF + mangle", "API")
  Rel(ros, mt, "5. /interface, /ip/route, /ip/vrf, /mangle", "API :8728")
  Rel(prov, db, "6. deleteNode → cascada (aps, cpes, signal_history)", "SQL")
  Rel(prov, fe, "7. {steps, deletedDeviceIds}", "JSON")

  UpdateRelStyle(deprov, ros, $textColor="red", $lineColor="red", $offsetY="-15")
```

**Invariantes de la baja:**
- **NUNCA** se toca `LIST-NET-REMOTE-TOWERS` (varias torres comparten LAN → borrar la entrada rompería a los nodos hermanos, §4.13).
- **Best-effort:** un router caído **no** bloquea el borrado en BD (§4.12/§4.17).
- **Identidad consistente:** el nodo se identifica por `ppp_user` **O** `nombre_vrf` (§4.20) — si difieren (nodos legacy), igual se borra.

---

## 7) Resumen de invariantes MikroTik (referencia rápida)

| # (HANDOFF) | Invariante |
|---|---|
| §4.1/§4.2 | Alta de nodo = todo server-side; toda la infra por-túnel se crea sola |
| §4.3 | Mangle **por-usuario**; prohibido mangle global; `src`/VRF server-side |
| §4.10 | `.conf` split-tunnel, **nunca** `0.0.0.0/0` |
| §4.13 | Nunca borrar `LIST-NET-REMOTE-TOWERS` al dar de baja |
| §4.17 | Toda conexión al router con deadline propio (9s); best-effort |
| §4.18 | El plano `10.x` debe estar en `/ip service api address=` (no solo firewall) |
| §4.19 | Nunca borrar el peer WG de administración (`10.14.250.2→.1`) |
| §4.26 | `/ip/route/add` por `addRouteOnce` (RouterOS permite duplicados) |
| §4.27 | El `wg0` del VPS debe rutear cada LAN en `AllowedIPs` (autosync) |
| §4.28 | El escaneo detecta solo Ubiquiti; retorno SSTP por masquerade |

---

> **Generado:** 2026-06-24 · **Base:** `cfa8de0` · Fuentes: `routes/nodes/provision.routes.js`, `routes/core/tunnel.routes.js`, `lib/tunnelProvisioner.js`, `lib/scanMangle.js`, `lib/scanTarget.js`, `lib/nodeDeprovision.js`, `lib/mgmtNet.js`.
> Si los diagramas Mermaid C4 no renderizan en tu visor, usa un visor con Mermaid ≥ 10 (VS Code "Markdown Preview Mermaid Support" o GitHub).
