# 🚀 Plan de Despliegue — GestionVPN-1.0 en VPS con WireGuard (v2, corregido)

> **Fecha:** 2026-06-16
> **Base:** revisión profunda de `INFORME_DESPLIEGUE_VPS.md` contra el código real de la rama `dev` (MySQL + refactor F0–F12).
> **Estado de producción actual:** el VPS corre la rama `main` (arquitectura vieja **SQLite**, corte 2026-05-30, 215 commits por detrás de `dev`).
> **Objetivo de este plan:** desplegar la versión `dev` (MySQL, multi-tenant, hardening) en el VPS, sin romper lo que ya funciona.
>
> **✅ Fase 0 IMPLEMENTADA (2026-06-16):** archivos de despliegue creados en `dev` con sufijo `.prod` (no tocan el flujo local): `docker-compose.prod.yml`, `server/Dockerfile.prod`, `vpn-manager/Dockerfile.prod`, `vpn-manager/nginx.prod.conf`, `server/entrypoint.sh`, `.dockerignore`, `server/.env.production.example`, `.env.prod.example`. **Validado localmente con Docker 29.5.2:** ambas imágenes construyen, el backend resuelve `@gestionvpn/contracts` en runtime e `index.js` parsea, y `nginx -t` pasa con cert autofirmado. Pendiente: HTTPS-sobre-IP resuelto (cert autofirmado), faltan migración de datos y prueba en el VPS.

---

## 0. Lo que cambia respecto a tu informe (resumen de correcciones)

Tu informe está **bien encaminado en arquitectura de red**, pero tiene **5 errores que romperían el arranque o el descifrado de datos**. Los detallo aquí y los aplico en el plan:

| # | Punto del informe | Problema | Corrección |
|---|---|---|---|
| C1 | §5 monta secretos en `/app/.db_secret` | 🔴 El código los lee de `DATA_DIR=/data` (`db.service.js:30`, `auth.middleware.js:7`). Montados en `/app` se **ignoran** y el backend **autogenera secretos nuevos** → no descifra credenciales migradas (`ER_DECRYPT_FAILED`). | Montar los secretos dentro de `/data`, o `DATA_DIR=/app`. Ver §5. |
| C2 | §4.2 Dockerfile backend con `context: ./server` | 🔴 El backend depende del workspace `@gestionvpn/contracts` (monorepo). Construido solo desde `./server` **no resuelve** ese paquete → `Cannot find module '@gestionvpn/contracts'`. | Build desde la **raíz del monorepo** + `npm run build:contracts`. Ver §4.2. |
| C3 | §4.9 entrypoint silencia errores (`2>/dev/null \|\| echo`) | 🟡 Una migración que falle de verdad queda enmascarada y el server arranca con esquema incompleto. | Falta `init:rbac` y `seed:roles`, y el orden importa. Ver §4.9. |
| C4 | §3 / §11 IP del VPS `192.168.21.250` | 🟡 La IP real instalada es **`192.168.21.60/32`**. | Usar `.60` en todo el plan. Ver §3. |
| C5 | §11.4 "no hay conflicto multi-usuario" | 🔴 **Falso para el escaneo/monitoreo.** El plano de control sí es multi-usuario; el escaneo SSH **originado desde el VPS** NO. Ver §11 (reescrito). |

IPs públicas confirmadas (2026-06-16): **MikroTik = `213.173.36.232`** (endpoint WG + `WG_PUBLIC_IP`) · **VPS = `134.199.212.232`** (origen del panel + CORS + cert). Ya aplicadas en §3.2, §4.1 y las plantillas.

---

## 1. Decisión previa: ¿desde qué rama se despliega?

Producción corre `main` (SQLite). Para desplegar MySQL hay **dos caminos**:

- **A) Desplegar desde `dev`** (rápido): `git checkout dev` en el VPS. Production queda en una rama de desarrollo.
- **B) Merge `dev → main` y desplegar `main`** (recomendado para producción): `main` vuelve a ser "lo desplegado". Requiere un merge limpio (215 commits) y re-tag.

> ⚠️ **`main` tiene secretos commiteados** (`server/.db_secret`, `server/database.sqlite`). Al preparar el despliegue MySQL **no reutilices** esos secretos del repo; genera nuevos en el VPS (§7.3) y, idealmente, **purga** esos archivos del historial de `main` antes de hacerlo público.

Este plan asume **camino B** (merge a `main`), pero los comandos sirven igual para `dev`.

---

## 2. Requisitos del VPS

Igual que tu informe (Ubuntu 22.04+, 2 vCPU / 2 GB / 40 GB SSD, Docker + Compose + WireGuard + git). Firewall:

| Puerto | Proto | Uso |
|---|---|---|
| 22 | TCP | SSH admin |
| 80 / 443 | TCP | Panel (HTTP→HTTPS) |
| 51820 | UDP | WireGuard al MikroTik |

> El backend escucha en **3001** pero con `network_mode: host` queda expuesto en el host. **NO abras 3001 al exterior** — solo nginx (443) debe ser público. Bloquéalo: `sudo ufw deny 3001/tcp`.

---

## 3. WireGuard del VPS (pieza crítica)

### 3.1 IP del VPS en la red de gestión

**IP real instalada: `192.168.21.60/32`.** Debe cumplir (ya lo cumple si está libre):
- No ser `192.168.21.1` (MikroTik).
- No estar asignada como `mgmt_ip` de ningún usuario en `user_mgmt_ips`.
- Estar en el peer del MikroTik con `allowed-address=192.168.21.60/32`.

### 3.2 `/etc/wireguard/wg0.conf` (en el VPS)

```ini
[Interface]
Address = 192.168.21.60/32
PrivateKey = <PRIVATE_KEY_DEL_VPS>

[Peer]
PublicKey = <PUBLIC_KEY_DEL_MIKROTIK>
# IP pública FIJA del MikroTik (NO la del VPS 134.199.212.232)
Endpoint = 213.173.36.232:51820
# Mínimo la /24 de gestión. Si el escaneo SSH debe salir por el túnel,
# añade aquí las LANs remotas de las torres (o usa una ruta puntual).
AllowedIPs = 192.168.21.0/24
PersistentKeepalive = 25
```

> 🔴 **Conflicto WireGuard ↔ Docker (ya documentado en tu memoria `docker-admin`):** no pongas `172.16.0.0/12` en `AllowedIPs` — captura la red bridge de Docker (`172.17.0.0/16`) y rompe el proxy nginx→backend. Con `network_mode: host` el backend no usa la bridge, pero el **frontend nginx sí**, así que mantén la regla.

### 3.3 Lado MikroTik

```routeros
/interface/wireguard/peers/add \
    interface=WG-MGMT \
    public-key="<PUBLIC_KEY_DEL_VPS>" \
    allowed-address=192.168.21.60/32 \
    comment="VPS-PANEL-PRODUCCION"
```

### 3.4 Verificación (bloqueante — si esto falla, nada funciona)

```bash
sudo wg-quick up wg0 && sudo systemctl enable wg-quick@wg0
ping -c3 192.168.21.1            # MikroTik responde
ip route get 192.168.21.1        # debe decir "dev wg0"
nc -zv 192.168.21.1 8728         # API RouterOS abierta
```

Si el API no responde: revisa `/ip/service/print` (api en 8728) y que el address-list de gestión incluya `192.168.21.60`.

---

## 4. Cambios en el código

Variables de entorno **verificadas contra el código** (nombres exactos que lee el backend):

### 4.1 `server/.env.production` (nuevo)

```bash
PORT=3001
NODE_ENV=production
DATA_DIR=/data                      # ← aquí viven .db_secret y .jwt_secret

# MySQL (MariaDB en Docker). Con backend en host-mode → 127.0.0.1:3307
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3307
MYSQL_USER=vpn_app
MYSQL_PASSWORD=<CONTRASEÑA_APP>
MYSQL_DATABASE=vpn_manager
MYSQL_POOL=10

# CORS — SOLO el origen real (con dominio+HTTPS o IP:443)
CORS_ORIGINS=https://tu-dominio.com

# IP pública del MikroTik para los .conf WireGuard de los usuarios
WG_PUBLIC_IP=213.173.36.232

# Jobs
EXPIRATION_JOB_ENABLED=true
MONITORING_ENABLED=true
AP_POLL_ENABLED=true

# SMTP (Gmail App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=fernandodiazm.5@gmail.com
SMTP_PASS=<APP_PASSWORD_16>
SMTP_FROM=MikroTik VPN <fernandodiazm.5@gmail.com>
APP_BASE_URL=https://tu-dominio.com/GestionVPN-1.0/

# Telegram
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=<TOKEN>

# Rate limit login
RL_MAX_FAILS=5
RL_WINDOW_MS=900000

# Métricas Prometheus solo locales
METRICS_ALLOW_REMOTE=0
```

> Notas verificadas:
> - **MT_IP / MT_USER / MT_PASS NO son env vars** — viven en la tabla `app_settings` y se configuran desde el panel (Ajustes del Administrador). Por eso no aparecen aquí.
> - `dotenv` carga `.env`, no `.env.production`. No importa: Docker Compose inyecta `env_file` como variables reales del proceso. (Si arrancaras sin Docker, renombra a `.env`.)

### 4.2 `server/Dockerfile` (CORREGIDO — build desde monorepo)

El backend importa `@gestionvpn/contracts` (workspace). **Debe construirse desde la raíz**:

```dockerfile
# Contexto de build = RAÍZ del monorepo
FROM node:22-alpine AS base
RUN apk add --no-cache python3 make g++   # ssh2 nativo
WORKDIR /repo

# 1. Manifiestos de los workspaces (cachea npm ci)
COPY package*.json ./
COPY packages/contracts/package*.json ./packages/contracts/
COPY server/package*.json ./server/
RUN npm ci --omit=dev --workspace=server --workspace=@gestionvpn/contracts \
    || npm ci --omit=dev

# 2. Código
COPY packages/ ./packages/
COPY server/ ./server/

# 3. Compilar contracts (genera el JS/.d.ts que requiere el backend)
RUN npm run build:contracts

# 4. Datos persistentes + usuario no-root
RUN mkdir -p /data /repo/server/uploads
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app \
 && chown -R app:app /repo /data
USER app

WORKDIR /repo/server
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["./entrypoint.sh"]
```

### 4.3 `vpn-manager/Dockerfile` (build monorepo + contracts) — como tu informe §4.3, correcto

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /repo
COPY package*.json ./
COPY packages/ ./packages/
COPY vpn-manager/ ./vpn-manager/
RUN npm ci
RUN npm run build:contracts
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
WORKDIR /repo/vpn-manager
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /repo/vpn-manager/dist /usr/share/nginx/html/GestionVPN-1.0
COPY vpn-manager/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 4.4 `nginx.conf` — HTTPS + **SSE** (tu §4.4 es correcto, mantenlo)

El bloque `proxy_buffering off; proxy_cache off; proxy_set_header Connection ''; chunked_transfer_encoding off;` es **obligatorio** para los SSE reales del sistema: `/tunnel/events`, `node/scan-stream`, `ap-monitor/watch`, `node/provision/:id/progress` y la pantalla "Acceso Restringido" (`/router/check`). Sin esto el panel parece "colgado".

> `helmet` ya pone headers de seguridad a nivel app (`index.js:85`). Los `add_header` de nginx son redundantes pero no dañan; si ves headers duplicados, déjalos solo en uno.

### 4.5 `index.js` — `trust proxy` (opcional, recomendado)

No está en el código. Detrás de nginx conviene, para `req.ip` correcto en rate-limit/logs:

```js
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
```

> La cookie `secure` ya está bien (`lib/jwt.js:31` → `secure: NODE_ENV==='production'`). Con `NODE_ENV=production` la cookie **exige HTTPS**: si pruebas por HTTP no habrá sesión. Por eso HTTPS no es opcional en prod.

### 4.9 `server/entrypoint.sh` (CORREGIDO — orden + sin enmascarar fallos reales)

```sh
#!/bin/sh
set -e
echo "🔧 Migraciones de BD..."
# Orden: esquema base RBAC/multiuser primero, luego incrementales, luego seed.
node db/initRbac.js
node db/initMultiuser.js
node db/migratePerf.js
node db/migrateNotifications.js
node db/migrateMonitoring.js
node db/migrateApNode.js
node db/seedRoles.js
echo "✅ Migraciones OK. Iniciando servidor..."
exec node index.js
```

> Las migraciones deben ser **idempotentes** (re-ejecutables). Si alguna **no** lo es, conviértela en idempotente en vez de silenciar el error con `|| true` (eso oculta esquemas a medio aplicar). `set -e` aborta el arranque si una migración falla de verdad → mejor fallar visible que servir con BD incompleta.

---

## 5. `docker-compose.prod.yml` (CORREGIDO)

```yaml
services:

  db:
    image: mariadb:11
    container_name: vpn-db
    restart: unless-stopped
    environment:
      MARIADB_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MARIADB_DATABASE: vpn_manager
      MARIADB_USER: vpn_app
      MARIADB_PASSWORD: ${DB_APP_PASSWORD}
    ports:
      - "127.0.0.1:3307:3306"     # solo localhost; lo consume el backend host-mode
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 40s
    command: >
      --innodb-buffer-pool-size=256M --max-connections=50
      --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci

  backend:
    build:
      context: .                  # ← RAÍZ del monorepo (C2)
      dockerfile: server/Dockerfile
    container_name: vpn-backend
    restart: unless-stopped
    network_mode: host            # ← obligatorio: necesita wg0 del host
    env_file: [server/.env.production]
    volumes:
      - backend-data:/data        # ← .db_secret y .jwt_secret viven AQUÍ (C1)
    depends_on:
      db: { condition: service_healthy }

  frontend:
    build:
      context: .
      dockerfile: vpn-manager/Dockerfile
    container_name: vpn-frontend
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - /etc/letsencrypt/live/tu-dominio.com/fullchain.pem:/etc/nginx/ssl/fullchain.pem:ro
      - /etc/letsencrypt/live/tu-dominio.com/privkey.pem:/etc/nginx/ssl/privkey.pem:ro
    extra_hosts: ["backend:host-gateway"]
    depends_on: [backend]

volumes:
  db-data:
  backend-data:
```

> **Corrección C1 — secretos:** como el backend lee de `DATA_DIR=/data` y `/data` es el volumen `backend-data`, los secretos deben quedar **dentro del volumen**, no bind-montados en `/app`. Procedimiento en §7.3 (se copian al volumen antes del primer arranque, o se dejan autogenerar si es instalación limpia sin datos previos).
>
> **`network_mode: host` + MariaDB:** correcto. El backend en host-mode ve `127.0.0.1:3307` (puerto publicado por `db`). Por eso `MYSQL_HOST=127.0.0.1`, `MYSQL_PORT=3307`.
>
> **`extra_hosts: backend:host-gateway`** permite a nginx (bridge) alcanzar el backend (host) — combínalo con `proxy_pass http://backend:3001` en nginx.

`.env` en la raíz (para Compose):

```bash
DB_ROOT_PASSWORD=<root_segura>
DB_APP_PASSWORD=<app_segura>     # debe coincidir con MYSQL_PASSWORD de .env.production
```

---

## 6. HTTPS

Elegido: **solo IP, sin dominio → cert autofirmado.** El panel quedará en `https://134.199.212.232/GestionVPN-1.0/`. El navegador mostrará un aviso la primera vez (aceptas la excepción); la cookie `secure` SÍ funciona porque es HTTPS.

```bash
# En el VPS, dentro de /opt/GestionVPN-1.0 — genera el cert que monta el frontend
mkdir -p ssl
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout ssl/privkey.pem -out ssl/fullchain.pem \
  -subj "/CN=134.199.212.232"
```
`docker-compose.prod.yml` monta `./ssl → /etc/nginx/ssl:ro`, que es donde `nginx.prod.conf` espera `fullchain.pem`/`privkey.pem`.

> Si más adelante consigues un dominio (incl. gratuito DuckDNS/nip.io): `certbot certonly --standalone -d tu-dominio.com`, apunta el volumen `./ssl` a los `.pem` de Let's Encrypt y quita el aviso del navegador. Renovación: cron `certbot renew && docker restart vpn-frontend`.
>
> ⚠️ Nunca uses HTTP plano con `NODE_ENV=production`: la cookie `secure` se descarta y no hay login.

---

## 7. Despliegue paso a paso

```bash
# 1. Código
cd /opt && git clone https://github.com/FernandoDiazM5/GestionVPN-1.0.git
cd GestionVPN-1.0 && git checkout main   # (o dev) — ver §1

# 2. .env de producción (desde las plantillas reales del repo)
cp server/.env.production.example server/.env.production && nano server/.env.production   # §4.1
cp .env.prod.example .env && nano .env && chmod 600 .env                                   # DB_ROOT/APP_PASSWORD

# 2.b Certificado autofirmado (IP-only) — ./ssl lo monta el frontend (§6)
mkdir -p ssl && openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout ssl/privkey.pem -out ssl/fullchain.pem -subj "/CN=134.199.212.232"

# 3. Secretos (C1) — se colocan DENTRO del volumen /data
#    Instalación LIMPIA (sin datos a migrar): omite este paso, se autogeneran.
#    Migrando datos desde XAMPP: usa los MISMOS secretos que cifraron esos datos.
docker volume create gestionvpn-10_backend-data
docker run --rm -v gestionvpn-10_backend-data:/data -v "$PWD/secretos":/in alpine \
  sh -c 'cp /in/.db_secret /in/.jwt_secret /data/ && chmod 600 /data/.db_secret /data/.jwt_secret'
# (genera antes: openssl rand -hex 32 > secretos/.db_secret ; openssl rand -hex 64 > secretos/.jwt_secret
#  — o copia los reales de desarrollo si vas a importar la BD)

# 4. Build + up (entrypoint corre migraciones)
docker compose -f docker-compose.prod.yml up -d --build

# 5. Verificar
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

> El nombre del volumen (`gestionvpn-10_backend-data`) depende del nombre de carpeta del proyecto; confírmalo con `docker volume ls`.

### 7.b Migrar datos desde XAMPP (opcional)

```bash
# Local
mysqldump -u root vpn_manager --single-transaction --routines --triggers > vpn.sql
scp vpn.sql user@vps:/tmp/
# VPS
docker exec -i vpn-db mariadb -uroot -p"$DB_ROOT_PASSWORD" vpn_manager < /tmp/vpn.sql
```

> 🔴 Si importas datos, **los secretos del VPS deben ser idénticos** a los que cifraron las credenciales (MT_PASS, SSH, configs WG) en desarrollo. Si no, `ER_DECRYPT_FAILED`. Por eso en §7.3 copias los `.db_secret`/`.jwt_secret` reales al volumen `/data`.

---

## 8. Verificación post-despliegue

```bash
sudo wg show                                   # wg0 con handshake reciente
curl -s http://localhost:3001/api/health | jq  # mysql ok, routeros ok/stale/down
curl -sI https://tu-dominio.com/GestionVPN-1.0/   # HTTP/2 200
```

Luego en el panel: login admin → **Ajustes → Configurar router** (`MT_IP=192.168.21.1`, user/pass del MikroTik) → activar un nodo → confirmar que la pantalla "Acceso Restringido" desaparece (esto valida el pendiente de la sesión 2026-06-16).

---

## 11. Multi-usuario — veredicto real (REESCRITO)

Tu duda es la pregunta correcta. La respuesta tiene **dos planos** y son distintos:

### ✅ Plano de control (gestión) — SÍ es multi-usuario

Activar/desactivar túneles, gestionar peers WG, invitaciones, notificaciones, bot Telegram, acceso al panel: **funcionan perfecto** con el backend centralizado en el VPS.

- Al activar, `tunnelService` crea en el MikroTik una mangle **por usuario**: `src-address=<mgmt_ip_del_usuario>` → `new-routing-mark=<su VRF>`, con `comment=ACCESO-USER-<id>` (`tunnelProvisioner.js`). N usuarios = N reglas sin colisión.
- **Clave:** el tráfico VPN real de cada usuario sale **desde el dispositivo del usuario** (su propio peer WG), no desde el VPS. El VPS solo *escribe las reglas*. Por eso es genuinamente concurrente.

### 🔴 Plano de datos originado en el VPS (Escanear + Monitor AP) — NO es multi-usuario tal cual

Aquí está el problema que tu §11.4 daba por resuelto y **no lo está**:

- El **escaneo SSH a antenas** y el **polling de Monitor AP** los ejecuta el **backend** (`device.routes.js`, `ap.service.js`, `apPollJob.js`), no el navegador. Verifiqué que **no crean mangle propia**: dependen del enrutamiento por `src-address`.
- Todo ese SSH sale con **una única IP origen: `192.168.21.60` (el wg0 del VPS)** — sin importar qué moderador lo disparó.
- Las mangle por-usuario marcan el `mgmt_ip` **del moderador**, no el `192.168.21.60`. → El tráfico de escaneo del VPS **no coincide con ninguna mangle** → no se enruta al VRF → **no llega a la LAN remota**.
- Y aunque crees una mangle `src=192.168.21.60 → VRF-X`, **solo puede apuntar a UN VRF a la vez**. Como por diseño **varias LANs pueden solaparse entre nodos/VRF** (memoria `arquitectura-lan-compartida-vrf-mangle`), dos moderadores escaneando VRFs distintos con LAN `192.168.1.0/24` desde la misma IP origen son **indistinguibles** → colisión.

**En desarrollo no se notaba** porque el backend corría en tu PC, que *era* el único usuario y su `mgmt_ip` coincidía con la mangle activa. Al centralizar en el VPS, ese vínculo "1 backend = 1 identidad de red" se rompe.

#### Opciones para el escaneo/monitoreo multi-VRF desde el VPS

| Opción | Cómo | Trade-off |
|---|---|---|
| **A. Escaneo serializado + mangle dinámica del VPS** | Antes de cada scan, el backend crea `src=192.168.21.60 → VRF-objetivo`, escanea, y la borra. Un *lock* global serializa los scans. | Simple. **Pierde concurrencia**: un solo VRF escaneable a la vez en todo el sistema. Hay que implementarlo (hoy no existe). |
| **B. VRF agregado de escaneo** | Mangle permanente `src=192.168.21.60 → VRF-SCAN` con rutas a todas las torres. | Solo válido **si las LANs NO se solapan**. Tu arquitectura permite solape → riesgo de enrutar al destino equivocado. |
| **C. Agente de escaneo por-tenant** | Un proceso/peer WG con `mgmt_ip` propio por moderador que hace el SSH. | Multi-VRF real y concurrente, pero **cambio de arquitectura grande**. |
| **D. Aceptar el límite** | Documentar que el escaneo/Monitor AP es "uno a la vez" en el VPS; la gestión de túneles sí es multiusuario. | Cero código. Limita la operación. |

### ✅ DECISIÓN TOMADA — Opción C (IP de origen por moderador)

Confirmado con el usuario (2026-06-16):
- **Las LANs SÍ se repiten entre nodos** → descarta la regla por destino ("una IP llega a todo") y la Opción B.
- **Se requiere escaneo/monitoreo concurrente** de varios moderadores → descarta la Opción A (serializada).
- ⇒ **Opción C**: cada moderador tiene una IP de origen propia en el VPS; el SSH del escaneo sale atado a ella y la mangle por-origen del MikroTik lo separa por VRF. Funciona con LANs repetidas y en paralelo.

> Aclaración clave: **la scan-IP es 1 por MODERADOR (workspace), NO por miembro.** Los miembros no escanean ni usan Monitor AP (es feature de OWNER/CO_MOD); además, activar túnel es plano de control (el tráfico del miembro sale de SU dispositivo). El VPS nunca sourcea data-plane por un miembro.

#### Direccionamiento acordado (dentro de `192.168.21.0/24`, sin tocar enrutamiento)

```
192.168.21.0/24   → red de gestión existente
   .1             → MikroTik
   .60            → VPS (IP de control del panel)
   .2 – .59       → mgmt_ip de usuarios (moderadores + miembros), como hoy
   .200 – .230    → scan-IPs del VPS (1 por moderador) — pool Opción C
```
Se eligió un sub-rango dentro de `192.168.21.0/24` (no un `/24` aparte como `192.168.30.0/24`) **porque el camino de retorno desde los VRF a la red de gestión ya está wireado**; un `/24` nuevo exigiría rutas de retorno por VRF.

#### Implementación Opción C — 4 capas

1. **Red (VPS, 1 vez):** pool `.200–.230` en `wg0` vía `PostUp`/`PostDown` (`for i in $(seq 200 230); do ip addr add 192.168.21.$i/32 dev wg0; done`). Aditivo: no recrea el túnel ni las claves; la `.60` de control queda intacta.
2. **MikroTik (1 vez):** `allowed-address` del peer del VPS abarca el rango (`...,192.168.21.200/32,...` o directamente `192.168.21.0/24`).
3. **BD:** tabla `workspace_scan_ip(workspace_id, scan_ip)` (espejo de `mgmtIpRepo`). Alta de moderador = tomar la siguiente IP libre del pool → **solo una fila, sin tocar red**. Resolución server-side (anti-spoofing, como `getMgmtIpForUser`).
4. **Código (3 cambios):**
   - `sshExec` acepta `localAddress` opcional (`ubiquiti.service.js:127`) y se propaga a sus 3 llamadores: `scanner.worker.js` (vía `workerData`), `ap.service.js:170/211/217`, `device.routes.js:68`.
   - `addScanMangle` en `tunnelProvisioner.js` (variante de `addUserMangle` con `comment=SCAN-USER-<id>`, separada de la de túnel) + ciclo de vida en `scan.routes.js`: resolver `nodeLan → nodo → VRF`, resolver scan-IP, crear mangle, escanear, borrar. Esto vuelve el escaneo **autosuficiente** (ya no depende de un túnel activo).
   - Monitor AP (`apPollJob.js`): mangle **persistente** por moderador + `localAddress` por AP según el dueño (nodo→workspace).

#### Fases de entrega

- **Fase 0:** ✅ archivos de despliegue (ver banner arriba). Pendiente: merge `dev → main` + despliegue en el VPS.
- **Fase 1 (Opción C — Escanear):** ✅ **IMPLEMENTADA** (commits `9626777` + Fase 1b). Capas 3 y 4 del escaneo + 7 tests verdes (suite total 209). Capas 1-2 (red/MikroTik) son operativas en el VPS.
- **Fase 2 (Opción C — Monitor AP):** ✅ **IMPLEMENTADA**. `apPollJob` agrupa los APs por VRF, conmuta la mangle de la scan-IP por grupo y atea el SSH (`localAddress`); `lib/scanLock.js` serializa por workspace contra el escaneo interactivo (misma scan-IP = una mangle activa). +5 tests (suite total 214).

#### Estado de implementación Fase 1 (código en `dev`)

| Pieza | Archivo | Estado |
|---|---|---|
| `localAddress` en la sonda | `ubiquiti.service.js` (`sshExec`, `probeStatusCgi`, `getSSHBanner`, `probeUbiquiti`) + `scanner.worker.js` | ✅ aditivo, retrocompatible |
| Mangle de escaneo | `lib/tunnelProvisioner.js` (`addScanMangle`, `findScanMangleIds`, `scanMangleComment` con `comment=SCAN-WS-<ws>`) | ✅ |
| Ciclo de vida | `lib/scanMangle.js` (`setup`/`teardown`) + integración en `routes/nodes/scan.routes.js` | ✅ |
| Repo + tabla | `db/repos/scanIpRepo.js` + `sql/schema_scan_ip.sql` + `db/migrateScanIp.js` (`npm run migrate:scanip`, ya en `entrypoint.sh`) | ✅ |
| Tests | `test/unit/scanMangle.test.js` (7) | ✅ |

**Comportamiento:** si el workspace tiene scan-IP asignada → monta `src=scan-IP → VRF` y ata el SSH a esa IP; si **no** la tiene → escaneo legacy sin `localAddress` (preserva el dev local). Si la mangle falla, el escaneo devuelve `503` accionable en vez de "no encontró nada".

**Provisión operativa (por workspace, al alta del moderador):**
1. `scanIpRepo.allocate(workspaceId)` asigna la siguiente IP libre del pool `.200–.230` (idempotente).
2. Pool en `wg0` y `allowed-address` en MikroTik: ya cubiertos por la config 1-vez (capas 1-2).

> **Limitación conocida:** la scan-IP es **una por workspace** → si un mismo moderador tiene la misma LAN en dos nodos (VRF distintos), el escaneo de esa LAN usa el primer VRF que matchee. Moderadores **distintos** sí escanean en paralelo sin colisión.

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `server/.env.production` | 🆕 crear (§4.1) |
| `server/Dockerfile` | ✏️ reescribir — build monorepo + contracts (§4.2) |
| `vpn-manager/Dockerfile` | ✏️ reescribir — build monorepo (§4.3) |
| `vpn-manager/nginx.conf` | ✏️ HTTPS + SSE (§4.4) |
| `server/entrypoint.sh` | 🆕 crear — migraciones ordenadas (§4.9) |
| `server/index.js` | ✏️ `trust proxy` (§4.5, opcional) |
| `docker-compose.prod.yml` | 🆕 crear (§5) |
| `.env` (raíz) | 🆕 crear |
| `/etc/wireguard/wg0.conf` | 🆕 en VPS — incluye pool `.200–.230` (§3.2 + §11) |
| **Escaneo multi-VRF — Opción C (Fase 1)** | 🆕 `workspace_scan_ip` repo/tabla · `addScanMangle` + ciclo de vida en `scan.routes.js` · `localAddress` en `sshExec` + 3 llamadores (§11) |
| **Monitor AP — Opción C (Fase 2)** | ✏️ mangle persistente por dueño + `localAddress` en `apPollJob.js` (§11) |

> **Lo más crítico, en orden:** (1) WireGuard estable (`ping 192.168.21.1`), (2) secretos en `/data` (C1), (3) build de backend desde monorepo (C2), (4) HTTPS para que la cookie funcione, (5) Opción C para escaneo multi-moderador (§11).
