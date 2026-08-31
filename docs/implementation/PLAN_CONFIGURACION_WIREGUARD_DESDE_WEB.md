# Plan: configuración de WireGuard desde el panel de Administración

## Objetivo

Permitir que el administrador configure desde Joinpoint los parámetros del túnel WireGuard del VPS y su incorporación a la red VPN, sin entrar manualmente al servidor. La aplicación debe validar, aplicar de forma transaccional y dejar evidencia de cada cambio.

## Alcance y límite de seguridad

La web administrará la configuración del **VPS** y la relación con el Core MikroTik. No se almacenarán claves privadas en la base de datos ni se expondrán en logs. La clave pública del VPS y los parámetros no secretos sí podrán visualizarse. Toda operación requiere `platform_admin`/administrador autorizado, confirmación explícita y respaldo previo.

## Estado actual

El sistema ya permite guardar la clave pública WireGuard del VPS en Configuración y sincroniza peers/rutas en los flujos existentes. Aún no existe un asistente completo para crear/editar el archivo `wg0.conf`, aplicar `wg-quick`, configurar firewall ni ejecutar la incorporación inicial al Core desde una única pantalla.

## Parámetros propuestos

### Identidad del servidor

- Nombre de interfaz (`wg0` por defecto).
- Clave pública del VPS (Base64, 44 caracteres).
- Clave privada: generada dentro del VPS o introducida sólo por consola; nunca persistida por Joinpoint.
- Puerto UDP local opcional del VPS (0 = dinámico, rango 1–65535 si se fija).
- MTU (por defecto 1420, rango seguro 1280– mtu de la red).

### Direccionamiento

- IP/ prefijo del túnel del VPS.
- Red de gestión autorizada y AllowedIPs.
- IP pública/DNS del VPS.
- DNS opcional para los clientes WireGuard.
- Rutas LAN del Core y rutas de retorno.

### Peer del Core

- Clave pública del Core.
- Endpoint público y puerto.
- AllowedIPs del peer.
- PersistentKeepalive.
- Interfaz WireGuard del Core y comentario identificador.

### Política

- Activar/desactivar el túnel.
- Permitir forwarding/NAT sólo para redes declaradas.
- Lista de redes no permitidas y validación de solapamientos.
- Modo simulación antes de aplicar.

## Flujo seguro

1. El administrador abre **Configuración → Integraciones → WireGuard del VPS**.
2. La pantalla carga el estado actual sin devolver claves privadas.
3. El formulario valida Base64, puertos, CIDR, AllowedIPs, solapamientos y que el destino no sea una red pública no autorizada.
4. Se muestra una previsualización del cambio: interfaz, peers, rutas, firewall y diferencia respecto al estado actual.
5. El administrador ejecuta primero **Validar/Sin aplicar**.
6. El backend crea un respaldo cifrado del estado actual y registra actor, IP, huella de configuración y motivo.
7. Se aplica en una transacción: archivo temporal, `wg syncconf`/`wg-quick`, rutas y reglas mínimas.
8. Se comprueba handshake, ruta al Core, health del backend y conectividad de retorno.
9. Si falla cualquier verificación, se restaura automáticamente la configuración anterior.
10. Se muestra resultado, cambios aplicados y cómo revertirlos.

## Arquitectura propuesta

- **Frontend:** asistente de 4 pasos: Parámetros, Peer/Core, Previsualización, Aplicar y verificar.
- **Backend:** `GET /api/admin/wireguard/config`, `POST /validate`, `POST /apply`, `POST /rollback`, `GET /audit`.
- **Persistencia:** `wireguard_server_config` (configuración no secreta), `wireguard_peer_config`, `wireguard_change_events` y respaldos fuera de la BD.
- **Agente privilegiado:** servicio local mínimo con allowlist de acciones (`wg`, rutas y firewall declarados), sin shell arbitrario ni comandos enviados desde el navegador.
- **RouterOS:** integración separada y explícita para crear/actualizar únicamente el peer gestionado; nunca borrar peers desconocidos.

## Reglas de aplicación

- No aplicar si el VPS no tiene acceso de recuperación confirmado.
- No cambiar la red de gestión activa sin ventana de mantenimiento y rollback probado.
- No aceptar AllowedIPs que se solapen con la red del host, Docker, LAN declaradas o la supernet de gestión.
- La clave privada se genera y permanece en el VPS; la rotación genera una nueva clave pública y exige actualizar el peer del Core.
- Cada cambio es idempotente y conserva el último respaldo funcional.
- El botón de “Aplicar” queda bloqueado para usuarios que no sean administrador autorizado.

## Fases

1. **Inventario y contrato:** confirmar rangos, interfaces, peer Core, puertos y política de rutas.
2. **Sólo lectura:** mostrar estado real de `wg0`, peers, rutas y health sin mutar.
3. **Previsualización:** validar y calcular diff, sin aplicar.
4. **Aplicación controlada:** agente allowlist + respaldo + rollback automático.
5. **Integración Core:** sincronizar peer MikroTik y comprobar handshake/rutas.
6. **Operación:** auditoría, rotación de claves, exportación de configuración cliente sin guardar privadas en BD y pruebas de recuperación.

## Criterios de aceptación

- El administrador puede validar una configuración sin tocar la red.
- Una configuración válida se aplica y sobrevive al reinicio del VPS.
- Una configuración inválida se rechaza con explicación clara.
- Un fallo de aplicación restaura el estado anterior automáticamente.
- Se verifica handshake y tráfico hacia una red de prueba.
- Ninguna clave privada aparece en API, base de datos, logs, respaldos descargables ni interfaz.
- Los eventos incluyen actor, fecha, huella, resultado y rollback.

## Decisiones que debemos confirmar antes de implementar

- Interfaz y puerto definitivos del túnel VPS.
- IP/prefijo del VPS y redes AllowedIPs del Core.
- Si el Core se configurará automáticamente por RouterOS API o sólo se generará un bloque para revisión.
- Si se permitirá introducir una clave privada existente (recomendado: no; generar dentro del VPS).
- Ventana de mantenimiento y red de prueba para el primer canary.

## Resultado de la Fase 1 — inventario y contrato técnico

Fecha de verificación: 2026-08-31. Esta fase fue estrictamente de solo lectura.

### Inventario del VPS nuevo

| Elemento | Estado verificado |
| --- | --- |
| VPS | `vpn-join` — `143.244.169.142` |
| Sistema | Ubuntu, kernel `6.8.0-124-generic` |
| WireGuard | No instalado (`wg` no disponible) |
| Interfaz `wg0` | No existe |
| Servicio `wg-quick@wg0` | No existe / inactivo |
| Archivo `/etc/wireguard/wg0.conf` | No existe |
| Forwarding IPv4 | Activo |
| Firewall UFW | Inactivo |
| Puerto UDP WireGuard | Ninguno escuchando |
| Redes del host | `10.10.0.0/16`, `10.116.0.0/20`, pública `143.244.160.0/20` |
| Redes Docker | `172.17.0.0/16`, `172.18.0.0/16` |

La supernet prevista `10.12.248.0/22` no se solapa con las redes observadas del host ni con Docker.

### Contrato inicial propuesto

| Parámetro | Valor inicial | Estado |
| --- | --- | --- |
| Interfaz | `wg0` | Propuesto |
| Supernet de gestión | `10.12.248.0/22` | Ya definida por el proyecto |
| Escaneo | `10.12.248.0/24` | Ya definido por el proyecto |
| Clientes | `10.12.249.0/24` | Derivado del diseño vigente |
| VPS | `10.12.250.0/24` | Derivado del diseño vigente |
| Administración | `10.12.251.0/24` | Derivado del diseño vigente |
| IP histórica del peer VPS | `10.12.250.60/32` | Requiere confirmar en el Core antes de aplicar |
| Puerto WireGuard del Core | `13232/UDP` | Derivado del diseño vigente; requiere confirmar en el Core |
| MTU | `1420` | Propuesto |
| Clave privada | Generada localmente en el VPS | Obligatorio; nunca persiste en BD |
| Clave pública | Calculada en el VPS y visible en Administración | Obligatorio |

### Contrato de seguridad aprobado para desarrollo

- La Fase 2 será de **solo lectura** y podrá mostrar `NO_CONFIGURADO`, `INACTIVO`, `ACTIVO` o `DEGRADADO`.
- El navegador nunca enviará comandos de sistema ni rutas libres.
- El backend sólo consultará un agente local con operaciones enumeradas.
- La API nunca devolverá la clave privada ni el contenido completo de `wg0.conf`.
- Instalar paquetes, generar claves o levantar `wg0` pertenecerá a una fase posterior con previsualización y rollback.
- Antes de activar el túnel se debe comprobar en el Core la IP `10.12.250.60/32`, el puerto `13232/UDP`, la clave pública vigente y las AllowedIPs.

### Salida hacia la Fase 2

Construir el diagnóstico de solo lectura en el backend y la tarjeta administrativa “WireGuard del VPS”. En el VPS actual deberá mostrar “No configurado” y explicar que aún no existen `wg`, `wg0` ni el servicio persistente, sin ofrecer todavía el botón de aplicar.

## Resultado de la Fase 2 — diagnóstico de solo lectura

Estado: desplegada el 2026-08-31 en `143.244.169.142`, runtime `01e8328`.

- El estado del Servidor VPN incluye ahora `vpsWireguard` y sólo ejecuta consultas con binario y argumentos fijos.
- El diagnóstico devuelve `ACTIVE`, `DEGRADED` o `NOT_CONFIGURED`, interfaz, disponibilidad de herramientas, direcciones, puerto, clave pública, rutas y hora de inspección.
- Nunca consulta ni devuelve la clave privada ni el contenido de `wg0.conf`.
- La imagen productiva incorpora únicamente las herramientas de lectura `iproute2` y `wireguard-tools`; el backend continúa como usuario no-root.
- Administración muestra una tarjeta “WireGuard del VPS”, estado, interfaz, dirección, puerto, herramientas y rutas detectadas.
- Cuando no existe `wg0`, la vista informa “No configurado” y no ofrece acciones de aplicación.
- El endpoint hereda autenticación y autorización exclusiva de `platform_admin` del módulo `/api/admin/core-server`.

Verificación: pruebas focalizadas backend 2/2, frontend 4/4, TypeScript, lint, build y `check:all` correctos. El inventario de seguridad de rutas fue actualizado.

Verificación productiva: diagnóstico `NOT_CONFIGURED`, `toolsAvailable=true`, `interfacePresent=false`, sin direcciones, puerto, clave pública ni rutas; HTTPS y `/api/health` 200, MariaDB/backend healthy y cero reinicios. Respaldo: `/root/backups/pre-wireguard-readonly-20260831T134158Z/vpn_manager.sql.gz`. Imágenes rollback: `gestionvpn-10-{backend|frontend}:pre-wireguard-readonly-20260831T134158Z`.

### Salida hacia la Fase 3

Agregar el formulario y endpoint de **previsualización sin cambios**: validar interfaz, puerto, MTU, dirección del VPS, peer Core, endpoint y AllowedIPs; calcular conflictos con host/Docker/supernet; mostrar el diff previsto. No instalar paquetes, crear claves ni levantar `wg0` todavía.

## Resultado de la Fase 3 — validación y previsualización

Estado: implementada localmente el 2026-08-31, pendiente de despliegue.

- Administración incorpora el formulario “Previsualizar configuración WireGuard”.
- Valores iniciales: interfaz `wg0`, VPS `10.12.250.60/32`, MTU 1420, Core `213.173.36.232:13232`, AllowedIPs `10.12.248.0/22` y keepalive 25 segundos.
- `13232/UDP` corresponde al endpoint público del Core; el puerto local del VPS queda dinámico por defecto.
- El backend valida nombres de interfaz Linux, rangos de puerto/MTU/keepalive, clave pública Base64, endpoint, dirección `/32` dentro del segmento VPS y AllowedIPs.
- Se bloquean `0.0.0.0/0`, la ausencia de la supernet exacta y solapamientos con redes activas del host o Docker.
- La respuesta calcula configuración deseada, diferencias y acciones previstas, pero fuerza `canApply=false` y `readOnly=true`.
- No se instala WireGuard, no se generan claves, no se crean archivos y no se modifican interfaces, rutas, firewall ni Core.

Verificación: backend 5/5 pruebas focalizadas, frontend 5/5, TypeScript, lint, build, inventario de rutas y `check:all` verdes.

### Salida hacia la Fase 4

Diseñar el agente privilegiado allowlist, almacenamiento no secreto, respaldo verificable y rollback. Antes de permitir aplicación se debe obtener y confirmar la clave pública real del Core y probar el procedimiento en un canary con acceso de recuperación.

## Resultado de las Fases 4, 5 y 6

Estado: implementadas localmente el 2026-08-31, pendientes de despliegue conjunto y canary real.

### Fase 4 — aplicación controlada

- El backend no-root escribe una intención JSON atómica en `/opt/wg0-autosync`; nunca ejecuta shell ni recibe la clave privada.
- `wg0-provision.path/service` ejecuta un agente Python root endurecido con operaciones enumeradas `APPLY`, `ROTATE` y `ROLLBACK`.
- El agente vuelve a validar interfaz, IPv4 `/32`, MTU, puertos, clave pública, endpoint, AllowedIPs y keepalive.
- La primera aplicación genera la clave privada dentro del VPS, modo 600, y publica únicamente la clave pública.
- Antes de cada aplicación crea un respaldo en `/var/backups/gestionvpn-wireguard`.
- Si `wg-quick up` o la verificación falla, restaura automáticamente el respaldo anterior.
- `wg-quick@wg0` queda habilitado para sobrevivir reinicios.
- La web exige confirmaciones literales para aplicar, rotar o revertir y muestra el resultado no secreto del agente.

### Fase 5 — peer del Core

- La web inspecciona la interfaz `VPN-WG-VPS`, su clave pública y puerto antes de cambiarla.
- Si la clave pública indicada no coincide con la real del Core, la sincronización queda bloqueada.
- La operación crea o actualiza exclusivamente el peer con comentario `GVPN:VPS`.
- Conserva todos los peers ajenos y limita el cambio a clave pública del VPS, Allowed Address y keepalive.
- La sincronización requiere que el VPS ya exponga una clave pública activa y confirmación literal.

### Fase 6 — operación y recuperación

- Estado del agente visible en Administración: solicitud, resultado, mensaje, respaldo y clave pública.
- Auditoría de solicitudes de aplicación, rollback, rotación y sincronización del Core.
- Rotación de clave local con respaldo previo; después exige revisar/sincronizar el peer del Core.
- Rollback del último respaldo desde la web con confirmación reforzada.
- Persistencia tras reinicio mediante `wg-quick@wg0` y reconciliación existente de LAN/AllowedIPs.
- Runbook de instalación y recuperación actualizado en `deploy/wg0-autosync/README.md`.

### Condición para el despliegue y canary

El despliegue del código y del agente no activa `wg0` por sí mismo. La primera aplicación real requiere ingresar la clave pública exacta de `VPN-WG-VPS` obtenida del Core, validar la previsualización y mantener abierta la consola de recuperación. Después se sincroniza el peer VPS y se verifican handshake, ruta a `10.12.248.0/22`, health y reinicio controlado.
