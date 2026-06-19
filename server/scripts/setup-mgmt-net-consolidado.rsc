# ============================================================================
# MikroTik RouterOS 7.x — SETUP CONSOLIDADO del plano de gestión 10.x
#   GW-VPN-CORE-ISP (RB750GL)
#
#   Reconstruye SOLO la BASE de gestión tras haber borrado VRF/peers.
#   Crea las 3 interfaces de gestión + IPs + address-lists + firewall + peer VPS.
#
#     • VPN-WG-VPS       10.12.250.1/24  :13232  → peer del VPS (.60)
#     • VPN-WG-CLIENTES  10.13.250.1/24  :13233  → moderadores / members
#     • VPN-WG-ADMIN     10.14.250.1/24  :13234  → dispositivos del admin
#     • Scan-pool del VPS → 10.11.252.0/24
#
#   ❗ Lo que NO hace este script (lo recrea el PANEL al re-provisionar nodos):
#     - VRF por nodo, interfaces WG-NDx / SSTP por nodo
#     - IP de gestión por nodo (10.11.250.<ND> WG / 10.11.251.<ND> SSTP)
#     - rutas de torre, NAT y mangle por-usuario
#
#   Es IDEMPOTENTE: puedes pegarlo varias veces sin duplicar.
#   NO borra la vieja VPN-WG-MGMT (coexiste; rollback trivial). El corte final
#   está al fondo, COMENTADO — ejecútalo solo cuando entres por 10.14.250.x.
# ============================================================================

# ── EDITA AQUÍ si tu VPS regeneró sus llaves WG (si no, deja la actual) ──
:global vpsKey "BV8zn/sIYs9BVuoaEL2yEYtpxfZ53ElsBFj5NtQARnY="


# ════════════════════════════════════════════════════════════════════════
#  1) Interfaces de gestión (puertos NUEVOS 13232/33/34 → sin conflicto)
# ════════════════════════════════════════════════════════════════════════
:if ([:len [/interface/wireguard/find where name="VPN-WG-VPS"]] = 0) do={
  /interface/wireguard/add name=VPN-WG-VPS listen-port=13232 mtu=1420 comment="Gestion VPS"
}
:if ([:len [/interface/wireguard/find where name="VPN-WG-CLIENTES"]] = 0) do={
  /interface/wireguard/add name=VPN-WG-CLIENTES listen-port=13233 mtu=1420 comment="Gestion Clientes (moderadores/members)"
}
:if ([:len [/interface/wireguard/find where name="VPN-WG-ADMIN"]] = 0) do={
  /interface/wireguard/add name=VPN-WG-ADMIN listen-port=13234 mtu=1420 comment="Gestion Admin"
}

# IPs gateway de cada segmento
:if ([:len [/ip/address/find where address="10.12.250.1/24"]] = 0) do={
  /ip/address/add address=10.12.250.1/24 interface=VPN-WG-VPS comment="GW gestion VPS"
}
:if ([:len [/ip/address/find where address="10.13.250.1/24"]] = 0) do={
  /ip/address/add address=10.13.250.1/24 interface=VPN-WG-CLIENTES comment="GW gestion Clientes"
}
:if ([:len [/ip/address/find where address="10.14.250.1/24"]] = 0) do={
  /ip/address/add address=10.14.250.1/24 interface=VPN-WG-ADMIN comment="GW gestion Admin"
}


# ════════════════════════════════════════════════════════════════════════
#  2) Firewall input — abrir los 3 puertos UDP de gestión
#     (si tienes un drop final en la cadena input, MUEVE esta regla arriba)
# ════════════════════════════════════════════════════════════════════════
:if ([:len [/ip/firewall/filter/find where comment="WG Gestion 13232-13234 (migracion)"]] = 0) do={
  /ip/firewall/filter/add chain=input protocol=udp dst-port=13232-13234 action=accept \
    comment="WG Gestion 13232-13234 (migracion)"
}


# ════════════════════════════════════════════════════════════════════════
#  3) Address-lists del plano de gestión
#     LIST-MGMT-TRUSTED → da acceso Winbox/API/REST a los nuevos segmentos
#     vpn-activa        → pool de gestión que marca el modelo legacy
# ════════════════════════════════════════════════════════════════════════
:foreach a in={"10.12.250.0/24";"10.13.250.0/24";"10.14.250.0/24"} do={
  :if ([:len [/ip/firewall/address-list/find where list="LIST-MGMT-TRUSTED" address=$a]] = 0) do={
    /ip/firewall/address-list/add list=LIST-MGMT-TRUSTED address=$a comment="Gestion (migracion)"
  }
  :if ([:len [/ip/firewall/address-list/find where list="vpn-activa" address=$a]] = 0) do={
    /ip/firewall/address-list/add list=vpn-activa address=$a comment="User Access (migracion)"
  }
}


# ════════════════════════════════════════════════════════════════════════
#  4) Peer del VPS en VPN-WG-VPS
#     allowed-address = IP de gestión del VPS (.60) + scan-pool (10.11.252/24)
# ════════════════════════════════════════════════════════════════════════
:if ([:len [/interface/wireguard/peers/find where comment="VPS-MGMT"]] = 0) do={
  /interface/wireguard/peers/add interface=VPN-WG-VPS public-key=$vpsKey \
    allowed-address=10.12.250.60/32,10.11.252.0/24 comment="VPS-MGMT"
}


# ════════════════════════════════════════════════════════════════════════
#  5) Rutas de retorno por VRF (CLIENTES/ADMIN/VPS + scan)
#     Idempotente. Si aún no recreaste los VRF, no hace nada: el panel las
#     inyecta al re-provisionar cada nodo. Útil para cualquier VRF ya creado.
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
        :log info ("MGMT-SETUP: ruta " . ($r->"net") . " -> " . ($r->"gw") . " en " . $vrfName)
      }
    }
  }
}


# ════════════════════════════════════════════════════════════════════════
#  6) CLAVES PÚBLICAS del servidor — anótalas para los .conf de los peers
# ════════════════════════════════════════════════════════════════════════
:put "=== Claves publicas de las interfaces de gestion ==="
/interface/wireguard/print where name~"VPN-WG-(VPS|CLIENTES|ADMIN)"


# ════════════════════════════════════════════════════════════════════════
#  7) (OPCIONAL) CORTE FINAL del plano viejo 192.168.21.x / :13231
#     ⚠️ NO EJECUTAR hasta entrar por VPN-WG-ADMIN (10.14.250.x) o por la
#        LAN local. Si sigues conectado por 192.168.21.x, te DESCONECTA.
#     Descomenta línea por línea cuando estés seguro.
# ════════════════════════════════════════════════════════════════════════
# :foreach r in=[/ip/route/find where dst-address="192.168.21.0/24"] do={ /ip/route/remove $r }
# /ip/firewall/mangle/remove [find where comment="ACCESO-ADMIN"]
# /ip/firewall/address-list/remove [find where address="192.168.21.0/24"]
# /interface/wireguard/peers/remove [find where allowed-address~"192.168.21.60"]
# /ip/firewall/filter/remove [find where dst-port="13231"]
# /ip/address/remove [find where interface="VPN-WG-MGMT"]
# /interface/wireguard/remove [find where name="VPN-WG-MGMT"]
