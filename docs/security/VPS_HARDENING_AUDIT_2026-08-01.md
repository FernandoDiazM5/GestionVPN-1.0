# Cierre de endurecimiento y auditoría de producción

Fecha: 2026-08-01 (America/Lima)  
Dominio: `joinpoint.cloud`  
Producción: `f9091e9`  
Alcance: fases 2 a 9. La vinculación de Telegram (fase 1) fue excluida expresamente por el propietario.

## Dictamen ejecutivo

**Aprobado para operación.** El VPS, el backend, el frontend, la base de datos y
las protecciones permanecen operativos después del despliegue y del mantenimiento.
No hay avisos altos o críticos de npm, actualizaciones APT pendientes, unidades
fallidas, reinicio del sistema pendiente ni errores recientes de nivel crítico.

Durante la auditoría se detectó que un reinicio completo de Docker podía arrancar
el backend antes de que MariaDB aceptara conexiones. El servicio se recuperaba por
su política de reinicio, pero generaba intentos innecesarios. Se añadió una espera
TCP limitada a 120 segundos antes de las migraciones, con pruebas de éxito y
timeout. El backend corregido arrancó saludable y con cero reinicios.

## Comparación antes y después

| Área | Antes | Cierre |
|---|---|---|
| Memoria de respaldo | Sin swap | `/swapfile` persistente de 1 GiB, uso normal de 9 MiB |
| Dependencias npm | 11 avisos: 3 altos, 7 moderados, 1 bajo | 7 moderados, 0 altos/críticos/bajos |
| Auditoría visual | 6 observaciones | 0 observaciones en 304 archivos |
| Cabeceras del shell | Sin CSP ni `Referrer-Policy` | CSP en observación y `Referrer-Policy: no-referrer` |
| Semgrep | Inconcluso por timeout | Perfiles reproducibles completados, 0 hallazgos en reglas ejecutadas |
| Paquetes del VPS | 3 actualizaciones Docker pendientes | Docker 29.7.1 y 0 actualizaciones APT pendientes |
| Disco tras compilar | 75% usado | 67% usado; 4.27 GB de caché retirados |
| Arranque backend tras Docker | 4 reintentos transitorios | Espera a MariaDB; despliegue final con 0 reinicios |

## Cambios desplegados

- `e314638`: actualización segura de dependencias, migración a React Router 8,
  correcciones visuales, cabeceras web y ejecución reproducible de Semgrep.
- `f9091e9`: espera explícita de MariaDB antes de ejecutar migraciones.
- React y React DOM quedaron en 19.2.8; React Router en 8.3.0.
- Se retiró la dependencia directa de `uuid` del backend porque el código usa
  `crypto.randomUUID()`.
- `body-parser` y `brace-expansion` se actualizaron a versiones corregidas.
- El script anti-parpadeo de tema dejó de ser código inline y se sirve como
  `/theme-init.js`.
- Nginx entrega HSTS, protección de frame, `nosniff`, `Referrer-Policy` y una
  política CSP compatible con los orígenes actuales de Google/Firebase.
- La CSP permanece como `Content-Security-Policy-Report-Only` para detectar
  incompatibilidades reales antes de convertirla en bloqueo obligatorio.

## Integridad y rollback

- Respaldo: `/root/pre-maintenance-20260801T195018`, modo 700.
- Dump comprimido validado con `gzip -t` y checksum conservado.
- Restauración aislada verificada: 54 tablas, 5 usuarios, 3 workspaces y 14 nodos.
- Producción conserva exactamente los mismos conteos después del despliegue.
- Rollbacks recientes conservados:
  - `gestionvpn-10-backend:pre-maintenance-20260801T195018`
  - `gestionvpn-10-frontend:pre-maintenance-20260801T195018`
  - `gestionvpn-10-backend:pre-db-wait-f9091e9`
- La caché de construcción fue retirada sin borrar imágenes etiquetadas ni
  volúmenes de datos.

## Estado del VPS y red

- Kernel 5.15.0-186; no se requiere reinicio.
- Docker 29.7.1 y Docker Compose 5.3.1.
- SSH, Fail2ban, Docker, WireGuard y agente de seguridad: activos y habilitados.
- `sshd -t`, configuración de Fail2ban y `nginx -t`: correctos.
- UFW mantiene entrada denegada por defecto; expone 22 limitado y 80/443.
- El puerto 3001 está permitido sólo desde `172.16.0.0/12` y denegado al resto;
  MariaDB está publicada únicamente en `127.0.0.1:3307` y el agente escucha en
  `127.0.0.1:8788`.
- WireGuard `wg0` está activo en UDP 55626, con un peer y handshake reciente.
- Fail2ban mantiene 15 jails; `sshd` registra 4,720 fallos acumulados y 119 bans
  históricos en la comprobación final.
- Certbot está activo y programado. El certificado incluye `joinpoint.cloud`,
  `www.joinpoint.cloud` y el nombre técnico nip.io; vence el 2026-10-28.
- No hubo errores systemd de prioridad `err` en los últimos diez minutos.

## Backend, frontend y disponibilidad

- `vpn-db`: healthy, 0 reinicios.
- `vpn-backend`: healthy, 0 reinicios después de la corrección de arranque.
- `vpn-frontend`: activo, 0 reinicios; Nginx no define healthcheck propio.
- Raíz, ruta histórica `/GestionVPN-1.0/` y ruta de workspace responden 200.
- `/api/health` cerró en estado `ok`: MySQL, RouterOS y SMTP correctos.
- El certificado y las cabeceras se comprobaron desde el dominio público.
- La protección web sigue al 100%, con bloqueos temporales e indefinidos activos.

## Validación de código

- Backend: 103 archivos y 615 pruebas aprobadas.
- Frontend: 64 archivos y 216 pruebas aprobadas.
- Agente de seguridad: 6 pruebas aprobadas.
- `check:all`, TypeScript, ESLint, inventario de rutas y auditoría visual: correctos.
- Reglas Semgrep locales: 500 objetivos, 2 reglas, 0 hallazgos.
- Perfil JavaScript: 177 archivos, 68 reglas, 0 hallazgos.
- Perfil de auditoría de seguridad: 503 archivos, 23 reglas efectivamente
  aplicables, 0 hallazgos y aproximadamente 100% de líneas parseadas.
- Antes del último ajuste también terminaron los perfiles TypeScript, React y
  secretos con 0 hallazgos. Un resultado de Semgrep sólo cubre las reglas
  seleccionadas y no equivale a una prueba absoluta de ausencia de defectos.

## Riesgo residual conocido

1. **Telegram excluido:** todavía se requiere que el propietario vincule una
   cuenta `platform_admin` y confirme una alerta real. Esta fue la fase 1 omitida.
2. **Siete avisos npm moderados:** todos proceden de `uuid <11.1.1` a través de
   ExcelJS y dependencias opcionales de Google/Firebase. No existe una remediación
   no disruptiva en el árbol actual; `npm audit fix --force` propone un cambio
   incompatible. No quedan avisos altos ni críticos.
3. **CSP en observación:** revisar el login local/Google y navegación autenticada
   antes de convertir `Report-Only` en una política obligatoria.
4. **Retención de rollbacks:** las imágenes etiquetadas antiguas ocupan espacio
   recuperable, pero se conservaron deliberadamente. El disco tiene 8.1 GB libres,
   por lo que no existe presión inmediata.

## Comparación con el handoff

| Pendiente anterior | Evidencia de cierre | Estado |
|---|---|---|
| Swap para VPS de 1.9 GiB | 1 GiB persistente y operativo | Cumplido |
| 3 avisos altos npm | 0 altos/críticos después de actualización probada | Cumplido |
| CSP y Referrer-Policy | Cabeceras públicas verificadas | Cumplido por etapas |
| 3 paquetes APT | 0 paquetes pendientes; Docker 29.7.1 | Cumplido |
| 6 observaciones visuales | Auditoría de 304 archivos con 0 | Cumplido |
| Semgrep inconcluso | Perfiles locales y oficiales completados | Cumplido |
| Datos y rollback | Dump restaurado y conteos 54/5/3/14 | Cumplido |
| Telegram del administrador | Excluido por decisión del propietario | Pendiente humano |

## Conclusión

Las fases 2 a 9 quedaron implementadas, desplegadas y verificadas. Producción
termina en `f9091e9`, con disponibilidad normal, datos preservados y controles de
seguridad activos. No hay un bloqueo técnico pendiente. La única fase omitida es
la vinculación humana de Telegram; la conversión de CSP a modo obligatorio debe
hacerse después de validar los flujos autenticados reales.
