# 🟢🔵 05 — Diferencias entre Local (desarrollo) y VPS (producción)

> Matriz completa de **todo lo que cambia** entre el entorno local de desarrollo y el de producción en el VPS. Si algo se comporta distinto, empieza por aquí.
> Volver al [índice](./00_Indice_y_Trazabilidad.md). Detalle de cada entorno: [03](./03_Config_Servidor_VPN_MikroTik.md) (router, compartido), [04](./04_Config_VPS.md) (VPS).

---

## 1) Resumen ejecutivo

| | 🟢 **Local (dev)** | 🔵 **VPS (producción)** |
|---|---|---|
| Cómo corre | `npm run dev` (backend) + `vite` (frontend), nativo en Windows | Docker Compose (`docker-compose.prod.yml`): MariaDB + backend + nginx |
| Base de datos | **MySQL de XAMPP** (`127.0.0.1:3306`, root sin clave) | **MariaDB 11** en Docker (`127.0.0.1:3307`, usuario `vpn_app`) |
| Cómo alcanza el router | El WireGuard de **tu PC** (plano CLIENTES `10.13.250.x`) | El `wg0` del **VPS** (plano VPS `10.12.250.60`) |
| `MT_IP` (endpoint del Core) | `10.14.250.1` (ADMIN) o `10.13.250.1` | `10.12.250.1` (VPS) |
| URL del panel | `http://localhost:5173/GestionVPN-1.0/` | `https://134.199.212.232/GestionVPN-1.0/` |
| HTTPS | No (HTTP plano) | **Sí, obligatorio** (cookie `secure`) |
| Origen del escaneo | Tu IP WG local (modo `local` o legacy) | scan-IP del workspace (Opción C, `10.11.252.x`) |
| Correo (SMTP) | Gmail directo, o "modo dev" (imprime en consola) | Relay alterno (DO bloquea 25/465/587) |
| Usuarios iniciales | `seed:roles` opcional (`admin/admin`) | Setup Inicial (BD vacía) |

---

## 2) Configuración (`.env` y secretos)

| Aspecto | 🟢 Local | 🔵 VPS |
|---|---|---|
| Archivo `.env` | raíz del repo (`server/index.js` lo carga por ruta absoluta, §4.21) | `.env` (Compose) + `server/.env.production` (`env_file`) |
| `NODE_ENV` | `development` | `production` |
| `DATA_DIR` | `.` (junto al código) | `/data` (volumen `backend-data`) |
| Secretos `.db_secret`/`.jwt_secret` | en `server/` (autogenerados) | en el volumen `/data` (autogenerados o copiados si migras datos) |
| Cookie de sesión | `secure=false` (HTTP ok) | `secure=true` (exige HTTPS) |
| CORS | localhost (`5173`, etc.) | `https://134.199.212.232` |
| `MYSQL_*` | XAMPP: `3306`, `root`, sin clave | MariaDB: `3307`, `vpn_app`, con clave |

---

## 3) Red y conectividad al MikroTik

| Aspecto | 🟢 Local | 🔵 VPS |
|---|---|---|
| Interfaz WG | cliente WireGuard de tu PC | `wg0` del SO (host) |
| Plano del operador | CLIENTES `10.13.250.x` (moderador) / ADMIN `10.14.250.x` (admin) | VPS `10.12.250.60` |
| `MT_IP` en `app_settings` | `10.14.250.1` / `10.13.250.1` | `10.12.250.1` |
| `/ip service api address=` | debe incluir tu plano (`10.13`/`10.14`) | debe incluir `10.12.250.0/24` |
| Peer en el Core | tu peer humano (CLIENTES/ADMIN) | peer `VPS-MGMT` con `allowed-address=10.12.250.60/32,10.11.252.0/24` |

> El **router es el mismo** en ambos entornos (es compartido). Lo que cambia es **desde dónde** lo alcanzas y con qué `MT_IP`.

---

## 4) Escaneo y Monitor AP (la diferencia más sutil)

| Aspecto | 🟢 Local | 🔵 VPS |
|---|---|---|
| Quién origina el SSH/probe | tu PC | el backend en el VPS |
| IP de origen | tu IP WG local | scan-IP del workspace (`10.11.252.x`) |
| Modo | `local` (atado a `local_scan_ip`) o legacy (sin `localAddress`) | Opción C (mangle `SCAN-WS-<ws>` + `localAddress`) |
| Concurrencia multi-moderador | N/A (un solo usuario) | sí, workspaces distintos en paralelo |
| Requisito de red | tu WG alcanza la torre | `wg0` rutea la LAN (`AllowedIPs`, autosync §4.27) |

> En local "funcionaba" porque tu PC **era** el único usuario y su IP coincidía con la mangle activa. Al centralizar en el VPS, ese vínculo "1 backend = 1 identidad" se rompe → por eso existe la **Opción C** (scan-IP por workspace).

**Modo local de escaneo (1 equipo):** `app_settings.scan_mode='local'` + `local_scan_ip` (la IP WG de gestión de **ese** equipo). Si la IP no está viva → `409 LOCAL_SCAN_IP_STALE` (`lib/wgDetect.js`). Solo aplica en local.

---

## 5) Arranque y migraciones

| Aspecto | 🟢 Local | 🔵 VPS |
|---|---|---|
| Migraciones | manuales la 1ª vez (`npm run init:multiuser`, etc.) | automáticas en `entrypoint.sh` al arrancar el contenedor |
| Siembra de usuarios | `npm run seed:roles` (opcional, `admin/admin`) | apagada → Setup Inicial (BD vacía) |
| Reinicio del backend | `npm run dev` (nodemon) | `docker compose ... up -d` |
| Logs | consola | `docker compose ... logs -f backend` |

---

## 6) Jobs, correo y bot

| Aspecto | 🟢 Local | 🔵 VPS |
|---|---|---|
| Jobs de fondo | corren si los toggles están on; suele bastar dejarlos | `EXPIRATION_JOB_ENABLED`/`MONITORING_ENABLED`/`AP_POLL_ENABLED=true` |
| SMTP | Gmail directo (`smtp.gmail.com:587`) o modo dev (consola) | **DO bloquea 25/465/587** → relay alterno; el alta no depende del correo |
| Telegram | apaga el bot local si el token también corre en prod (409) | un solo poller por token |
| Métricas `/metrics` | loopback | loopback (`METRICS_ALLOW_REMOTE=0`) |

---

## 7) Despliegue / actualización de código

| Aspecto | 🟢 Local | 🔵 VPS |
|---|---|---|
| Traer cambios | `git pull` normal | **`git fetch && git reset --hard origin/main`** (NUNCA `git pull` — historial purgado) |
| Aplicar | reiniciar `npm run dev` | `docker compose -f docker-compose.prod.yml up -d --build` |
| Datos entre deploys | tu BD local | los volúmenes `db-data`/`backend-data` **sobreviven** (migraciones sin DROP) |

---

## 8) Lo que es IDÉNTICO en ambos entornos

Para evitar confusiones, esto **no** cambia:
- El **MikroTik core** (es compartido): mismo router, mismo plano IP `10.x`, mismas VRF/mangle/address-lists.
- El **modelo de roles** (Admin/OWNER/MEMBER) y las reglas §4.
- Los **contratos** (`@gestionvpn/contracts`) y la lógica de negocio.
- El **plano de gestión** y las IPs de nodo (`10.11.250/251.<ND>`).
- El **script del CPE** que recibe cada torre.

---

## 9) Checklist "¿por qué se comporta distinto?"

| Síntoma | Causa probable según entorno |
|---|---|
| No hay sesión tras login | 🔵 estás por HTTP (la cookie `secure` se descarta) → usa HTTPS |
| El panel "se cuelga" al tocar el router | `MT_IP` equivocado para el entorno, o el plano no está en `/ip service api address=` (§4.18) |
| Escaneo da 0 | 🟢 `local_scan_ip` no viva · 🔵 `wg0` no rutea la LAN (`AllowedIPs`/autosync §4.27) |
| Correos no salen | 🟢 SMTP en modo dev · 🔵 DO bloquea SMTP → relay alterno |
| `ER_DECRYPT_FAILED` | secretos `.db_secret`/`.jwt_secret` distintos a los que cifraron los datos (típico al migrar a 🔵) |
| 504 en `/api` | 🔵 `ufw deny 3001` bloqueó también el bridge de Docker (§gotcha 1) |

> Siguiente: [06 — Guía de replicación desde cero](./06_Guia_Replicacion.md).
