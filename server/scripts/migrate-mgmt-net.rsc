# ============================================================================
# MikroTik RouterOS — MIGRACIÓN del plano de gestión 192.168.21.0/24 → 10.x
#   GW-VPN-CORE-ISP (RB750GL, RouterOS 7.x)
#
#   Antes:  UNA interfaz VPN-WG-MGMT (192.168.21.1/24, :13231) para todo.
#   Ahora:  3 interfaces de gestión + IP de gestión por nodo + scan-pool:
#     • VPN-WG-VPS       10.12.250.1/24  :13232  → peer del VPS (.60)
#     • VPN-WG-CLIENTES  10.13.250.1/24  :13233  → moderadores / members
#     • VPN-WG-ADMIN     10.14.250.1/24  :13234  → dispositivos del admin
#     • Nodos WG  → IP gestión 10.11.250.<ND>     (en cada CPE)
#     • Nodos SSTP→ IP gestión 10.11.251.<ND>     (en cada CPE)
#     • Scan-pool VPS  → 10.11.252.0/24
#
# ⚠️ LEER EL RUNBOOK (HANDOFF / MIGRACION_RED_GESTION.md) ANTES.
# ⚠️ MIGRACIÓN REMOTA: NO borres VPN-WG-MGMT hasta haber migrado tu propio
#    dispositivo a VPN-WG-ADMIN y confirmado acceso, o te quedas fuera.
#
# Pegar por FASES (no todo de golpe). Revisar logs entre fases.
# ============================================================================


# ════════════════════════════════════════════════════════════════════════
#  FASE 1 — Crear las 3 interfaces de gestión (coexisten con la vieja)
#           Puertos NUEVOS (13232/13233/13234) → sin conflicto con :13231.
# ════════════════════════════════════════════════════════════════════════
/interface/wireguard/add name=VPN-WG-VPS      listen-port=13232 mtu=1420 comment="Gestion VPS"
/interface/wireguard/add name=VPN-WG-CLIENTES listen-port=13233 mtu=1420 comment="Gestion Clientes (moderadores/members)"
/interface/wireguard/add name=VPN-WG-ADMIN    listen-port=13234 mtu=1420 comment="Gestion Admin"

/ip/address/add address=10.12.250.1/24 interface=VPN-WG-VPS      comment="GW gestion VPS"
/ip/address/add address=10.13.250.1/24 interface=VPN-WG-CLIENTES comment="GW gestion Clientes"
/ip/address/add address=10.14.250.1/24 interface=VPN-WG-ADMIN    comment="GW gestion Admin"

# Permitir los 3 puertos UDP de entrada (ajusta place-before a tu drop final)
/ip/firewall/filter/add chain=input protocol=udp dst-port=13232-13234 \
  action=accept comment="WG Gestion 13232-13234 (migracion)"

# Anota las CLAVES PÚBLICAS del servidor (las necesitas para los .conf):
/interface/wireguard/print where name~"VPN-WG-(VPS|CLIENTES|ADMIN)"


# ════════════════════════════════════════════════════════════════════════
#  FASE 2 — Address-lists del plano de gestión
#           LIST-MGMT-TRUSTED: + los 3 nuevos /24  |  vpn-activa: idem
# ════════════════════════════════════════════════════════════════════════
/ip/firewall/address-list/add list=LIST-MGMT-TRUSTED address=10.12.250.0/24 comment="Gestion VPS"
/ip/firewall/address-list/add list=LIST-MGMT-TRUSTED address=10.13.250.0/24 comment="Gestion Clientes"
/ip/firewall/address-list/add list=LIST-MGMT-TRUSTED address=10.14.250.0/24 comment="Gestion Admin"

# vpn-activa (pool de gestión que el modelo legacy marcaba). NO contener LANs.
/ip/firewall/address-list/add list=vpn-activa address=10.12.250.0/24 comment="User Access"
/ip/firewall/address-list/add list=vpn-activa address=10.13.250.0/24 comment="User Access"
/ip/firewall/address-list/add list=vpn-activa address=10.14.250.0/24 comment="User Access"


# ════════════════════════════════════════════════════════════════════════
#  FASE 3 — Rutas de retorno por VRF (CLIENTES/ADMIN/VPS + scan)
#           Itera TODOS los VRF y añade las 4 rutas hacia las nuevas
#           interfaces. Idempotente: comprueba antes de añadir.
# ════════════════════════════════════════════════════════════════════════
:foreach v in=[/ip/vrf/find] do={
  :local vrfName [/ip/vrf/get $v name]
  :if ($vrfName != "main") do={
    :local rt {
      {"net"="10.13.250.0/24"; "gw"="VPN-WG-CLIENTES"; "tag"="MGMT-CLIENTES"};
      {"net"="10.14.250.0/24"; "gw"="VPN-WG-ADMIN";    "tag"="MGMT-ADMIN"};
      {"net"="10.12.250.0/24"; "gw"="VPN-WG-VPS";      "tag"="MGMT-VPS"};
      {"net"="10.11.252.0/24"; "gw"="VPN-WG-VPS";      "tag"="SCAN"}
    }
    :foreach r in=$rt do={
      :if ([:len [/ip/route/find where dst-address=($r->"net") routing-table=$vrfName]] = 0) do={
        /ip/route/add dst-address=($r->"net") gateway=($r->"gw") \
          routing-table=$vrfName scope=30 target-scope=10 \
          comment=("Route-" . $vrfName . "-" . ($r->"tag"))
        :log info ("MIGRACION: ruta " . ($r->"net") . " -> " . ($r->"gw") . " en " . $vrfName)
      }
    }
  }
}


# ════════════════════════════════════════════════════════════════════════
#  FASE 4 — (POR NODO, manual o vía panel) IP de gestión del nodo
#  Para cada nodo, en el CORE, añade la ruta /32 hacia su túnel y el
#  address-list. Ejemplo para ND7 (WireGuard, VRF-ND7-TORREOMAR, iface
#  WG-ND7-TORREOMAR). Repite por nodo (o re-provisiona desde el panel).
#
#    /ip/route/add dst-address=10.11.250.7/32 gateway=WG-ND7-TORREOMAR@VRF-ND7-TORREOMAR \
#      routing-table=VRF-ND7-TORREOMAR scope=30 target-scope=10 comment="Route-ND7-MGMTIP"
#    /ip/firewall/address-list/add list=LIST-NET-REMOTE-TOWERS address=10.11.250.7/32 comment="Ruta TORREOMAR"
#
#  (SSTP usa 10.11.251.<ND> y gateway=<iface-sstp>@<VRF>.)
#  ➜ Lo más simple: usar "Reparar" / re-provisionar cada nodo desde el panel,
#    que ya inyecta estas rutas automáticamente.
# ════════════════════════════════════════════════════════════════════════


# ════════════════════════════════════════════════════════════════════════
#  FASE 5 — Migrar peers (BIG-BANG) — se hace desde el PANEL, no aquí.
#   • Moderadores/members → re-emiten .conf (peer en VPN-WG-CLIENTES, 10.13.250.x)
#   • Admin (tus dispositivos) → nuevo peer en VPN-WG-ADMIN (10.14.250.x)
#   • VPS → peer en VPN-WG-VPS (10.12.250.60) + wg0 del VPS actualizado
#   El peer del VPS se crea a mano una vez (clave pública del VPS):
#
#    /interface/wireguard/peers/add interface=VPN-WG-VPS \
#      public-key="<CLAVE_PUBLICA_DEL_VPS>" allowed-address=10.12.250.60/32 \
#      comment="VPS"
# ════════════════════════════════════════════════════════════════════════


# ════════════════════════════════════════════════════════════════════════
#  FASE 6 — CORTE FINAL (solo cuando YA estés conectado por VPN-WG-ADMIN
#           y confirmes acceso al router y a los nodos). Limpia lo viejo.
# ════════════════════════════════════════════════════════════════════════
# 6a. Rutas de retorno viejas (192.168.21.0/24) en todos los VRF:
#   :foreach r in=[/ip/route/find where dst-address="192.168.21.0/24"] do={ /ip/route/remove $r }
#
# 6b. Mangle legacy global (si existiera) — el panel ya usa mangle por-usuario:
#   /ip/firewall/mangle/remove [find where comment="ACCESO-ADMIN"]
#   /ip/firewall/mangle/remove [find where comment="ACCESO-DINAMICO"]
#
# 6c. Address-lists viejas:
#   /ip/firewall/address-list/remove [find where address="192.168.21.0/24"]
#
# 6d. Interfaz vieja (libera el puerto 13231) — ESTO TE DESCONECTA si sigues
#     en 192.168.21.x. Hazlo SOLO desde 10.14.250.x:
#   /ip/address/remove [find where interface="VPN-WG-MGMT"]
#   /interface/wireguard/remove [find where name="VPN-WG-MGMT"]
#   /ip/firewall/filter/remove [find where comment~"13231"]
# ════════════════════════════════════════════════════════════════════════
