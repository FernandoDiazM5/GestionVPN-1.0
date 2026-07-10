# 🔵 04 — Configuración del VPS (producción)

> Cómo está montado el servidor de producción: VPS DigitalOcean + Docker (MariaDB + backend host-mode + nginx) + el túnel `wg0` que lo conecta al MikroTik + secretos, jobs y el autosync del `wg0`.
> Fuentes de verdad: `docker-compose.prod.yml`, `server/Dockerfile.prod`, `vpn-manager/Dockerfile.prod`, `server/entrypoint.sh`, `server/.env.production.example`, `.env.prod.example`, `deploy/wg0-autosync/`. Runbook: [`DESPLIEGUE_VPS.md`](../../DESPLIEGUE_VPS.md). Volver al [índice](./00_Indice_y_Trazabilidad.md).

---

## 1) Hardware, SO y firewall

| Recurso | Valor |
|---|---|
| Proveedor | DigitalOcean droplet |
| IP pública del VPS | `134.199.212.232` (origen del panel) |
| SO | Ubuntu 22.04+ |
| Tamaño mínimo | 2 vCPU / 2 GB RAM / 40 GB SSD |
| Dependencias del host | Docker + Compose + `wireguard-tools` + git |
| Repo en el VPS | `/root/GestionVPN-1.0` · proyecto compose `gestionvpn-10` |

**Firewall (`ufw`):**

| Puerto | Proto | Estado |
|---|---|---|
| 22 | TCP | abierto (SSH admin) |
| 80 / 443 | TCP | abierto (panel HTTP→HTTPS) |
| 51820 (o 13232) | UDP | abierto (WireGuard al MikroTik) |
| **3001** | TCP | **cerrado al exterior** (backend host-mode) — pero permitir el bridge de Docker (ver §8 gotcha 1) |
| **3307** | TCP | cerrado (MariaDB, solo localhost) |

---

## 2) El túnel `wg0` (la pieza crítica)

El backend corre en **`network_mode: host`** precisamente para alcanzar el MikroTik por el `wg0` del host. Si `wg0` no está arriba, **nada** que toque el router funciona.

`/etc/wireguard/wg0.conf`:
```ini
[Interface]
Address = 10.12.250.60/32
PrivateKey = <PRIVATE_KEY_DEL_VPS>
# Scan-pool (Opción C): IPs de origen del escaneo, 1 por workspace (.2–.254).
PostUp   = for i in $(seq 2 254); do ip addr add 10.11.252.$i/32 dev %i; done
PostDown = for i in $(seq 2 254); do ip addr del 10.11.252.$i/32 dev %i; done

[Peer]
PublicKey = <PUBLIC_KEY_DEL_MIKROTIK>
Endpoint = 213.173.36.232:13232          # listen-port de VPN-WG-VPS
AllowedIPs = 10.12.250.0/24, 10.13.250.0/24, 10.14.250.0/24, 10.11.250.0/24, 10.11.251.0/24, 10.11.252.0/24
PersistentKeepalive = 25
```

Puntos clave:
- **`AllowedIPs` debe incluir cada LAN de torre** que se quiera escanear (§4.27). La base son los planos `10.x`; las LAN nuevas las añade el **autosync** (§7).
- 🔴 **Conflicto WireGuard ↔ Docker:** **no** pongas `172.16.0.0/12` en `AllowedIPs` — captura la bridge de Docker (`172.17.0.0/16`) y rompe el proxy nginx→backend.
- Persistir tras reboot: `sudo systemctl enable wg-quick@wg0`.

Verificación:
```bash
sudo wg show                  # handshake reciente
ping -c3 10.12.250.1          # endpoint del Core
ip route get 10.12.250.1      # dev wg0
nc -zv 10.12.250.1 8728       # API abierta
```

---

## 3) Topología Docker (`docker-compose.prod.yml`)

Tres servicios ([archivo](../../docker-compose.prod.yml)):

```
┌─────────────────────────────────────────────────────────────┐
│ VPS host                                                      │
│                                                              │
│  wg0 (10.12.250.60) ──────────────▶ MikroTik (10.12.250.1)  │
│       ▲                                                       │
│  [backend]  network_mode: host  :3001  (alcanza wg0)         │
│       │  └ env_file: server/.env.production                   │
│       │  └ volúmenes: backend-data:/data  ·  /opt/wg0-autosync:/wg0sync │
│       ▼                                                       │
│  [db] mariadb:11  127.0.0.1:3307→3306  (solo localhost)      │
│       └ volumen: db-data:/var/lib/mysql                       │
│                                                              │
│  [frontend] nginx  :80 :443  (bridge)                        │
│       └ proxy /api → backend (host-gateway) · ./ssl montado  │
└─────────────────────────────────────────────────────────────┘
```

| Servicio | Imagen / build | Red | Notas |
|---|---|---|---|
| `db` | `mariadb:11` | bridge | Publica `127.0.0.1:3307`. utf8mb4. Healthcheck. **`MARIADB_PASSWORD` solo aplica al crear el volumen.** |
| `backend` | build desde la **raíz** del monorepo (`server/Dockerfile.prod`) | **host** | Necesita `wg0`. Lee `127.0.0.1:3307`. Volumen `/data` (secretos) + `/wg0sync` (autosync). |
| `frontend` | build raíz (`vpn-manager/Dockerfile.prod`) | bridge | Sirve el SPA + proxy `/api`. Monta `./ssl` (certs). `extra_hosts: backend:host-gateway`. |

> **Backend desde la raíz, no `./server`:** el backend importa `@gestionvpn/contracts` (workspace del monorepo). Construido solo desde `./server` daría `Cannot find module '@gestionvpn/contracts'`. El Dockerfile copia `packages/` + `server/` y corre `npm run build:contracts`.

---

## 4) Variables de entorno

Dos archivos (ninguno se commitea):

### 4.1 `.env` (raíz — para Compose) ← `.env.prod.example`
```bash
DB_ROOT_PASSWORD=<root_segura>
DB_APP_PASSWORD=<app_segura>     # DEBE coincidir con MYSQL_PASSWORD de server/.env.production
```

### 4.2 `server/.env.production` ← `server/.env.production.example`
Variables que el backend lee (nombres exactos):
```bash
PORT=3001
NODE_ENV=production
DATA_DIR=/data                  # aquí viven .db_secret y .jwt_secret
MYSQL_HOST=127.0.0.1            # host-mode → MariaDB publicada en localhost
MYSQL_PORT=3307
MYSQL_USER=vpn_app
MYSQL_PASSWORD=<= DB_APP_PASSWORD>
MYSQL_DATABASE=vpn_manager
MYSQL_POOL=10
CORS_ORIGINS=https://134.199.212.232
APP_BASE_URL=https://134.199.212.232/GestionVPN-1.0/
WG_PUBLIC_IP=213.173.36.232     # IP pública del MIKROTIK (no del VPS) para los .conf
EXPIRATION_JOB_ENABLED=true
MONITORING_ENABLED=true
AP_POLL_ENABLED=true
RL_MAX_FAILS=5
RL_WINDOW_MS=900000
METRICS_ALLOW_REMOTE=0
# Opción C (scan-pool)
SCAN_IP_POOL_BASE=10.11.252.
SCAN_IP_POOL_START=2
SCAN_IP_POOL_END=254
SCAN_RETURN_SUBNET=10.11.252.0/24
# SMTP (relay alterno por bloqueo de DO — ver §8 gotcha 2)
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=<APP_PASSWORD>
SMTP_FROM=MikroTik VPN <...>
# Telegram (un solo poller por token)
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=<TOKEN>
# Evita el intento IPv6 fallido en DO
NODE_OPTIONS=--dns-result-order=ipv4first
```

> ⚠️ **`MT_IP`/`MT_USER`/`MT_PASS` NO son env vars.** Viven en la tabla `app_settings` (cifradas) y se configuran desde el panel (`Ajustes → Configurar router`). En el VPS, `MT_IP=10.12.250.1`.

---

## 5) Secretos (`.db_secret` / `.jwt_secret`)

- Viven en `DATA_DIR=/data`, que es el volumen `backend-data` (NO bind-montar en `/app` o el backend los ignora y autogenera nuevos → `ER_DECRYPT_FAILED` al descifrar datos migrados).
- **Instalación limpia** (sin datos a migrar): se **autogeneran** al primer arranque.
- **Migrando datos** desde local: copia los **mismos** secretos que cifraron esos datos al volumen `/data`, o no podrás descifrar `MT_PASS`/SSH/configs WG.

```bash
# Generar nuevos (instalación limpia)
openssl rand -hex 32 > .db_secret    # AES-256-GCM
openssl rand -hex 64 > .jwt_secret   # firma JWT
# Colocarlos en el volumen antes del primer up (ver DESPLIEGUE_VPS §7.3)
```

---

## 6) HTTPS / nginx

- **Solo IP, sin dominio → cert autofirmado** en `./ssl/{fullchain,privkey}.pem` (montado en el frontend como `/etc/nginx/ssl`):
  ```bash
  mkdir -p ssl
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout ssl/privkey.pem -out ssl/fullchain.pem -subj "/CN=134.199.212.232"
  ```
- `nginx.prod.conf` sirve el SPA en `/GestionVPN-1.0/` y hace `proxy_pass` a `backend:3001`. **Obligatorio para SSE:** `proxy_buffering off; proxy_cache off; proxy_set_header Connection ''; chunked_transfer_encoding off;` — sin esto, escaneo/Monitor AP/provisión/"Acceso Restringido" parecen colgados.
- 🔴 **HTTPS no es opcional en prod:** con `NODE_ENV=production` la cookie `vpn_session` es `secure` → por HTTP plano no hay sesión.

---

## 7) Autosync del `wg0` (event-driven, hardened) — `deploy/wg0-autosync/`

Para que el `wg0` aprenda cada LAN nueva sin dar privilegios al backend ([README](../../deploy/wg0-autosync/README.md)):

```
provisión (backend no-root) → escribe LAN en /wg0sync/allowedips.desired (bind-mount)
   → systemd .path (host, root) detecta el cambio
      → wg0-autosync.service ejecuta wg0-autosync.sh
         → añade la LAN al wg0.conf (si falta) + `wg syncconf`   ← sin cortar el túnel
```

Instalación (1 vez, root):
```bash
install -d -o 1001 -g 1001 /opt/wg0-autosync          # el backend corre como uid 1001
install -m 0755 deploy/wg0-autosync/wg0-autosync.sh      /usr/local/sbin/wg0-autosync.sh
install -m 0644 deploy/wg0-autosync/wg0-autosync.service /etc/systemd/system/
install -m 0644 deploy/wg0-autosync/wg0-autosync.path    /etc/systemd/system/
install -m 0644 deploy/wg0-autosync/wg0-autosync.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wg0-autosync.path
systemctl enable --now wg0-autosync.timer    # red de seguridad periódica (opcional)
apt-get install -y wireguard-tools
```

- **Solo añade, nunca borra.** Quitar una LAN al de-provisionar es manual (varias torres comparten LAN). Toggle: `WG0_AUTOSYNC=false`. Reconciliación manual: `npm run sync:wg0` (dry-run por defecto).

---

## 8) Arranque y migraciones (`entrypoint.sh`)

Al arrancar el contenedor backend ([entrypoint.sh](../../server/entrypoint.sh)) corre las migraciones **en orden** (idempotentes, `set -e`):
```
initRbac → initMultiuser → initDb(schema_ops) → migratePerf → migrateNotifications
→ migrateMonitoring → migrateApNode → migrateScanIp → migrateDropCoModerator
→ migrateMgmtIpSource → (seedRoles solo si SEED_DEMO_USERS=true) → node index.js
```
> `SEED_DEMO_USERS` se deja **apagado** en prod → BD sin usuarios → el panel muestra el **Setup Inicial** para crear el Administrador con su propia clave.

---

## 9) Gotchas confirmados en producción (leer antes de re-desplegar)

1. **`ufw deny 3001` rompe nginx→backend (504).** nginx (bridge) alcanza el backend (host) por `172.17.0.1:3001`; el deny lo bloquea. **Fix (ufw es first-match):**
   ```bash
   ufw insert 1 allow from 172.16.0.0/12 to any port 3001 proto tcp
   ufw deny 3001/tcp        # el ALLOW debe quedar ARRIBA del DENY
   ufw reload
   ```
2. **DigitalOcean bloquea SMTP saliente (25/465/587).** El correo no sale → el alta de moderador **no depende del email** (se copia el enlace de invitación a mano). Solución real: **relay** (SendGrid/Brevo/Mailgun) por puerto alterno (lo gestiona el usuario). `NODE_OPTIONS=--dns-result-order=ipv4first` evita el intento IPv6 fallido.
3. **`MARIADB_PASSWORD` solo se aplica al crear el volumen.** Si cambias la clave después: `docker volume rm gestionvpn-10_db-data` y `up` de nuevo.
4. **Historial reescrito (purga de secretos):** en el VPS **siempre** `git fetch origin && git reset --hard origin/main`, **nunca** `git pull`.
5. **Telegram 409:** un solo poller por token. Apaga el bot en local/PC o usa otro token en prod (`TELEGRAM_BOT_ENABLED=false`).
6. **Consola web de DO** filtra el *bracketed paste* → `--build` llega como `--build~`. Termina los comandos con ` #` o escríbelos a mano.

---

## 10) Operación continua

- **Backup:** cron de `mysqldump` + copia de los secretos del volumen.
- **Salud:** `curl -s http://localhost:3001/api/health | jq` (mysql/routeros/smtp) · `docker compose -f docker-compose.prod.yml logs -f backend`.
- **Diagnóstico read-only dentro del contenedor:** `docker exec vpn-backend npm run diagnose` · `... npm run check:scanroute` · `... npm run sync:wg0`.
- **Cert:** el autofirmado dura 10 años; si migras a dominio, `certbot` + cron de renovación.

> Siguiente: [05 — Local vs VPS](./05_Local_vs_VPS.md).
