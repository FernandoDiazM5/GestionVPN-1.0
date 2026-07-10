# 🛠️ 06 — Guía de replicación desde cero

> Tutorial paso a paso para **levantar todo el sistema** — router, panel local y producción en VPS — partiendo de cero. Sigue el orden; cada bloque es un hito verificable.
> Detalle de cada pieza: [03 router](./03_Config_Servidor_VPN_MikroTik.md) · [04 VPS](./04_Config_VPS.md) · [05 local vs VPS](./05_Local_vs_VPS.md). Volver al [índice](./00_Indice_y_Trazabilidad.md).

---

## Mapa del recorrido

```
A. Prepara el MikroTik core (1 vez, compartido)
   └─ B. Desarrollo local (entender + probar)
        └─ C. Producción en el VPS
             └─ D. Puesta en marcha funcional (crear admin, moderador, nodo)
```

> **Requisitos previos:** acceso al MikroTik core (Winbox/SSH), un VPS Ubuntu, Node 22+, Docker, `wireguard-tools`, y el repo `GestionVPN-1.0`.

---

## A) Preparar el MikroTik core (1 vez)

> Esto es **compartido** por local y VPS. Hazlo una sola vez. Detalle: [doc 03](./03_Config_Servidor_VPN_MikroTik.md).

1. **Base de gestión.** Pega `server/scripts/setup-mgmt-net-consolidado.rsc` en el router (idempotente). Crea las 3 interfaces WG de gestión (`VPN-WG-VPS/CLIENTES/ADMIN`), sus IPs, el firewall UDP `13232-13234`, los address-lists y el peer del VPS.
2. **Allow-list de la API.** Asegura que `/ip service api` y `api-ssl` incluyan el plano `10.x` (FASE 2b de `migrate-mgmt-net.rsc`):
   ```routeros
   /ip service set api     address=10.12.250.0/24,10.13.250.0/24,10.14.250.0/24
   /ip service set api-ssl address=10.12.250.0/24,10.13.250.0/24,10.14.250.0/24
   ```
3. **Config inicial del modelo VPN** (si no existe): perfil PPP `PROF-VPN-TOWERS` (`local-address=10.11.251.1`), masquerade `out-interface-list=LIST-VPN-SSTP`, regla WG global para `13300-13400`.
4. **Anota las claves públicas** que imprime el script (`VPN-WG-VPS/CLIENTES/ADMIN`): las necesitarás para los `.conf` de peers.

> ✅ **Hito A:** el router tiene las 3 interfaces de gestión arriba y la API accesible desde el plano `10.x`. Lo que falte (VRF/nodos) lo creará el panel.

---

## B) Desarrollo local 🟢

> Objetivo: correr el panel en tu PC contra el router. Detalle de diferencias en [doc 05](./05_Local_vs_VPS.md).

1. **WireGuard de tu PC.** Crea tu peer de gestión (plano CLIENTES `10.13.250.x` si serás moderador, o ADMIN `10.14.250.x` si admin) y verifica:
   ```bash
   ping 10.14.250.1        # o 10.13.250.1 — endpoint del Core
   ```
2. **MySQL (XAMPP).** Arranca MySQL en XAMPP (`127.0.0.1:3306`, root sin clave por defecto).
3. **Dependencias + contratos.**
   ```bash
   npm install
   npm run build:contracts
   ```
4. **`.env` en la raíz** (copia de `server/.env.example`, valores de dev). Mínimo: `MYSQL_*` de XAMPP, `NODE_ENV=development`.
5. **Migraciones (1ª vez):**
   ```bash
   cd server && npm run init:multiuser
   # opcional: npm run seed:roles   (crea admin/admin + moderador demo)
   ```
6. **Arranca backend y frontend** (dos terminales):
   ```bash
   cd server && npm run dev          # debe imprimir "[ROUTEROS] Parche !empty aplicado..."
   cd vpn-manager && npm run dev      # http://localhost:5173/GestionVPN-1.0/
   ```
7. **Configura el router en el panel:** login → `Ajustes → Configurar router` → `MT_IP=10.14.250.1` (o `10.13.250.1`), usuario/clave del MikroTik.

> ✅ **Hito B:** el panel local lista nodos y puedes activar un túnel sin que aparezca "Acceso Restringido".
> Problemas típicos: 401 de sesión vieja → F12 → *Clear site data*. Puerto 3001 ocupado → `Get-NetTCPConnection -LocalPort 3001` → `Stop-Process`.

---

## C) Producción en el VPS 🔵

> Detalle completo: [doc 04](./04_Config_VPS.md) y [`DESPLIEGUE_VPS.md`](../../DESPLIEGUE_VPS.md).

### C.1 Túnel `wg0` (lo más crítico)
1. Genera el par de llaves del VPS, registra su **pública** en el peer del Core (`VPN-WG-VPS`, `allowed-address=10.12.250.60/32,10.11.252.0/24`).
2. Crea `/etc/wireguard/wg0.conf` (ver [doc 04 §2](./04_Config_VPS.md)): `Address=10.12.250.60/32`, peer al Core (`Endpoint=213.173.36.232:13232`), `AllowedIPs` con los planos `10.x`, y el `PostUp/PostDown` del scan-pool.
3. Levanta y persiste:
   ```bash
   sudo wg-quick up wg0 && sudo systemctl enable wg-quick@wg0
   ping -c3 10.12.250.1 && ip route get 10.12.250.1 && nc -zv 10.12.250.1 8728
   ```

### C.2 Código + entorno
```bash
cd /root && git clone https://github.com/FernandoDiazM5/GestionVPN-1.0.git
cd GestionVPN-1.0
cp server/.env.production.example server/.env.production && nano server/.env.production   # doc 04 §4.2
cp .env.prod.example .env && nano .env && chmod 600 .env                                   # DB_ROOT/APP_PASSWORD
mkdir -p ssl && openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout ssl/privkey.pem -out ssl/fullchain.pem -subj "/CN=134.199.212.232"               # cert autofirmado
```

### C.3 Secretos
- **Instalación limpia:** omite — se autogeneran.
- **Migrando datos de local:** copia los **mismos** `.db_secret`/`.jwt_secret` al volumen `backend-data` (ver [doc 04 §5](./04_Config_VPS.md)) y luego importa el dump.

### C.4 Autosync `wg0` (1 vez)
Instala las unidades systemd de `deploy/wg0-autosync/` (ver [doc 04 §7](./04_Config_VPS.md)).

### C.5 Build + up
```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend     # debe terminar "Migraciones OK. Iniciando servidor..."
```

### C.6 Firewall (orden importa)
```bash
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 13232/udp
ufw insert 1 allow from 172.16.0.0/12 to any port 3001 proto tcp   # bridge de Docker
ufw deny 3001/tcp                                                   # ALLOW arriba del DENY
ufw deny 3307/tcp
ufw enable && ufw status numbered
```

> ✅ **Hito C:** `curl -s http://localhost:3001/api/health | jq` da `mysql ok` y la web responde en `https://134.199.212.232/GestionVPN-1.0/`.

---

## D) Puesta en marcha funcional

1. **Crea el Administrador.** Abre el panel (BD vacía → **Setup Inicial**) y crea el admin con su propia contraseña.
2. **Configura el router.** Login admin → `Ajustes → Configurar router` → `MT_IP=10.12.250.1` (desde el VPS), usuario/clave del MikroTik. (`MT_*` se guardan cifrados en `app_settings`, no en `.env`.)
3. **Crea un moderador.** `Moderadores → Nuevo Moderador` → comparte el enlace de invitación (el correo puede no salir en el VPS). El moderador define su clave + su WireGuard de gestión. Su workspace recibe una scan-IP automáticamente.
4. **Da de alta un nodo.** Como moderador: `Nodos → Nuevo Nodo` → elige protocolo (WG o SSTP) y la LAN de la torre → el panel devuelve **un script** para pegar en el CPE. El `wg0` aprende la LAN solo (autosync).
5. **Activa el túnel y escanea.** Activa el túnel del nodo y corre un escaneo de su LAN → deberían aparecer los equipos Ubiquiti airOS.

> ✅ **Hito D:** un moderador real activa un túnel y escanea su torre desde el VPS, en paralelo con otros workspaces.

---

## E) Verificación end-to-end (checklist)

| Capa | Comprobación |
|---|---|
| Router | `setup-mgmt-net-consolidado.rsc` aplicado · API accesible desde `10.x` |
| `wg0` (VPS) | `wg show` con handshake · `ping 10.12.250.1` · `nc -zv 10.12.250.1 8728` |
| Backend | `/api/health` → mysql ok · logs sin errores fatales |
| Frontend | `https://<ip>/GestionVPN-1.0/` carga · login funciona (HTTPS) |
| Sesión | tras login hay cookie (si no → revisa HTTPS) |
| Provisión | alta de nodo devuelve script · `npm run check:scanroute` OK |
| Escaneo | `cat /opt/wg0-autosync/allowedips.desired` lista la LAN · `ip route get <LAN>` = `dev wg0` · escaneo > 0 |
| Aislamiento | dos workspaces escanean en paralelo sin colisión |

---

## F) Operación y mantenimiento

- **Actualizar código (VPS):** `git fetch origin && git reset --hard origin/main` (NUNCA `git pull`) → `docker compose -f docker-compose.prod.yml up -d --build`.
- **Diagnóstico read-only:** `docker exec vpn-backend npm run diagnose` · `... check:scanroute` · `... sync:wg0`.
- **Backup:** `mysqldump` + copia de los secretos del volumen `backend-data`.
- **Salud:** `/api/health` + `docker compose ... logs -f backend`.
- **Seguridad:** rotar credenciales que vivieron en el viejo `database.sqlite`/chat; mantener cerrados `3001`/`3307` al exterior.

---

## G) Errores comunes (y dónde mirar)

| Error | Causa | Solución |
|---|---|---|
| Panel "Acceso Restringido" persistente | `MT_IP` mal o API no accesible | Revisa `MT_IP` por entorno + `/ip service api address=` (§4.18) |
| Login sin sesión | HTTP en prod (cookie `secure`) | Usa HTTPS |
| `ER_DECRYPT_FAILED` | secretos distintos a los que cifraron los datos | Copia los `.db_secret`/`.jwt_secret` correctos al volumen |
| 504 en `/api` | `ufw deny 3001` bloqueó el bridge | `ufw insert 1 allow from 172.16.0.0/12 ... 3001` |
| Escaneo da 0 | `wg0` no rutea la LAN | Verifica `AllowedIPs`/autosync (§4.27); `ip route get <LAN>` |
| Correo no sale | DO bloquea SMTP | Relay alterno; usa el enlace de invitación manual |
| Telegram 409 | dos pollers, mismo token | Apaga el bot local o usa otro token |

---

> Fin del manual. Para el *porqué* de cada regla, ver [`HANDOFF.md`](../../HANDOFF.md) §4. Para diagramas, [`docs/arquitectura/`](../arquitectura/README.md).
