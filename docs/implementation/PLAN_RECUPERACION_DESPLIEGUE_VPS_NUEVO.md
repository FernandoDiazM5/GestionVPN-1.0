# Plan de recuperación y despliegue en un VPS nuevo

## Propósito

Runbook para reconstruir Joinpoint/GestionVPN en una Gota nueva, validar la instalación y cambiar DNS sin perder trazabilidad. Está pensado para una base de datos nueva y vacía; si se necesita conservar datos, debe añadirse un respaldo y una restauración verificada antes del cambio DNS.

## Reglas de integridad

- No destruir el VPS anterior hasta validar el nuevo durante una ventana de observación.
- No ejecutar `docker compose down -v`: elimina los datos de MariaDB.
- Generar contraseñas nuevas para MariaDB y claves HMAC; nunca copiarlas al repositorio ni al chat.
- MikroWisp y Telegram se configuran después desde la web. MikroWisp sólo usa el catálogo autorizado `GetRouters` y opera en modo de lectura.
- WireGuard sólo guarda la clave pública del VPS; nunca guardar claves privadas en la aplicación.
- Crear un respaldo antes de cada cambio de esquema o despliegue de una versión nueva.

## Requisitos previos

- Droplet Ubuntu 22.04/24.04, IP pública fija, al menos 2 vCPU, 4 GB RAM y 25 GB libres.
- Acceso SSH por clave, control de DNS del dominio y un correo de administración.
- Firewall del proveedor permitiendo TCP 22 (restringido a la administración), TCP 80 y TCP 443.
- Repositorio y rama/commit de despliegue identificados.

## Procedimiento reproducible

### 1. Preparar el servidor

Instalar Docker Engine y Docker Compose v2, crear `/opt/gestionvpn` y `/etc/gestionvpn`, comprobar hora, disco y memoria. Mantener el usuario de administración con clave SSH; usar `root` sólo durante la recuperación inicial y crear después un usuario sudo.

### 2. Obtener el código

Clonar el repositorio en `/opt/gestionvpn/GestionVPN-1.0` y fijar el commit aprobado. No desplegar una rama distinta de la documentada en `HANDOFF.md`.

### 3. Crear configuración sin secretos en el repositorio

Crear `.env` a partir de `.env.prod.example` y `server/.env.production` con:

- contraseñas aleatorias para `DB_ROOT_PASSWORD`, `DB_APP_PASSWORD` y `AUTH_RATE_HMAC_KEY`;
- `VPS_PUBLIC_IP` y `APP_BASE_URL=https://<dominio>/`;
- `CORS_ORIGINS` limitado a los dominios reales;
- `TELEGRAM_BOT_ENABLED=false`, `GEMINI_AI_ENABLED=false` y Firebase deshabilitado hasta configurarlos;
- `WG_PUBLIC_IP` sólo si corresponde al router público del Core.

Guardar Firebase, si se usa, únicamente en `/etc/gestionvpn/firebase-admin.json` con permisos 600. El usuario y contraseña iniciales se introducen una sola vez mediante el flujo de configuración de la aplicación y se cambian inmediatamente.

### 4. Arrancar por etapas

Usar el archivo `docker-compose.prod.yml`:

1. `docker compose ... build backend` y verificar que la imagen termina sin errores.
2. Levantar MariaDB y esperar `healthy`.
3. Levantar backend y esperar `/api/health` con MariaDB `ok`.
4. Levantar frontend y comprobar HTTP local.

Las migraciones son idempotentes. Confirmar que las tablas se crean y que no hay errores de migración en los logs.

### 5. Validación antes de DNS

- `docker compose ps`: db, backend y frontend `healthy/up`, sin reinicios.
- `/api/health`: estado correcto y sin secretos en la respuesta.
- Inicio de sesión inválido devuelve 401.
- La aplicación carga por HTTP local y sólo expone el backend en localhost/host-network según el compose.
- Revisar disco, memoria, hora, logs recientes y respaldos.

### 6. TLS y DNS

Antes del certificado, usar temporalmente un certificado autofirmado sólo para pruebas internas. Crear registros A de `@` y `www` al nuevo VPS, esperar propagación y emitir Let’s Encrypt. Activar renovación y un hook que copie `fullchain.pem`/`privkey.pem` al volumen SSL y reinicie sólo el frontend. Verificar el certificado real y los dos nombres antes de retirar el VPS anterior.

### 7. Configuración funcional

1. Crear el administrador y cambiar la contraseña temporal.
2. Configurar MikroWisp desde Integraciones: URL, token cifrado y sincronización de `GetRouters`.
3. Configurar Telegram con el bot del workspace, vincular el supergrupo foro y comprobar OWNER/autorizaciones.
4. Configurar la clave pública WireGuard del VPS en Configuración; crear el peer en el Core por el procedimiento de red y verificar handshake.
5. Probar comandos de sitio y consultas de cliente en un grupo piloto antes de habilitar grupos adicionales.

### 8. Cierre y operación

Guardar fecha, commit, IP, resultado de pruebas y ubicación del respaldo en `HANDOFF.md` y `HANDOFF_LOG.md`. Programar respaldo diario de MariaDB, revisión de disco semanal y rotación de secretos. Mantener el VPS anterior como rollback hasta completar la ventana de observación.

## Rollback

Ante un fallo, conservar logs y el respaldo, detener sólo el servicio afectado, volver al tag/imagen anterior y restaurar la base en una instancia aislada para verificarla. Si el fallo es de aplicación, revertir DNS al VPS anterior; si es de datos, no sobrescribir el volumen sin una copia adicional.

## Diagnóstico rápido

- **SSH rechazado:** validar clave, usuario, firewall y consola de recuperación; no desactivar SSH por contraseña sin una clave funcional.
- **Certificado inválido:** revisar DNS A/AAAA, puertos 80/443 y el hook de renovación.
- **Backend no saludable:** revisar `vpn-db` primero, luego variables de conexión y logs de migración.
- **Telegram/MikroWisp sin datos:** confirmar que la integración fue guardada desde la web; no copiar tokens desde logs.
- **WireGuard sin tráfico:** comprobar clave pública, AllowedIPs, ruta al Core y handshake antes de tocar reglas.

## Estado de la instalación actual

- VPS nuevo: `143.244.169.142`, hostname `vpn-join`.
- Dominio: `joinpoint.cloud` y `www.joinpoint.cloud`, DNS y Let’s Encrypt verificados.
- Runtime desplegado: `a8bcf4f`; base MariaDB nueva y vacía.
- Servicios: `vpn-db`, `vpn-backend`, `vpn-frontend` saludables; `/api/health` 200.
- Pendiente funcional: crear el administrador e introducir MikroWisp, Telegram y WireGuard desde la interfaz.

