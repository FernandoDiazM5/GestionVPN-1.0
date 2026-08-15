# Inventario para reinicio operativo de sitios

Fecha: 2026-08-15
Estado: matriz y preview global de sólo lectura implementados localmente; no
autoriza ni ejecuta borrados.

Endpoint administrativo: `GET /api/admin/operational-reset-preview`.
La respuesta siempre incluye `readOnly: true` y `canExecuteReset: false`.

## Objetivo

Dejar el sistema sin sitios ni dependencias operativas para configurar la nueva
supernet de gestión, conservando la cuenta del Administrador de plataforma y
toda la información disponible en Administración.

## Regla de seguridad

Una fila sólo puede eliminarse automáticamente cuando su pertenencia al sitio
se demuestra por `workspace_id`, `node_id`, `ap_id`, `torre_id` o por el
identificador textual exacto del túnel. Una coincidencia sólo por nombre es
ambigua y debe bloquear la operación.

## Matriz de datos

| Clasificación | Tablas/datos | Tratamiento |
| --- | --- | --- |
| Eliminar con cada sitio | `nodes`, `node_ssh_creds`, `node_tags`, `node_history` | Eliminar nodo exacto y dependencias por FK |
| Eliminar con cada sitio | `torres`, `torre_ptp_endpoints` | Eliminar sólo torres ligadas por `node_id` |
| Eliminar con cada sitio | `aps`, `ap_status_snapshots`, `cpes`, `signal_history` | Eliminar sólo AP ligados al nodo y sus dependencias |
| Desactivar/eliminar con cada sitio | `tunnel_user_sessions`, `tunnel_assignments`, invitaciones pendientes, `monitoring_state` del nodo | Cerrar sesiones primero; usar túnel/VRF exacto |
| Revisar después del último sitio | `ap_groups`, `tags`, `peer_colors`, `peer_aliases`, `mgmt_peer_owners` | Eliminar únicamente registros huérfanos o exclusivamente operativos |
| Conservar | `users` del Administrador, `auth_identities`, `auth_sessions`, `account_login_security` | Identidad, acceso y seguridad del Administrador |
| Conservar | `app_settings`, configuración del Core, correo, Telegram, seguridad y parámetros de Administración | Configuración administrativa; modificar sólo claves de red aprobadas |
| Conservar | `platform_security_*`, `web_security_*`, `auth_attempts`, `auth_rate_buckets` | Auditoría y controles de seguridad |
| Conservar inicialmente | `workspaces`, `workspace_members`, `workspace_routers`, `workspace_scan_ip`, `member_wireguard`, `user_mgmt_ips` | Son información visible en Administración; requieren decisión explícita si también se desea borrar clientes/workspaces |
| Conservar como auditoría | `tunnel_logs`, `tunnel_session_logs`, `core_backup_runs` | Evidencia histórica; no es necesaria para afirmar que no hay sitios activos |
| Revisar | `ai_*`, `notification_*`, `password_resets` | Conservar por defecto; purgar sólo por política de retención, no por reinicio de red |

## Criterio de estado limpio

El sistema se considera sin sitios cuando todos estos conteos son cero:

- `nodes`, `node_ssh_creds`, `node_tags` y `node_history`.
- `torres` ligadas a nodos y sus `torre_ptp_endpoints`.
- `aps`, `ap_status_snapshots`, `cpes` y `signal_history` ligados a sitios.
- sesiones `ACTIVE`, asignaciones e invitaciones pendientes asociadas a túneles eliminados.
- entradas `monitoring_state` de los nodos eliminados.
- objetos RouterOS identificados como propiedad de esos sitios.

No se exige que `users`, `workspaces`, auditorías o `app_settings` estén vacíos.

## Hallazgo frente al borrado actual

El servicio `siteDeletionService` ya elimina AP/CPE, torres y nodos, cierra
sesiones, revoca invitaciones, retira asignaciones y limpia monitoreo. Antes de
un reinicio total todavía debe reforzarse el preview para incluir explícitamente
dependencias indirectas y huérfanos (`torre_ptp_endpoints`, grupos de AP, tags,
aliases/colores y propietarios de peers), y debe existir una comprobación global
de conteos cero. Ninguno de esos huérfanos debe borrarse sólo por nombre.

## Puertas antes de ejecutar

1. Consultar conteos reales en el entorno objetivo mediante el preview de sólo lectura.
2. Exportar y probar restauración de MySQL, RouterOS y `wg0.conf`.
3. Confirmar qué workspaces y usuarios no administradores se conservarán.
4. Resolver todos los registros clasificados como ambiguos.
5. Obtener autorización explícita para el borrado material.
6. Ejecutar sitio por sitio, verificando huella y resultado.
7. Ejecutar la comprobación global de estado limpio.
8. Sólo entonces guardar la nueva `/22` y preparar el Core/VPS.

## Verificación local

- Pruebas unitarias del preview: `2/2`.
- Sintaxis backend, inventario de seguridad, tipos frontend y lint: correctos.
- El endpoint está protegido por sesión y rol Administrador de plataforma.
