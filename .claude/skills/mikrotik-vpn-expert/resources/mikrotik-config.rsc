# 2026-04-02 18:38:15 by RouterOS 7.19.3
# software id = 4Y9A-QY4B
#
# model = RB750GL
# serial number = 3B0602A9CEE4
/interface bridge
add comment="Bridge Local LAN" name=BR-LAN
/interface sstp-server
add name=VPN-SSTP-ND1-HOUSENET user=TorreHousenet
add name=VPN-SSTP-ND3-TORREVIRGINIA2 user=TorreVirginia-ND2
/interface wireguard
add comment="Gestion Administracion" listen-port=13231 mtu=1420 name=\
    VPN-WG-MGMT
add comment=TORREVICTORN2 listen-port=13304 mtu=1420 name=\
    WG-ND4-TORREVICTORN2
/interface list
add comment="Todos los tuneles de torres" name=LIST-VPN-TOWERS
add comment="Salida Internet" name=LIST-WAN
add name=LIST-VPN-SSTP
add name=LIST-VPN-WG
/interface wireless security-profiles
set [ find default=yes ] supplicant-identity=MikroTik
/ip pool
add comment="SSTP Tower Pool" name=POOL-VPN-SSTP ranges=\
    10.10.250.2-10.10.250.100
add name=dhcp_pool1 ranges=192.168.37.2-192.168.37.254
/ip vrf
add interfaces=WG-ND4-TORREVICTORN2 name=VRF-ND4-TORREVICTORN2
add interfaces=VPN-SSTP-ND3-TORREVIRGINIA2 name=VRF-ND3-TORREVIRGINIA2
add interfaces=VPN-SSTP-ND1-HOUSENET name=VRF-ND1-HOUSENET
/ppp profile
add dns-server=8.8.8.8 local-address=10.10.250.1 name=PROF-VPN-TOWERS \
    remote-address=POOL-VPN-SSTP use-encryption=yes
/interface bridge port
add bridge=BR-LAN interface=ether2
add bridge=BR-LAN interface=ether3
/interface list member
add interface=ether1 list=LIST-WAN
add interface=VPN-SSTP-ND1-HOUSENET list=LIST-VPN-TOWERS
add interface=VPN-SSTP-ND3-TORREVIRGINIA2 list=LIST-VPN-TOWERS
add interface=WG-ND4-TORREVICTORN2 list=LIST-VPN-WG
add interface=WG-ND4-TORREVICTORN2 list=LIST-VPN-TOWERS
/interface sstp-server server
set authentication=mschap2 enabled=yes tls-version=only-1.2
/interface wireguard peers
add allowed-address=192.168.21.30/32 comment="Celular - Gestion" interface=\
    VPN-WG-MGMT name=peer1 public-key=\
    "L/O8BnBqBfSE3KEVwQfdjxKYkPZLNM9dDSKfz0TjPl8="
add allowed-address=192.168.21.20/32 comment="Laptop - Gestion" interface=\
    VPN-WG-MGMT name=peer2 public-key=\
    "h77jPRPQ6TKCwEsknfU1Xh/TOumi4+lGJmn408+CqXs="
add allowed-address=192.168.21.50/32 comment="PC FiWis - Gestion" interface=\
    VPN-WG-MGMT name=peer3 public-key=\
    "ztj3BtZa1a5Gi/oyBjl89pz0BCqhosUDP49LZUmKkhA="
add allowed-address=192.168.21.51/32 comment="Laptop Plopis" interface=\
    VPN-WG-MGMT name=peer4 public-key=\
    "U7MiDnAEZBxwIq/kOl8KxAv+1bYfJxiO/7377MWp6hM="
add allowed-address=192.168.21.60/32 comment="Laptop Pamela" interface=\
    VPN-WG-MGMT name=peer5 public-key=\
    "512+OTu7UE3R97JOvpN8AYw0AXI9fSiVKcwChfh2z1k="
add allowed-address=10.10.251.2/32,142.152.7.0/24 comment="Cliente ND4" \
    interface=WG-ND4-TORREVICTORN2 name=peer9 public-key=\
    "DQzBKfzFB1TBh/x4ges/YV4BW9Rrhbg+qTU88iqpAV8="
/ip address
add address=213.173.36.232 comment="Ip Publica" interface=ether1 network=\
    213.173.36.232
add address=10.0.2.7/24 comment="Ip WAN Local" interface=ether1 network=\
    10.0.2.0
add address=192.168.37.1/24 interface=BR-LAN network=192.168.37.0
add address=192.168.21.1/24 interface=VPN-WG-MGMT network=192.168.21.0
add address=10.10.251.1/30 comment="IP Core a ND4" interface=\
    WG-ND4-TORREVICTORN2 network=10.10.251.0
/ip dhcp-server
add address-pool=dhcp_pool1 interface=BR-LAN name=dhcp1
/ip dhcp-server network
add address=192.168.37.0/24 dns-server=8.8.8.8,8.8.4.4 gateway=192.168.37.1
/ip dns
set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
/ip firewall address-list
add address=192.168.21.0/24 comment="WireGuard MGMT" list=LIST-MGMT-TRUSTED
add address=10.1.1.0/24 comment="LAN Duplicadas" list=LIST-NET-REMOTE-TOWERS
add address=192.168.100.0/24 comment="LAN Duplicadas" list=\
    LIST-NET-REMOTE-TOWERS
add address=192.168.37.0/24 comment="Acceso Local Oficina" list=\
    LIST-MGMT-TRUSTED
add address=179.6.29.241 comment="WireGuard MGMT" list=LIST-MGMT-TRUSTED
add address=142.152.7.0/24 comment="LAN Duplicadas" list=\
    LIST-NET-REMOTE-TOWERS
add address=192.168.30.0/24 comment="LAN Duplicadas" list=\
    LIST-NET-REMOTE-TOWERS
add address=10.10.251.0/30 comment="Red WG ND4" list=LIST-NET-REMOTE-TOWERS
add address=213.173.36.233 comment="WireGuard MGMT" list=LIST-MGMT-TRUSTED
add address=192.168.8.0/24 comment="LAN TORREVICTORN2" list=\
    LIST-NET-REMOTE-TOWERS
add address=192.168.21.20 comment="User Access" list=vpn-activa
/ip firewall filter
add action=accept chain=input comment="Permitir respuestas" connection-state=\
    established,related
add action=accept chain=input comment="Permitir todos los tuneles WG Nodos" \
    dst-port=13300-13400 protocol=udp
add action=drop chain=input comment="Dropear invalidos" connection-state=\
    invalid
add action=accept chain=input comment="WireGuard Port" dst-port=13231 \
    protocol=udp
add action=accept chain=input comment="Gestion: Winbox, API, REST" dst-port=\
    8291,8728,444 protocol=tcp src-address-list=LIST-MGMT-TRUSTED
add action=accept chain=input comment="SSTP Handshake" dst-port=443 protocol=\
    tcp
add action=drop chain=input comment="Bloqueo total WAN" in-interface-list=\
    LIST-WAN
add action=accept chain=forward connection-state=established,related
add action=accept chain=forward comment="Admin MGMT libre" in-interface=\
    VPN-WG-MGMT
add action=drop chain=forward comment="AISLAMIENTO NODO-NODO" \
    in-interface-list=LIST-VPN-TOWERS out-interface-list=LIST-VPN-TOWERS
add action=accept chain=forward comment=\
    "SOFTWARE: Permitir acceso a red remota" dst-address-list=\
    LIST-NET-REMOTE-TOWERS src-address-list=vpn-activa
add action=accept chain=forward comment="SOFTWARE: Retorno de datos" \
    dst-address-list=vpn-activa src-address-list=LIST-NET-REMOTE-TOWERS
add action=accept chain=forward comment="Nodos pueden salir a Internet" \
    in-interface-list=LIST-VPN-TOWERS out-interface-list=LIST-WAN
add action=drop chain=forward comment="Bloqueo preventivo"
/ip firewall mangle
add action=change-mss chain=forward disabled=yes new-mss=1360 protocol=tcp \
    tcp-flags=syn
add action=mark-routing chain=prerouting comment=WEB-ACCESS dst-address-list=\
    LIST-NET-REMOTE-TOWERS new-routing-mark=VRF-ND4-TORREVICTORN2 \
    src-address=192.168.21.20
/ip firewall nat
add action=accept chain=srcnat comment="Bypass NAT de Gestion a Nodos" \
    dst-address-list=LIST-NET-REMOTE-TOWERS out-interface-list=LIST-VPN-WG \
    src-address=192.168.21.0/24
add action=src-nat chain=srcnat comment="NAT IP Publica" out-interface=ether1 \
    to-addresses=213.173.36.232
add action=masquerade chain=srcnat comment="NAT WireGuard" src-address=\
    192.168.21.0/24
add action=masquerade chain=srcnat comment="Masquerade automatico para nodos" \
    out-interface-list=LIST-VPN-TOWERS
/ip route
add comment="GW Principal" disabled=no dst-address=0.0.0.0/0 gateway=10.0.2.1
add comment=Route-1 disabled=no distance=1 dst-address=10.1.1.0/24 gateway=\
    VPN-SSTP-ND1-HOUSENET@VRF-ND1-HOUSENET routing-table=VRF-ND1-HOUSENET \
    scope=30 suppress-hw-offload=no target-scope=10
add comment=Route-1-1 disabled=no distance=1 dst-address=192.168.21.0/24 \
    gateway=VPN-WG-MGMT routing-table=VRF-ND1-HOUSENET scope=30 \
    suppress-hw-offload=no target-scope=10
add comment=Route-ND6 dst-address=142.152.7.0/24 gateway=\
    VPN-SSTP-ND3-TORREVIRGINIA2@VRF-ND3-TORREVIRGINIA2 routing-table=\
    VRF-ND3-TORREVIRGINIA2 scope=30 target-scope=10
add comment=Route-ND6-MGMT dst-address=192.168.21.0/24 gateway=VPN-WG-MGMT \
    routing-table=VRF-ND3-TORREVIRGINIA2 scope=30 target-scope=10
add comment="Ruta WG ND4" distance=2 dst-address=142.152.7.0/24 gateway=\
    WG-ND4-TORREVICTORN2@VRF-ND4-TORREVICTORN2 routing-table=\
    VRF-ND4-TORREVICTORN2 scope=30 target-scope=10
add comment=Route-ND4-MGMT dst-address=192.168.21.0/24 gateway=VPN-WG-MGMT \
    routing-table=VRF-ND4-TORREVICTORN2 scope=30 target-scope=10
/ip service
set ftp disabled=yes
set ssh disabled=yes
set telnet disabled=yes
set www disabled=yes
set api address=\
    192.168.21.0/24,132.251.0.223/32,179.6.29.241/32,213.173.36.233/32
/ppp secret
add comment="TORRE HOUSENET" name=TorreHousenet profile=PROF-VPN-TOWERS \
    remote-address=10.10.250.201 service=sstp
add comment="TORRE VIRGINIA ND2" name=TorreVirginia-ND2 profile=\
    PROF-VPN-TOWERS remote-address=10.10.250.205 service=sstp
/snmp
set enabled=yes
/system clock
set time-zone-name=America/Lima
/system identity
set name=GW-VPN-CORE-ISP
/tool romon
set enabled=yes
