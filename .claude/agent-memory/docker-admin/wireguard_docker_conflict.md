---
name: WireGuard vs Docker bridge routing conflict
description: WireGuard AllowedIPs 172.16.0.0/12 captures Docker bridge traffic (172.17.0.x), breaking nginx-to-backend proxy. Fix by removing or segmenting the range.
type: project
---

WireGuard AllowedIPs que incluyen 172.16.0.0/12 crean una ruta que captura el trafico de la red bridge de Docker (172.17.0.0/16).

**Why:** El frontend corre en bridge network y usa extra_hosts backend:host-gateway para resolver "backend" como 172.17.0.1. Cuando nginx hace proxy_pass a backend:3001, el kernel envia el paquete por wg0 en lugar de docker0, causando timeout.

**How to apply:**
- Diagnosticar con `ip route show | grep 172` y `docker exec vpn-frontend wget backend:3001`
- Fix A (simple): quitar 172.16.0.0/12 de AllowedIPs si no hay redes remotas en ese rango
- Fix B (granular): reemplazar 172.16.0.0/12 con 172.16.0.0/16 + 172.18.0.0/15 + 172.20.0.0/14 + 172.24.0.0/13 (excluye 172.17.0.0/16)
- Los archivos Docker (docker-compose.yml, nginx.conf) NO necesitan cambios
- VPS: 134.199.212.232, config WG: /etc/wireguard/wg0.conf
