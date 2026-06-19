---
name: GW-VPN-CORE-ISP Topology
description: MikroTik RB750GL RouterOS 7.19.3 — VRF-per-node architecture with WireGuard and SSTP tunnels, admin MGMT subnet, vpn-activa dynamic list
type: project
---

## Router: GW-VPN-CORE-ISP (RB750GL, RouterOS 7.19.3, serial 3B0602A9CEE4)

### WAN
- ether1: public IP 213.173.36.232, local WAN 10.0.2.7/24, gateway 10.0.2.1
- interface-list: LIST-WAN

### LAN
- BR-LAN (bridge ether2+ether3): 192.168.37.1/24, DHCP pool 192.168.37.2-254

### Admin VPN — MIGRADO a segmentos 10.x (2026-06-19)
> El plano de gestión `192.168.21.0/24` (interfaz única VPN-WG-MGMT :13231) se
> migró a 3 interfaces + IP de gestión por nodo. Fuente de verdad:
> `server/lib/mgmtNet.js`. Runbook: `MIGRACION_RED_GESTION.md`. La interfaz vieja
> se elimina en el corte final.
- VPN-WG-VPS (port 13232): 10.12.250.1/24 — peer VPS 10.12.250.60/32
- VPN-WG-CLIENTES (port 13233): 10.13.250.1/24 — moderadores/members (.20+)
- VPN-WG-ADMIN (port 13234): 10.14.250.1/24 — dispositivos del admin (.20+)
- IP de gestión por nodo: WG → 10.11.250.<ND> · SSTP → 10.11.251.<ND> (en el CPE)
- scan-pool VPS: 10.11.252.0/24
- LIST-MGMT-TRUSTED: 10.12.250.0/24, 10.13.250.0/24, 10.14.250.0/24, 192.168.37.0/24, IPs públicas
- (LEGACY pre-migración) VPN-WG-MGMT 192.168.21.1/24 — peers .20/.30/.50/.51, VPS .60

### Remote Node Tunnels (management only, NO internet via VPN)
- VPN-SSTP-ND1-HOUSENET: tunnel to 10.10.250.201, remote LAN 10.1.1.0/24, VRF-ND1-HOUSENET
- VPN-SSTP-ND3-TORREVIRGINIA2: tunnel to 10.10.250.205, remote LAN 142.152.7.0/24, VRF-ND3-TORREVIRGINIA2
- WG-ND4-TORREVICTORN2 (port 13304): tunnel 10.10.251.1/30, peer 10.10.251.2/32 + 142.152.7.0/24, VRF-ND4-TORREVICTORN2
- WG-ND5-TORREHUASACAN2 (port 13305): tunnel 10.10.251.5/30, peer 10.10.251.6/32 + 192.168.8.0/24, VRF-ND5-TORREHUASACAN2

### Interface Lists
- LIST-VPN-TOWERS: all node tunnels (SSTP + WG nodes)
- LIST-VPN-WG: WG-ND4, WG-ND5 (WireGuard node tunnels only)
- LIST-VPN-SSTP: (SSTP tunnels — ND1, ND3)

### Address Lists
- LIST-MGMT-TRUSTED: 192.168.21.0/24, 192.168.37.0/24, specific public IPs
- LIST-NET-REMOTE-TOWERS: all remote node LANs (10.1.1.0/24, 192.168.100.0/24, 142.152.7.0/24, 192.168.30.0/24, 10.10.251.0/30, 192.168.8.0/24, 10.10.251.4/30)
- vpn-activa: DYNAMICALLY managed by software — only tunnel endpoint IPs added when tunnel is active

### VRF Tables (per node)
Each VRF has: remote LAN route via its tunnel + return routes per mgmt segment
(10.13.250.0/24→VPN-WG-CLIENTES, 10.14.250.0/24→VPN-WG-ADMIN, 10.12.250.0/24→VPN-WG-VPS,
10.11.252.0/24→VPN-WG-VPS for scan) + node mgmt IP /32 via its tunnel.
(LEGACY pre-migración: una sola ruta 192.168.21.0/24 via VPN-WG-MGMT.)
VRFs do NOT have default routes (0.0.0.0/0) by default — this must be added.

### Software-Managed Mangle Rules (dynamic)
- ACCESO-USER-<userTag>: src=<mgmt_ip del usuario> (10.13.250.x / 10.14.250.x), dst=LIST-NET-REMOTE-TOWERS, new-routing-mark=VRF-NDx — modelo POR-USUARIO vigente
- SCAN-WS-<wsTag>: src=<scan-IP 10.11.252.x>, dst=LIST-NET-REMOTE-TOWERS, new-routing-mark=VRF-NDx
- ACCESO-ADMIN / ACCESO-DINAMICO: LEGACY single-user (el provisioner los elimina)
- Rule: vpn-activa must NEVER contain LAN subnets de torre

### SSTP
- Profile PROF-VPN-TOWERS: local=10.10.250.1, pool 10.10.250.2-100
- Port 4443, mschap2, TLS 1.2 only

**Why:** Add default routes to all VRF tables pointing to 10.0.2.1 (WAN gateway) as a safety net.
**How to apply:** When generating corrected RSC or reviewing VRF configs, always check for default route in each VRF table.
