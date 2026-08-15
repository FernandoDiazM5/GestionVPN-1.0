# Preparación WireGuard del VPS para `10.12.248.0/22`

Fecha: 2026-08-15 19:41 UTC
Estado: migración productiva completada; la red anterior fue retirada después
de limpiar y verificar dependencias.

## Cambio aplicado

- Se conservó la IP de control `10.12.250.60/32`, ya correcta para el `/24` VPS.
- Se añadieron `10.12.248.2–10.12.248.50/32` a `wg0` para el nuevo pool de escaneo.
- Se añadió `10.12.248.0/22` a los `AllowedIPs` del único peer del Core.
- Se instaló la ruta `10.12.248.0/22 dev wg0`.
- Se persistieron `PostUp`/`PostDown` para recrear/retirar el nuevo pool al arrancar.
- El pool anterior `10.11.252.2–50` se conserva temporalmente mientras existan sitios y software activo que lo utilicen.

Script idempotente: `deploy/wg0-supernet-stage.sh`.

## Respaldo y rollback

Respaldo root-only:

`/root/wg0-before-management-supernet-20260815T194104Z.conf`

Para rollback se restaura ese archivo, se valida con `wg-quick strip wg0`, se
retiran las direcciones `10.12.248.2–50/32` y la ruta `/22`, y se recarga con
`wg syncconf`. No reiniciar `wg0` sin una ventana aprobada.

## Verificación

- 49 direcciones nuevas presentes en `wg0`.
- Ruta `/22` presente y rutas históricas `/24` conservadas.
- `wg-quick@wg0`: activo.
- Handshake observado a 18 segundos.
- Ping al gateway Core: 3/3, 0 % de pérdida.
- HTTPS respondió y backend/MariaDB permanecieron saludables.
- `wg0.conf` y respaldo: permisos `600`.

## Pendiente para completar la migración

1. Desplegar el software que persiste/activa `management_supernet`.
2. Configurar el peer del VPS en el Core para aceptar `10.12.248.0/24` como origen de escaneo (el aprovisionador nuevo lo genera).
3. Migrar `workspace_scan_ip` dentro de la transacción prevista.
4. Ejecutar un escaneo canary desde una IP `10.12.248.x`.
5. Tras eliminar sitios antiguos y verificar cero dependencias, retirar del VPS `10.11.252.0/24` y los segmentos de gestión históricos que ya no correspondan.

## Verificación y corrección posterior al borrado manual de sitios

El 2026-08-15 se confirmó en la base productiva `nodes=0`, torres ligadas `=0`,
sesiones activas `=0` y un Administrador activo. Sin embargo, el estado aún no
es operacionalmente limpio:

- 80 AP sin nodo y 14 grupos de AP.
- 450 CPE; 23 ya no tienen AP asociado.
- 1 asignación de túnel sin nodo.
- 31 estados de monitoreo sin nodo.
- 2 `workspace_scan_ip` todavía en `10.11.252.0/24` y ninguno en el pool nuevo.

Con autorización explícita se creó un dump, se restauró correctamente en una
base temporal y después se eliminaron esos huérfanos. Las dos scan-IP se
migraron conservando su último octeto.

Estado final:

- Cero nodos, torres, AP, grupos, CPE, asignaciones, sesiones activas y estados de monitoreo de nodos.
- Dos scan-IP en `10.12.248.0/24`; cero en `10.11.252.0/24`.
- FKs `aps.node_id`, `torres.node_id` y `cpes.ap_id` con `ON DELETE CASCADE`.
- Triggers de nodo limpian asignaciones, monitoreo, invitaciones pendientes y grupos vacíos.
- `wg0` conserva solamente la ruta y `AllowedIPs 10.12.248.0/22`.
- Intención del autosync vacía; las rutas históricas de sitios no reaparecerán.

Respaldos principales:

- Base restaurada/verificada: `/root/pre-orphan-site-cleanup-20260815T200030Z/vpn_manager.sql.gz`.
- WireGuard antes de retirar el pool: `/root/wg0-before-old-scan-removal-20260815T195435Z.conf`.
- WireGuard antes de retirar rutas históricas: `/root/wg0-before-obsolete-route-removal-20260815T195736Z.conf`.
