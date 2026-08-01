# Informe predespliegue — protección web

Fecha de auditoría: 2026-08-01 (America/Lima). Auditoría remota únicamente de
lectura. No se modificó el VPS.

## Decisión

**GO técnico condicionado a autorización explícita de despliegue.** El NO-GO
inicial por disco y respaldo fue resuelto en una fase separada y verificada. El
despliegue debe comenzar en modo observación con rollout 0%, confirmar que no
hay una operación de túnel en curso y seguir el runbook sin mezclar updates APT.

## Remediación verificada

- Dump `/root/pre-web-security-20260801T171455Z/vpn_manager.sql.gz`, gzip y
  SHA-256 válidos; permisos 700/600.
- Restauración en MariaDB aislada: 50 tablas, 5 usuarios, 3 workspaces y 14
  nodos, idénticos a la fuente; contenedor y volumen temporales retirados.
- Eliminados únicamente ocho tags de rollback anteriores; preservados current,
  `pre-e27184b` y `mariadb:11` con sus IDs originales.
- Build cache retirado: 2.366 GB. Disco: 87%/3.4 GiB → 43%/14 GiB.
- `.env.production.save.1` restringido de 644 a 600; ambas copias difieren del
  entorno activo y se conservaron para no perder información sin revisión.
- Cierre: tres contenedores activos, 0 reinicios, backend/DB healthy, HTTPS y
  health 200, cuatro servicios host activos, 8 jails, datos críticos intactos.

## Estado verificado

| Control | Resultado |
|---|---|
| Código local/remoto | `46c3f9c`, limpio y sincronizado con `origin/vps_prod` |
| Producción actual | `e27184b`; el objetivo es descendiente lineal, 10 commits adelante |
| HTTPS / health | HTTP 200; backend y MariaDB healthy, cero reinicios |
| Health interno | MySQL y SMTP `ok`; RouterOS `stale` (133 s durante la lectura) |
| Servicios host | Docker, Fail2ban, WireGuard y agente activos; cero unidades fallidas |
| Fail2ban | 8 jails actuales; 3 bans SSH, 6 reincidentes y 1 manual indefinido |
| Firewall | 22 limitado, 80/443 permitidos, 3001 denegado públicamente; 8788 sólo loopback |
| WireGuard | Activo, handshake reciente y redes esperadas presentes |
| Datos | 50 tablas, 5 usuarios, 3 workspaces y 14 nodos |
| Tablas nuevas | Aún ausentes, esperado porque fases 1–5 no están desplegadas |
| Variables web | No existen aún, por lo que no hay aplicación automática |
| TLS | SAN para `joinpoint.cloud`, `www` y nip.io; vence 2026-10-28; timer activo |
| Memoria | 1.9 GiB, 1.2 GiB disponible, sin swap |
| Disco | 87%, 3.4 GiB disponibles — bloqueante para construir |

## Hallazgos

### P0 — espacio insuficiente para un build seguro — RESUELTO

- `/var/lib/containerd` ocupa aproximadamente 15 GB.
- Docker informa 13 imágenes / 13.28 GB, con 9.738 GB recuperables.
- Build cache: 2.366 GB, con 2.332 GB recuperables.
- Deben preservarse imágenes actuales, MariaDB y un rollback reciente probado.
- No ejecutar el build antes de reducir uso y confirmar espacio final.

### P1 — respaldo de base desactualizado para este cambio — RESUELTO

El último dump verificado conservado es anterior a las fases nuevas. Crear un
dump nuevo, validar gzip/checksum y restaurarlo en una MariaDB temporal; comparar
50/50 tablas y conteos críticos antes de avanzar.

### P1 — copia de entorno con permisos amplios — RESUELTO

`server/.env.production.save.1` tiene modo 644. Está protegido actualmente por
el directorio `/root`, pero debe compararse sin imprimir secretos y luego
restringirse a 600 o retirarse de forma aprobada. Los otros archivos de entorno
y la clave TLS están en 600.

### P2 — salud RouterOS transitoriamente stale

No afecta HTTPS y WireGuard tenía handshake reciente. Antes del corte se debe
confirmar que no exista una operación de túnel en curso y repetir health; no es
motivo para tocar RouterOS durante este despliegue.

### P2 — actualizaciones del sistema separadas

APT simula 3 paquetes actualizables. No mezclarlos con este despliegue; tratarlos
en una ventana independiente para mantener un rollback claro.

## Orden recomendado sujeto a aprobación

1. Identificar y conservar explícitamente imágenes actuales y rollback
   `pre-e27184b`; retirar únicamente imágenes anteriores y build cache.
2. Confirmar uso de disco por debajo de 70% y al menos 7 GiB libres.
3. Corregir permiso de la copia `.env` o eliminarla tras comparación segura.
4. Crear y restaurar/verificar un dump nuevo; registrar checksum y conteos.
5. Respaldar agente, jails, Nginx, entorno y certificados sin exponer secretos.
6. Avanzar checkout a `46c3f9c` y mantener todas las variables en
   `observe` / rollout 0%.
7. Instalar y validar agente/jail, ejecutar migraciones aditivas y construir
   exclusivamente con `docker compose -f docker-compose.prod.yml`.
8. Verificar 54 tablas esperadas, conteos críticos, health, HTTPS, Nginx,
   Fail2ban, UFW, WireGuard, Telegram y cero reinicios.
9. Permanecer 24 h en observación antes de solicitar canary 10%.

## Rollback

Aplicar el kill switch (`observe`, rollout 0), restaurar checkout e imágenes
actuales respaldadas y reinstalar configuración host respaldada. Las cuatro
tablas nuevas son aditivas y no requieren borrarse para volver al código viejo.
Restaurar la base sólo ante corrupción demostrada y con autorización explícita.

Runbook detallado: `docs/security/WEB_SECURITY_ROLLOUT_RUNBOOK.md`.
