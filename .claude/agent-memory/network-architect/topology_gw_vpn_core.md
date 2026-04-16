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

### Admin VPN
- VPN-WG-MGMT (WireGuard, port 13231): 192.168.21.1/24
  - peer1: 192.168.21.30/32 (Celular)
  - peer2: 192.168.21.20/32 (Laptop)
  - peer3: 192.168.21.50/32 (PC FiWis)
  - peer4: 192.168.21.51/32 (Laptop Plopis)
  - VPS: 192.168.21.60/32
  - LIST-MGMT-TRUSTED contains 192.168.21.0/24, 192.168.37.0/24, and specific public IPs

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
Each VRF has: remote LAN route via its tunnel + 192.168.21.0/24 via VPN-WG-MGMT
VRFs do NOT have default routes (0.0.0.0/0) by default — this must be added.

### Software-Managed Mangle Rules (dynamic)
- ACCESO-ADMIN: src=192.168.21.0/24, dst=LIST-NET-REMOTE-TOWERS, new-routing-mark=VRF-NDx, passthrough=yes
- ACCESO-DINAMICO: src=specific-tunnel-IP/32, dst=LIST-NET-REMOTE-TOWERS, new-routing-mark=VRF-NDx, passthrough=yes
- Rule: vpn-activa must NEVER contain 192.168.21.0/24 (admin subnet)

### SSTP
- Profile PROF-VPN-TOWERS: local=10.10.250.1, pool 10.10.250.2-100
- Port 4443, mschap2, TLS 1.2 only

**Why:** Add default routes to all VRF tables pointing to 10.0.2.1 (WAN gateway) as a safety net.
**How to apply:** When generating corrected RSC or reviewing VRF configs, always check for default route in each VRF table.
