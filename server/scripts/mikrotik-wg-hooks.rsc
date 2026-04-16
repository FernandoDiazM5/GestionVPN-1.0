# ============================================================================
# MikroTik RouterOS Script — WireGuard Admin Pool Hooks
# Versión: 1.0  |  Fecha: 2026-04-15
#
# Propósito: Llamar al backend VPN-Manager cuando un peer del pool de
# administración WireGuard (VPN-WG-MGMT, 192.168.21.0/24) se conecta
# o desconecta, para que el sistema cree/elimine automáticamente la
# regla mangle ACCESO-ADMIN correspondiente.
#
# CONFIGURACIÓN REQUERIDA:
#   1. Cambiar BACKEND_URL por la IP/puerto real del servidor VPN-Manager.
#   2. Agregar los scripts wg-peer-up y wg-peer-down en RouterOS:
#      /system/script/add name=wg-peer-up source=<contenido_del_script_1>
#      /system/script/add name=wg-peer-down source=<contenido_del_script_2>
#   3. Configurar los event handlers en la interfaz WireGuard VPN-WG-MGMT.
#
# ============================================================================

# ─── Variables globales (ajustar según entorno) ───────────────────────────
:local backendUrl "http://192.168.21.60:3001/api"

# ─── SCRIPT 1: wg-peer-up ─────────────────────────────────────────────────
# Llamado automáticamente cuando un peer WireGuard establece handshake.
# El parámetro "interface" y "peer" son provistos por RouterOS automáticamente
# a través de la variable de entorno del script de eventos.
#
# Para registrar este script como handler:
#   /interface/wireguard/peers/set [find where interface=VPN-WG-MGMT] \
#     script=wg-peer-up
#
# Nota: RouterOS pasa la IP del peer en $address (sin máscara de subred)
# ─────────────────────────────────────────────────────────────────────────
# Script: wg-peer-up
# /system/script/add name="wg-peer-up" source={
#
#   :local peerAddress $"peer-address"
#   :if ([:len $peerAddress] = 0) do={
#     :log warning "wg-peer-up: peer-address vacía, abortando"
#     :error "peer-address requerida"
#   }
#
#   # Extraer solo la IP sin máscara (ej: "192.168.21.15/32" → "192.168.21.15")
#   :local peerIP $peerAddress
#   :local slashPos [:find $peerAddress "/"]
#   :if ($slashPos > 0) do={
#     :set peerIP [:pick $peerAddress 0 $slashPos]
#   }
#
#   :log info ("wg-peer-up: peer conectado IP=" . $peerIP)
#
#   :do {
#     /tool/fetch \
#       url=($backendUrl . "/tunnel/admin-peer-connected") \
#       http-method=post \
#       http-header-field="Content-Type: application/json" \
#       http-data=("{\"peerIP\":\"" . $peerIP . "\"}") \
#       output=none \
#       as-value
#     :log info ("wg-peer-up: notificado backend para " . $peerIP)
#   } on-error={
#     :log warning ("wg-peer-up: error notificando backend para " . $peerIP)
#   }
#
# }
# ─────────────────────────────────────────────────────────────────────────


# ─── SCRIPT 2: wg-peer-down ───────────────────────────────────────────────
# Llamado cuando un peer WireGuard pierde conexión (handshake timeout).
# ─────────────────────────────────────────────────────────────────────────
# Script: wg-peer-down
# /system/script/add name="wg-peer-down" source={
#
#   :local peerAddress $"peer-address"
#   :if ([:len $peerAddress] = 0) do={
#     :log warning "wg-peer-down: peer-address vacía, abortando"
#     :error "peer-address requerida"
#   }
#
#   :local peerIP $peerAddress
#   :local slashPos [:find $peerAddress "/"]
#   :if ($slashPos > 0) do={
#     :set peerIP [:pick $peerAddress 0 $slashPos]
#   }
#
#   :log info ("wg-peer-down: peer desconectado IP=" . $peerIP)
#
#   :do {
#     /tool/fetch \
#       url=($backendUrl . "/tunnel/admin-peer-disconnected") \
#       http-method=post \
#       http-header-field="Content-Type: application/json" \
#       http-data=("{\"peerIP\":\"" . $peerIP . "\"}") \
#       output=none \
#       as-value
#     :log info ("wg-peer-down: notificado backend para " . $peerIP)
#   } on-error={
#     :log warning ("wg-peer-down: error notificando backend para " . $peerIP)
#   }
#
# }
# ─────────────────────────────────────────────────────────────────────────


# ─── ALTERNATIVA: Scheduler periódico (polling) ───────────────────────────
# Si RouterOS no soporta scripts de evento en WireGuard peers,
# usar un scheduler que revisa peers activos cada 60 segundos.
#
# /system/script/add name="wg-admin-pool-poll" source={
#
#   :local backendUrl "http://192.168.21.60:3001/api"
#   :local wgInterface "VPN-WG-MGMT"
#
#   # Leer peers con handshake reciente (últimos 3 minutos = 180 segundos)
#   :foreach peer in=[/interface/wireguard/peers/find where interface=$wgInterface] do={
#     :local peerData [/interface/wireguard/peers/get $peer]
#     :local lastHandshake ($peerData->"last-handshake")
#     :local allowedAddr ($peerData->"allowed-address")
#
#     # Solo procesar peers del pool admin 192.168.21.x
#     :if ([:find $allowedAddr "192.168.21."] >= 0) do={
#       :local peerIP $allowedAddr
#       :local slashPos [:find $allowedAddr "/"]
#       :if ($slashPos > 0) do={ :set peerIP [:pick $allowedAddr 0 $slashPos] }
#
#       # Considerar "activo" si el handshake fue en los últimos 3 minutos
#       # Nota: last-handshake es relativo (ej: "1m30s"), parsear es complejo en RSc
#       # Esta lógica simplificada notifica connect si hay handshake registrado
#       :if ([:len $lastHandshake] > 0 && $lastHandshake != "never") do={
#         :do {
#           /tool/fetch url=($backendUrl . "/tunnel/admin-peer-connected") \
#             http-method=post \
#             http-header-field="Content-Type: application/json" \
#             http-data=("{\"peerIP\":\"" . $peerIP . "\"}") \
#             output=none as-value
#         } on-error={}
#       }
#     }
#   }
# }
#
# /system/scheduler/add name="wg-admin-pool-poll" interval=60 \
#   on-event=wg-admin-pool-poll start-time=startup
# ─────────────────────────────────────────────────────────────────────────


# ─── Comandos para instalar scripts (ejecutar en Terminal MikroTik) ───────
#
# 1) Definir variable de URL del backend:
#    :global backendUrl "http://192.168.21.60:3001/api"
#
# 2) Ver peers WireGuard activos del pool admin:
#    /interface/wireguard/peers/print where interface=VPN-WG-MGMT
#
# 3) Test manual (simular conexión de peer 192.168.21.10):
#    /tool/fetch url="http://192.168.21.60:3001/api/tunnel/admin-peer-connected" \
#      http-method=post \
#      http-header-field="Content-Type: application/json" \
#      http-data="{\"peerIP\":\"192.168.21.10\"}" \
#      output=user
#
# 4) Ver reglas creadas en MikroTik:
#    /ip/firewall/mangle/print where comment=ACCESO-ADMIN
#
# 5) Verificar estado desde backend:
#    GET http://192.168.21.60:3001/api/tunnel/admin-peers-status
#
# ─────────────────────────────────────────────────────────────────────────
