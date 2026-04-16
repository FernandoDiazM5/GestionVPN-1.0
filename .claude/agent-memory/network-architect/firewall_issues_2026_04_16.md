---
name: Firewall Issues GW-VPN-CORE-ISP 2026-04-16
description: Corrected root cause analysis for 16-04.rsc: admin internet loss and node internet gain — NOT VRF blackhole, but masquerade state collision and missing explicit forward blocks
type: project
---

## Architecture constraints (user-confirmed, do not contradict)
- VRF tables are dynamically managed — only have routes to specific remote LANs, NO 0.0.0.0/0 default route, and they should NOT have one
- Mangle prerouting rules (ACCESO-DINAMICO / ACCESO-ADMIN) ONLY match dst=LIST-NET-REMOTE-TOWERS — they never affect internet-bound traffic
- vpn-activa contains only software-managed tunnel endpoint IPs dynamically
- The static 192.168.21.0/24 entry in vpn-activa was the root trigger for both symptoms

## Root Cause: Admin internet loss

The mechanism is masquerade connection state collision in srcnat, NOT VRF blackhole (previous theory was wrong).

Rule N3 (`masquerade src=192.168.21.0/24` with NO out-interface restriction) fires for admin
traffic going out VPN interfaces. This creates masquerade conntrack entries for the admin src IP
bound to a VPN interface. When the same admin src IP sends internet traffic, RouterOS conntrack
may reuse or collide with that entry, causing the connection to be mishandled.

Additionally, rule N4 (`masquerade out=LIST-VPN-TOWERS` no src restriction) fires on ALL traffic
going out VPN tunnels, creating further conntrack ambiguity.

The forward chain (F2 broad accept for in=VPN-WG-MGMT) itself does NOT block admin internet —
admins pass F2 and reach NAT fine. The damage is in NAT.

## Root Cause: Node internet gain

The forward chain only has a broad catch-all drop (F7) to stop node→internet.
Rule F1 (established/related → accept) comes before any blocking rule.
If a node packet gets classified as established/related due to masquerade conntrack collision
(from N4 firing on node→VPN-interface traffic), F1 accepts it before F3 or F7 can block it.

There is no explicit `in=LIST-VPN-TOWERS out=LIST-WAN → drop` rule. Only the catch-all prevents
node→internet, which is bypassed by F1 for established/related state.

## Specific bugs identified

### Bug 1 — Forward: F2 too broad, makes F6 dead code
F2: `chain=forward in-interface=VPN-WG-MGMT → accept` (accepts ALL admin traffic)
F6: `chain=forward in-interface=VPN-WG-MGMT out-interface-list=LIST-WAN → accept` (NEVER REACHED)
Fix: Remove F2, replace F6 with `in=VPN-WG-MGMT out=LIST-WAN → accept`

### Bug 2 — Forward: Missing explicit node→WAN block
No rule `in=LIST-VPN-TOWERS out=LIST-WAN → drop`.
Only catch-all F7 stops node→internet. F1 (established/related) can bypass it.
Fix: Add explicit drop before catch-all.

### Bug 3 — srcnat N3: masquerade src=192.168.21.0/24 without out-interface restriction
Fires on VPN-bound admin traffic, creating conntrack state that collides with internet sessions.
Fix: Add `out-interface=ether1` restriction to N3.

### Bug 4 — srcnat N1: bypass only covers LIST-VPN-WG, misses SSTP tunnels
SSTP nodes (ND1, ND3) are in LIST-VPN-TOWERS but NOT LIST-VPN-WG.
Admin→SSTP-node traffic: N1 misses, N3/N4 masquerade fires, replies break.
Fix: Change N1 out-interface-list from LIST-VPN-WG to LIST-VPN-TOWERS.

### Bug 5 — srcnat N4: masquerade out=LIST-VPN-TOWERS without src restriction
Masquerades ALL sources going out VPN tunnels. Creates ambiguous conntrack for node traffic.
Not needed: the bypass accept (N1) handles admin→nodes. Nodes should never be masqueraded.
Fix: Remove N4 entirely.

## Corrected Forward Chain (final, applied 2026-04-16 from noche.rsc)

```
1. established,related → accept
2. in=LIST-VPN-TOWERS out=LIST-VPN-TOWERS → drop  (AISLAMIENTO NODO-NODO)
3. in=LIST-VPN-TOWERS out=LIST-WAN → drop         (BLOQUEO: Nodos no acceden a internet)
4. in=VPN-WG-MGMT → accept (NO out restriction)  (Admin MGMT libre — covers internet, VPS peer-to-peer, tower VRF)
5. in=BR-LAN out=LIST-WAN → accept               (LAN Oficina a Internet)
6. src=vpn-activa dst=LIST-NET-REMOTE-TOWERS → accept     (SOFTWARE: Permitir acceso a red remota)
7. src=LIST-NET-REMOTE-TOWERS dst=vpn-activa → accept     (SOFTWARE: Retorno de datos)
8. drop (Bloqueo preventivo)
```

Rule 4 has NO out-interface restriction — this is intentional. Admin (192.168.21.x) must be able
to reach the VPS (192.168.21.60) peer-to-peer, internet, and remote towers via VRF mangle.
Restricting to out=LIST-WAN breaks VPS-to-laptop communication and causes 500 errors in the
software when it connects to MT_IP=192.168.21.1.

## Corrected NAT srcnat (final, applied 2026-04-16 from noche.rsc)

```
1. accept src=LIST-MGMT-TRUSTED dst=LIST-NET-REMOTE-TOWERS out=LIST-VPN-TOWERS  (bypass, all tunnels including SSTP)
2. src-nat out=ether1 to=213.173.36.232                                          (static public IP)
[masquerade rules removed — redundant with src-nat and were causing conntrack collisions]
```

**Why:** VRF blackhole theory was wrong — mangle only matches dst=LIST-NET-REMOTE-TOWERS so it
cannot affect internet traffic. Actual damage was in NAT conntrack collision from unrestricted
masquerade rules and missing explicit forward block for node→WAN.

**How to apply:** Never use masquerade without out-interface restriction when multiple interface
types exist. Always add explicit in=LIST-VPN-TOWERS out=LIST-WAN → drop before catch-all.
Always extend NAT bypass to LIST-VPN-TOWERS (not just LIST-VPN-WG) when SSTP tunnels exist.
