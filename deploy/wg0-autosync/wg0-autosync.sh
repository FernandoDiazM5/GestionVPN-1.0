#!/usr/bin/env bash
# ============================================================
#  wg0-autosync.sh — Reconciliador del wg0 del VPS (lado HOST, root).
#
#  Modelo hardened (handoff §4.27): el backend (contenedor, no-root) NO toca el
#  wg0. Solo escribe la INTENCIÓN —las LAN de torre que deben estar en el
#  AllowedIPs— en $INTENT. Este script (root, disparado por systemd path) lee esa
#  intención y, SOLO si falta alguna, la añade al AllowedIPs del [Peer] del wg0 y
#  recarga en vivo con `wg syncconf` (sin cortar el túnel).
#
#  GUARDA DE IDEMPOTENCIA: si no falta nada, NO reescribe ni recarga (no-op).
#  La unión NUNCA borra entradas: lo que ya esté en el wg0 se preserva.
#
#  RUTAS DEL KERNEL: `wg syncconf` actualiza los AllowedIPs internos de WireGuard
#  pero NO crea las rutas del sistema (a diferencia de `wg-quick up`). Sin la
#  ruta `dev wg0`, el tráfico a la LAN de la torre sale por la default (eth0) y
#  se pierde. Por eso este script reconcila las rutas con `ip route replace`
#  (idempotente) en CADA corrida, aunque el AllowedIPs no haya cambiado.
#
#  Requiere en el host: wireguard-tools (wg, wg-quick), awk. Sin node.
#  Variables (override por entorno):
#    WG0_CONF   (def. /etc/wireguard/wg0.conf)
#    WG0_IFACE  (def. wg0)
#    WG0_INTENT (def. /opt/wg0-autosync/allowedips.desired)
# ============================================================
set -euo pipefail

CONF="${WG0_CONF:-/etc/wireguard/wg0.conf}"
IFACE="${WG0_IFACE:-wg0}"
INTENT="${WG0_INTENT:-/opt/wg0-autosync/allowedips.desired}"

log() { logger -t wg0-autosync "$*" 2>/dev/null || true; echo "wg0-autosync: $*"; }

[ -f "$INTENT" ] || { log "sin intención ($INTENT) — nada que hacer"; exit 0; }
[ -f "$CONF" ]   || { log "ERROR: no existe $CONF"; exit 1; }

# Reescribe la línea AllowedIPs del [Peer] como la UNIÓN (existentes ∪ intención),
# preservando orden y sin duplicar. El resto del archivo queda intacto.
NEW="$(
  awk -v intentfile="$INTENT" '
    BEGIN {
      n=0
      while ((getline line < intentfile) > 0) {
        gsub(/[ \t\r]/,"",line)
        if (line=="" || line ~ /^#/) continue
        want[++n]=line
      }
    }
    /^[[:space:]]*\[[Ii]nterface\]/ { sec="iface" }
    /^[[:space:]]*\[[Pp]eer\]/      { sec="peer" }
    {
      if (sec=="peer" && $0 ~ /^[[:space:]]*[Aa]llowed[Ii][Pp]s[[:space:]]*=/) {
        eq=index($0,"="); rest=substr($0,eq+1); gsub(/[ \t\r]/,"",rest)
        m=split(rest, cur, ",")
        delete seen; out=""
        for (i=1;i<=m;i++){ c=cur[i]; if(c!="" && !(c in seen)){seen[c]=1; out=(out==""?c:out", "c)} }
        for (i=1;i<=n;i++){ c=want[i]; if(!(c in seen)){seen[c]=1; out=(out==""?c:out", "c)} }
        print "AllowedIPs = " out
        next
      }
      print
    }
  ' "$CONF"
)"

# ── Aplicar cambios al AllowedIPs solo si difiere (guarda de idempotencia) ──
if [ "$NEW" = "$(cat "$CONF")" ]; then
  log "wg0 ya sincronizado — sin cambios en AllowedIPs"
else
  cp -a "$CONF" "$CONF.bak"
  printf '%s\n' "$NEW" > "$CONF"
  # Recarga en vivo sin tirar el túnel.
  wg syncconf "$IFACE" <(wg-quick strip "$IFACE")
  log "AllowedIPs actualizado y wg syncconf aplicado (backup en $CONF.bak)"
fi

# ── Reconciliar SIEMPRE las rutas del kernel desde el AllowedIPs del [Peer] ──
# `wg syncconf` NO crea rutas del sistema. `ip route replace` es idempotente:
# crea la que falte y deja igual la que ya exista. Se saltan las /32 (IPs del
# scan-pool que wg-quick gestiona vía [Interface] Address, no como red remota).
ALLOWED="$(awk '
  /^[[:space:]]*\[[Ii]nterface\]/ { sec="iface" }
  /^[[:space:]]*\[[Pp]eer\]/      { sec="peer" }
  sec=="peer" && /^[[:space:]]*[Aa]llowed[Ii][Pp]s[[:space:]]*=/ {
    eq=index($0,"="); rest=substr($0,eq+1); gsub(/[ \t\r]/,"",rest); print rest
  }' "$CONF")"

IFS=',' read -ra CIDRS <<< "$ALLOWED"
for cidr in "${CIDRS[@]}"; do
  [ -z "$cidr" ] && continue
  case "$cidr" in */32) continue ;; esac
  if ip route replace "$cidr" dev "$IFACE" 2>/dev/null; then
    log "ruta asegurada: $cidr dev $IFACE"
  else
    log "ADVERTENCIA: no se pudo asegurar ruta $cidr dev $IFACE"
  fi
done
