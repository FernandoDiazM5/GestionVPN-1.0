# 🧩 Plan — Unificar transporte + gestión en UNA IP por nodo

> **Estado:** ✅ IMPLEMENTADO en `dev` (backend + tests). Pendiente: ajustar
>   el pool/profile del router + re-provisionar nodos. Tests: **209 backend verdes**,
>   `tsc` frontend 0, syntax-check backend 0.
> **Decidido con el usuario:** servidor en `.1`, nodos desde `.2` (ND1 reservado).
> **Timing:** clean slate (todos los nodos borrados) → sin migración, se re-provisiona desde cero.

## 1. Objetivo

Eliminar los `/24` de **transporte** separados y que cada nodo tenga **una sola IP**
que sea a la vez endpoint del túnel **y** IP de gestión:

| | Antes (2 IPs/nodo) | Ahora (1 IP/nodo) |
|---|---|---|
| WG | transporte `10.10.251.x/30` + gestión `10.11.250.<ND>` | **`10.11.250.<ND>`** |
| SSTP | transporte `10.10.250.x` + gestión `10.11.251.<ND>` | **`10.11.251.<ND>`** |
| Servidor (Core) | — | **`.1`** en cada `/24` (reservado) |

`10.10.250.0/24` y `10.10.251.0/24` **dejan de usarse**.

## 2. Regla de numeración (decisión tomada)

- `nodeMgmtIp(ND, isWG)` = `10.11.250.<ND>` (WG) / `10.11.251.<ND>` (SSTP), con **`ND ≥ 2`**.
- `.1` reservado para el endpoint del Core (SSTP `local-address=10.11.251.1`).
- ⚠️ **HOUSENET hoy es ND1** → debe **re-numerarse a ND ≥ 2** al re-provisionar
  (el clean slate lo permite sin coste). **Confirmar el nuevo número.**

## 3. Cambios de BACKEND (es donde vive la lógica, no en el router)

### 3.1 `server/lib/mgmtNet.js`
- Añadir `sstp.localAddress = 10.11.251.1` (env `MGMT_SSTP_LOCAL`).
- `nodeMgmtIp(ND, isWG)`: validar `ND ≥ 2` (devolver `null`/error si `ND < 2`).
- Helpers nuevos: `sstpRemote(ND)=10.11.251.<ND>`, `wgTunnelIp(ND)=10.11.250.<ND>`.

### 3.2 `server/routes/nodes/provision.routes.js`  *(núcleo del cambio)*
**SSTP:**
- Quitar el bloque que calcula `nextRemote` escaneando `10.10.250.` (líneas ~75-81)
  y la lógica `effectiveRemote` asociada (~207-208).
- `remote-address` del `/ppp/secret` = `sstpRemote(ND)` = `10.11.251.<ND>`.
- Quitar la **ruta `/32` separada** de gestión (PPP ya crea el `/32` dinámico del
  `remote-address`). **Conservar** la entrada en `LIST-NET-REMOTE-TOWERS`.

**WG:**
- Eliminar el cálculo de `blockBase` / `serverIPAddr` / `wgPeerIP` en `10.10.251` (~234-252).
- **No** asignar IP `/30` a la interfaz WG del Core (`/ip/address/add` fuera).
- `wgPeerIP` = `wgTunnelIp(ND)` = `10.11.250.<ND>`.
- `peerAllowed` = `10.11.250.<ND>/32` + LAN(s) (sin el `/32` extra ni el `/30`).
- Ruta `10.11.250.<ND>/32 → iface@VRF` (ya existe como ruta de gestión; pasa a ser la única).
- Quitar la entrada `Red WG <bloque>/30` del `LIST-NET-REMOTE-TOWERS` (~331).

### 3.3 `server/routes/core/tunnel-repair.routes.js`
- Reconstrucción coherente con el nuevo esquema (sin `/30`, gestión = transporte).
- **Incluir `SCAN_RETURN_SUBNET` en `ADMIN_POOLS_REPAIR`** (fix pendiente de `vpn-activa`
  para el scan, ver línea ~302) — así el "Reparar" no vuelve a romper el escaneo.

### 3.4 `server/routes/nodes/listing.routes.js`  *(script del CPE)*
- WG: la interfaz del CPE lleva `address=10.11.250.<ND>/32`; `AllowedIPs` hacia el Core
  cubre las redes de retorno (`10.12/13/14.250.0/24` + `10.11.252.0/24`).
- SSTP: sin cambios salvo el nuevo `/24` de `remote-address`.

### 3.5 `vpn-manager/src/config.ts` + frontend
- `PROTECTED_NETS` / `MGMT_NET` ya cubren `10.11.250/251`; revisar textos y la
  **validación de numeración (ND ≥ 2)** en el alta de nodo.

### 3.6 `server/.env.production.example`
- Documentar `MGMT_SSTP_LOCAL`; eliminar referencias al transporte `10.10.250/251`.

## 4. Cambios de ROUTER (config base)

```rsc
/ppp/profile/set [find name=PROF-VPN-TOWERS] local-address=10.11.251.1
# pool vestigial (todos los nodos van con remote-address estático):
/ip/pool/set [find name=POOL-VPN-SSTP] ranges=10.11.251.200-10.11.251.250
```
`10.10.250/251` ya no se usan (clean slate lo garantiza: sin `/ip address` ni rutas ahí).

## 5. Tests

- `server/test/integration/provisionAllocation.test.js` (usa `/ppp/secret` + `10.10.250`)
  → actualizar expectativas al nuevo `remote-address` `10.11.251.<ND>`.
- Cualquier unit que asuma `/30` WG en `10.10.251`.
- `tsc -b` + `jest` verdes antes de provisionar.

## 6. Pruebas en vivo (tras el cambio)

1. Alta SSTP (p.ej. ND2) → `remote-address=10.11.251.2`, alcanzable, escaneo > 0.
2. Alta WG (p.ej. ND3) → túnel `10.11.250.3` **sin** `/30`, escaneo > 0.
3. Mangle por-usuario + scan-return (`10.11.252`) + retorno MGMT intactos.
4. Re-provisionar el resto de nodos.

## 7. Riesgos / notas

- **ND1 inutilizable** (reservado para `.1`). HOUSENET re-numerado.
- `/24` → máx 253 nodos por protocolo (de sobra para la escala actual).
- **WG sin `/30`:** el túnel queda gobernado por `allowed-address` (`/32`) + ruta
  `iface@VRF`; validar handshake y retorno en la primera alta WG.
- Hay que **re-provisionar TODOS los nodos** (clean slate → sin paso de migración).

## 8. Orden de ejecución

1. Branch `dev`: cambios de código + tests.
2. Ajustar router (`profile`/`pool`).
3. `tsc` + `jest` verdes.
4. Re-provisionar nodos desde el panel (ND ≥ 2).
5. Verificación end-to-end (handshake VPS, ping gestión, escaneo).
