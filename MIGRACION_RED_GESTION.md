# 🔀 Migración del plano de gestión `192.168.21.0/24` → segmentos `10.x`

> Runbook del corte **big-bang**. Toca **MikroTik (en vivo)** + **VPS (wg0)** +
> re-emisión de `.conf`. El código (backend/frontend) ya está migrado y testeado
> (214 backend + 69 frontend verdes, `tsc` 0). Lee TODO antes de empezar.

## Esquema final

| Segmento | Red / Interfaz | Puerto | Uso |
|---|---|---|---|
| Nodos WG | `10.11.250.<ND>` | — | IP de gestión por nodo (en el CPE) |
| Nodos SSTP | `10.11.251.<ND>` | — | IP de gestión por nodo (en el CPE) |
| Scan-pool VPS | `10.11.252.0/24` | — | scan-IP por workspace (origen VPS) |
| VPS | `VPN-WG-VPS` `10.12.250.1/24` | 13232 | peer del VPS (`.60`) |
| Clientes | `VPN-WG-CLIENTES` `10.13.250.1/24` | 13233 | moderadores / members (`.20+`) |
| Admin | `VPN-WG-ADMIN` `10.14.250.1/24` | 13234 | dispositivos del administrador (`.20+`) |

**Fuente de verdad:** `server/lib/mgmtNet.js` (backend) · `vpn-manager/src/config.ts` (frontend).
**Override por env:** `MGMT_*`, `SCAN_IP_POOL_BASE`, `SCAN_RETURN_SUBNET` (ver `.env.production.example`).

---

## ⚠️ Regla de oro (migración remota)

**NO borres `VPN-WG-MGMT` (la interfaz vieja, :13231) hasta** haber migrado **tu
propio dispositivo** a `VPN-WG-ADMIN` (10.14.250.x) y confirmado que entras al
router y a los nodos por ahí. Las 3 interfaces nuevas usan puertos NUEVOS
(13232/33/34), así que **coexisten** con la vieja sin conflicto durante el corte.

---

## Paso 1 — Backend (VPS)

1. En `server/.env.production`, fija el scan-pool nuevo (ya viene en el example):
   ```
   SCAN_IP_POOL_BASE=10.11.252.
   SCAN_RETURN_SUBNET=10.11.252.0/24
   ```
   (Los `MGMT_*` usan defaults de `mgmtNet.js`; solo añádelos si quieres cambiarlos.)
2. `git fetch origin && git reset --hard origin/main` (NUNCA `git pull` tras reescrituras).
3. `docker compose -f docker-compose.prod.yml up -d --build`
4. Limpia la asignación vieja de scan-IP y reasigna en el pool nuevo:
   ```sql
   -- en la BD: DELETE FROM workspace_scan_ip;   (estaba en 10.11.251 o sin aplicar)
   ```
   Luego por workspace: `npm run scan:assign <workspaceId>` → da una IP en `10.11.252.x`.

## Paso 2 — MikroTik: crear interfaces y rutas (Fases 1-3)

Pega por fases `server/scripts/migrate-mgmt-net.rsc`:
- **Fase 1** crea `VPN-WG-VPS` / `VPN-WG-CLIENTES` / `VPN-WG-ADMIN` (+ IPs + puertos UDP).
  Anota las **claves públicas** del servidor que imprime al final.
- **Fase 2** address-lists (`LIST-MGMT-TRUSTED`, `vpn-activa`) con los 3 nuevos /24.
- **Fase 3** itera **todos los VRF** y añade las 4 rutas de retorno
  (CLIENTES/ADMIN/VPS/scan) — idempotente.

## Paso 3 — VPS: `wg0` + peer del VPS

1. En `wg0.conf` del VPS:
   - Cambia la IP de gestión del VPS: `Address` añade `10.12.250.60/32` (quita la `192.168.21.60` cuando cortes).
   - Pool de scan: añade el rango `10.11.252.2-254/32` (PostUp/PostDown) — sustituye al viejo `10.11.251`.
2. En el MikroTik, crea el peer del VPS en la interfaz nueva:
   ```
   /interface/wireguard/peers/add interface=VPN-WG-VPS \
     public-key="<CLAVE_PUBLICA_DEL_VPS>" allowed-address=10.12.250.60/32 comment="VPS"
   ```
3. Ajusta el `allowed-address` del peer **VPS** en el MikroTik para que cubra el scan-pool:
   ```
   /interface/wireguard/peers/set [find comment=VPS] \
     allowed-address=10.12.250.60/32,10.11.252.0/24
   ```
4. `systemctl restart wg-quick@wg0` (o `wg syncconf`). Verifica `/api/health` → `mysql: ok`.

## Paso 4 — Re-emitir `.conf` (peers humanos)

- **Tu dispositivo admin** → crea un peer en **VPN-WG-ADMIN** desde el panel
  ("Nuevo Admin") → recibe IP `10.14.250.20+` → importa el `.conf`. **Conéctate por ahí.**
- **Moderadores/members** → desde el panel, regenera su WireGuard (peer en
  `VPN-WG-CLIENTES`, `10.13.250.x`) y comparte el `.conf`/QR nuevo. Cada uno reimporta.

## Paso 5 — IP de gestión por nodo (en cada CPE)

Para cada nodo, lo más simple: **re-provisiona o pulsa "Reparar"** en el panel —
el backend inyecta en el Core la ruta `/32` + el address-list automáticamente.
En el **CPE** (router torre) aplica el script que entrega el panel (ya incluye la
línea `/ip address add address=10.11.250.<ND>/32 interface=WG-CORE-ISP` + las
rutas de retorno de los 3 segmentos). SSTP usa `10.11.251.<ND>`.

## Paso 6 — Verificación

- [ ] Entras al panel y al router **por `10.14.250.x`** (admin).
- [ ] Un moderador entra por `10.13.250.x` y **activa un túnel** (mangle por-IP OK).
- [ ] Escaneo / Monitor AP funcionan (scan-IP `10.11.252.x`, túnel arriba).
- [ ] Pingas la IP de gestión de un nodo (`10.11.250.<ND>`).

## Paso 7 — Corte final (Fase 6 del RSC) — SOLO ya conectado por ADMIN

```
# quita rutas/listas/mangle viejas y la interfaz VPN-WG-MGMT (libera :13231)
:foreach r in=[/ip/route/find where dst-address="192.168.21.0/24"] do={ /ip/route/remove $r }
/ip/firewall/address-list/remove [find where address="192.168.21.0/24"]
/ip/firewall/mangle/remove [find where comment="ACCESO-ADMIN"]
/ip/address/remove [find where interface="VPN-WG-MGMT"]
/interface/wireguard/remove [find where name="VPN-WG-MGMT"]
```
En el VPS, quita `192.168.21.60/32` de `wg0` y el peer viejo en el MikroTik.

---

## Rollback rápido

Mientras NO ejecutes el Paso 7, la interfaz vieja `VPN-WG-MGMT` (192.168.21.0/24)
sigue **activa y funcional**. Si algo falla, reconéctate por tu `.conf` viejo
(192.168.21.x) y borra las interfaces nuevas:
```
/interface/wireguard/remove [find where name~"VPN-WG-(VPS|CLIENTES|ADMIN)"]
```
El backend, sin las interfaces nuevas, fallaría al provisionar — revierte el
deploy a la imagen previa si necesitas operar con el esquema viejo.
