# 📡 03 — Configuración del servidor VPN (MikroTik core)

> Configuración completa del **router central** (`GW-VPN-CORE-ISP`, RB750GL, RouterOS 7.x): interfaces VPN, plano de gestión, VRF, mangle, firewall, address-lists y el script que recibe cada CPE.
> Fuentes de verdad: `server/scripts/setup-mgmt-net-consolidado.rsc`, `server/scripts/migrate-mgmt-net.rsc`, `server/lib/mgmtNet.js`, `server/lib/cpeScript.js`. Runbook de migración: [`MIGRACION_RED_GESTION.md`](../../MIGRACION_RED_GESTION.md). Volver al [índice](./00_Indice_y_Trazabilidad.md).
>
> 🔑 **Regla de oro:** la **BASE** de gestión (interfaces, IPs, firewall, peer del VPS) se configura **una sola vez** con el script consolidado. Todo lo **por-nodo** (VRF, interfaces WG/SSTP, rutas de torre, IP de gestión del nodo, mangle) lo crea **el panel** al provisionar — nunca a mano.

---

## 1) Identidad y direccionamiento

| Dato | Valor |
|---|---|
| Nombre | `GW-VPN-CORE-ISP` (RB750GL) |
| IP pública (endpoint VPN) | `213.173.36.232` |
| Endpoint del Core para gestión por VPS | `10.12.250.1` (interfaz `VPN-WG-VPS`) |
| Endpoint del Core para gestión por admin | `10.14.250.1` (interfaz `VPN-WG-ADMIN`) |

Plano IP completo: ver [doc 00 §2](./00_Indice_y_Trazabilidad.md). Resumen:

```
Gestión:   VPN-WG-VPS 10.12.250.1/24 :13232 · VPN-WG-CLIENTES 10.13.250.1/24 :13233 · VPN-WG-ADMIN 10.14.250.1/24 :13234
Nodos:     WG 10.11.250.<ND>  ·  SSTP 10.11.251.<ND>  (la .1 = Core; nodos desde ND2)
Scan-pool: 10.11.252.0/24  (.2–.254, una IP por workspace)
```

---

## 2) La BASE de gestión (config 1-vez) — `setup-mgmt-net-consolidado.rsc`

Este script ([archivo](../../server/scripts/setup-mgmt-net-consolidado.rsc)) es **idempotente** (se puede pegar varias veces). Reconstruye la base tras borrar VRF/peers. Qué crea:

### 2.1 Tres interfaces WireGuard de gestión
```routeros
/interface/wireguard/add name=VPN-WG-VPS       listen-port=13232 mtu=1420 comment="Gestion VPS"
/interface/wireguard/add name=VPN-WG-CLIENTES  listen-port=13233 mtu=1420 comment="Gestion Clientes (moderadores/members)"
/interface/wireguard/add name=VPN-WG-ADMIN     listen-port=13234 mtu=1420 comment="Gestion Admin"
```
Y sus IPs gateway:
```routeros
/ip/address/add address=10.12.250.1/24 interface=VPN-WG-VPS       comment="GW gestion VPS"
/ip/address/add address=10.13.250.1/24 interface=VPN-WG-CLIENTES  comment="GW gestion Clientes"
/ip/address/add address=10.14.250.1/24 interface=VPN-WG-ADMIN     comment="GW gestion Admin"
```

### 2.2 Firewall input — abrir los 3 puertos UDP de gestión
```routeros
/ip/firewall/filter/add chain=input protocol=udp dst-port=13232-13234 action=accept \
  comment="WG Gestion 13232-13234 (migracion)"
```
> Si tienes un `drop` final en `input`, **mueve esta regla arriba** del drop.

### 2.3 Address-lists del plano de gestión
- **`LIST-MGMT-TRUSTED`** ← `10.12.250.0/24`, `10.13.250.0/24`, `10.14.250.0/24`. Da acceso Winbox/API/REST a los segmentos de gestión.
- **`vpn-activa`** ← mismos `/24` (pool que el modelo de acceso marca).

### 2.4 Peer del VPS (en `VPN-WG-VPS`)
```routeros
/interface/wireguard/peers/add interface=VPN-WG-VPS public-key="<PUBKEY_DEL_VPS>" \
  allowed-address=10.12.250.60/32,10.11.252.0/24 comment="VPS-MGMT"
```
> `allowed-address` = la `/32` de control del VPS (`.60`) **+** el scan-pool (`10.11.252.0/24`). Sin el scan-pool aquí, el escaneo desde el VPS no vuelve.

### 2.5 Rutas de retorno por VRF (si ya hay VRF creados)
Para cada VRF distinto de `main`, añade (idempotente): `10.13.250.0/24 → VPN-WG-CLIENTES`, `10.14.250.0/24 → VPN-WG-ADMIN`, `10.12.250.0/24 → VPN-WG-VPS`, `10.11.252.0/24 → VPN-WG-VPS` (scan). Normalmente esto lo hace el panel al provisionar; el script solo cubre VRF preexistentes.

### 2.6 Claves públicas (las imprime al final)
```routeros
/interface/wireguard/print where name~"VPN-WG-(VPS|CLIENTES|ADMIN)"
```
Anótalas: son las `serverPublicKey` que van en los `.conf` de cada peer (usuarios) y en el script del CPE.

---

## 3) `/ip service` — la allow-list de la API (crítico)

`/ip service api` (y `api-ssl`) tienen su **propia** allow-list por `address=`, **independiente** del firewall y de `LIST-MGMT-TRUSTED`. Si el origen del backend (`10.12.250.60` desde el VPS, o `10.13.250.x`/`10.14.250.x`) **no** está ahí, RouterOS acepta el TCP pero **descarta el login en silencio** (no `!trap`, no cierre → cuelgue). Esto lo aplica `migrate-mgmt-net.rsc` (FASE 2b):

```routeros
/ip service set api     address=10.12.250.0/24,10.13.250.0/24,10.14.250.0/24
/ip service set api-ssl  address=10.12.250.0/24,10.13.250.0/24,10.14.250.0/24
```

> 🩺 **Diagnóstico (§4.18):** si `nc -zv <ip> 8728` abre en ms pero el panel se "cuelga" al hablar con el router → revisa **esta lista** antes que credenciales o red. Síntoma documentado en `routeros-api-login-hang.md`.

---

## 4) Modelo VPN: SSTP y WireGuard

El Core acepta CPEs por **dos** protocolos. El panel genera todo; aquí está qué objetos se crean (por el panel, no a mano).

### 4.1 SSTP (PPP sobre TLS)
- **Perfil PPP** `PROF-VPN-TOWERS` con `local-address=10.11.251.1` (el endpoint del Core en el plano de nodos SSTP).
- Por nodo: un **PPP secret** (`name=ppp-<nombre>-nd<ND>`, `service=sstp`, `profile=PROF-VPN-TOWERS`, `remote-address=10.11.251.<ND>`) + una **interfaz** `sstp-server` (`VPN-SSTP-ND<ND>-<NOMBRE>`).
- El `remote-address` **es** la IP de gestión del nodo → RouterOS arma la ruta de vuelta dinámicamente (por eso en SSTP **no** se crea ruta `/32` estática).
- **Retorno del escaneo SSTP:** un `masquerade out-interface-list=LIST-VPN-SSTP` reescribe el origen a la PPP-local `10.11.251.1`; el CPE no necesita ruta del scan-pool (conntrack des-NATea). Ver §4.28.

### 4.2 WireGuard
- Por nodo: una **interfaz** `WG-ND<ND>-<NOMBRE>` (`listen-port=13300+ND`, `mtu=1420`) + un **peer** (la clave pública del CPE, `allowed-address=<IP nodo>/32,<LAN(s)>`).
- El Core **no** lleva IP de transporte en la interfaz WG (modelo unificado): el tráfico se enruta por `gateway=<iface>@<VRF>` + `allowed-address` del peer.
- Firewall: el rango `13300-13400` lo cubre **una** regla global ("Permitir todos los túneles WG Nodos") — no se crean reglas por nodo.

### 4.3 Interface-lists por nodo
Cada interfaz de nodo se agrega a `LIST-VPN-TOWERS` **+** (`LIST-VPN-WG` si WG / `LIST-VPN-SSTP` si SSTP). Estas listas alimentan el NAT/masquerade y el ruteo.

---

## 5) VRF + mangle = el aislamiento multi-tenant

```
                 prerouting mangle (mark-routing)
  tráfico de un usuario  ─ src=<su mgmt_ip> AND dst-list=LIST-NET-REMOTE-TOWERS ─▶  new-routing-mark=VRF-ND<n>
                                                                                         │
                                                            VRF-ND<n>  (tabla aislada)  ─▶  ruta LAN → iface@VRF → CPE → torre
```

- **VRF por nodo** (`VRF-ND<n>-<NOMBRE>`): tabla de rutas aislada que **solo** enruta la LAN de esa torre. Permite que **varias torres compartan la misma LAN** sin colisión (§4.4).
- **mangle por-usuario** (`comment=ACCESO-USER-<tag>`, `src-address=<mgmt_ip>`): marca **solo** el tráfico de ese usuario hacia su VRF. N usuarios = N mangles sin colisión (§4.3).
- **mangle de escaneo** (`comment=SCAN-WS-<ws>`, `src-address=<scan-IP>`): el namespace del escaneo del VPS (Opción C).
- **Prohibido:** mangle GLOBAL (`ACCESO-ADMIN`, `src=<toda la /24>`) — rompe el aislamiento; el backend la elimina (§4.3).

**Set canónico de rutas por nodo** (lo crea el panel, §4.26): 1 ruta de **ida** (`<LAN> → iface@VRF`, distance 1) + 4 de **retorno** (`10.13/10.14/10.12.250.0/24` + scan `10.11.252.0/24`, **distance 2**). En SSTP no se crea la `/32` del nodo (PPP la da dinámica); en WG sí.

---

## 6) `LIST-NET-REMOTE-TOWERS` (la lista que hace funcionar todo)

Es el **test de pertenencia** de las mangle: `dst-address-list=LIST-NET-REMOTE-TOWERS`. El panel añade cada LAN de torre (+ la `/32` del nodo) al provisionar (`addTowerEntries`), **sin duplicar**.

> ⚠️ **NUNCA se borra al dar de baja un nodo** (§4.13): varias torres comparten LAN → borrar una entrada rompería a los nodos hermanos. Las entradas sin ruta/VRF quedan inertes. La dedup de entradas viejas es una limpieza manual puntual.

---

## 7) El script que recibe cada CPE (torre)

Lo genera el panel (`lib/cpeScript.js`) y se pega en el MikroTik de la torre. El operador **no** escribe nada a mano.

### 7.1 CPE WireGuard
```routeros
/interface wireguard add name=WG-CORE-ISP private-key="<PRIV_CPE>" mtu=1420 comment="Conexion al Servidor Core"
/ip address add address=<IP_NODO>/32 interface=WG-CORE-ISP comment="IP del nodo ND<n> (gestion + tunel)"
/interface wireguard peers add interface=WG-CORE-ISP public-key="<PUB_CORE>" \
  endpoint-address=213.173.36.232 endpoint-port=<13300+ND> \
  allowed-address=<redes de retorno> persistent-keepalive=25s comment="Conexion al Servidor Core"
/ip route add dst-address=<red retorno> distance=20 gateway=WG-CORE-ISP comment="Retorno hacia Administracion/Software"
```
- La privada del CPE va **embebida** si el panel la autogeneró (el operador no copia llaves). `allowed-address` = redes de gestión + scan-pool (las de retorno).

### 7.2 CPE SSTP
```routeros
/interface sstp-client
:if ([find name=sstp-out1] = "") do={
  add authentication=mschap2 connect-to=213.173.36.232 disabled=no name=sstp-out1 \
      profile=default-encryption tls-version=only-1.2 user=<pppUser> password=<pppPassword>
} else={
  set [find name=sstp-out1] connect-to=213.173.36.232 disabled=no user=<pppUser> password=<pppPassword>
}
```
- Idempotente (crea o actualiza). Solo añade `:<puerto>` a `connect-to` si el listener SSTP del Core no usa 443 (setting `sstp_port`).

---

## 8) Qué crea el panel vs qué es manual

| Objeto | ¿Quién lo crea? |
|---|---|
| 3 interfaces WG de gestión + IPs + firewall + `LIST-MGMT-TRUSTED`/`vpn-activa` | **Manual** (`setup-mgmt-net-consolidado.rsc`, 1 vez) |
| `/ip service api/api-ssl address=` con el plano `10.x` | **Manual** (`migrate-mgmt-net.rsc` FASE 2b, 1 vez) |
| Peer del VPS (`allowed-address` con scan-pool) | **Manual** (1 vez) |
| Perfil PPP `PROF-VPN-TOWERS`, masquerade `LIST-VPN-SSTP`, regla WG global 13300-13400 | **Manual** (config inicial del Core) |
| Peer WG de cada **usuario** (moderador/member/admin) | **Panel** (al aceptar invitación / regenerar) |
| VRF, interfaz WG/SSTP, IP de nodo, rutas, mangle, address-list **por nodo** | **Panel** (al provisionar / de-provisionar) |

---

## 9) Verificación rápida (desde el VPS)
```bash
ping -c3 10.12.250.1            # endpoint del Core en VPN-WG-VPS responde
ip route get 10.12.250.1        # debe decir "dev wg0"
nc -zv 10.12.250.1 8728         # API RouterOS abierta
```
Y en el panel: `Ajustes → Configurar router` con `MT_IP=10.12.250.1` (desde el VPS) → activar un nodo → la pantalla "Acceso Restringido" desaparece. Diagnóstico read-only: `npm run diagnose`, `npm run check:scanroute`.

---

## 10) Reglas que NO se rompen (resumen MikroTik)

| # | Regla |
|---|---|
| §4.3 | Mangle **por-usuario**, nunca global; `src`/VRF server-side |
| §4.4 | Varias torres pueden compartir LAN (a propósito) — no es error |
| §4.13 | Nunca borrar `LIST-NET-REMOTE-TOWERS` al dar de baja |
| §4.18 | El plano `10.x` debe estar en `/ip service api address=` |
| §4.19 | Nunca borrar el peer WG de administración (`10.14.250.2 → .1`) |
| §4.26 | Rutas con `addRouteOnce` (RouterOS permite duplicados) |
| §4.28 | El escaneo detecta solo Ubiquiti; retorno SSTP por masquerade |

> Siguiente: [04 — Configuración del VPS](./04_Config_VPS.md).
