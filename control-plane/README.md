# Joinpoint Control Plane

Servicio aislado para clientes, planes, instancias, pools y activaciones. No controla todavía ningún VPS productivo.

## Configuración mínima

- `CONTROL_PLANE_PORT` (default `3100`)
- `CONTROL_PLANE_ADMIN_TOKEN` (mínimo 32 caracteres; secreto fuera del repositorio)
- `ACTIVATION_CODE_PEPPER` (mínimo 32 caracteres; secreto distinto al token)
- `CONTROL_DB_HOST`, `CONTROL_DB_PORT`, `CONTROL_DB_USER`, `CONTROL_DB_PASSWORD`, `CONTROL_DB_NAME`

El servidor escucha exclusivamente en `127.0.0.1`. La publicación futura debe pasar por HTTPS y un proxy con rate limiting. El Bearer actual es una protección administrativa provisional; debe sustituirse por sesiones fuertes con MFA antes de construir la interfaz central.

## API administrativa MVP

Todas las rutas bajo `/api/admin` exigen `Authorization: Bearer <token>`.

- `GET|POST /api/admin/customers`
- `GET|POST /api/admin/plans`
- `GET|POST /api/admin/instances`
- `GET|POST /api/admin/instances/:id/activation-codes`
- `POST /api/admin/activation-codes/:id/revoke`

El código en claro sólo aparece al emitirlo. Los listados exponen estado y fechas, pero nunca el código ni su huella HMAC.

## Límites deliberados

- Sin interfaz web central.
- Sin endpoint público de activación hasta añadir rate limiting durable y licencias firmadas.
- Sin DNS, TLS, facturación, heartbeat o comandos remotos.
- Sin despliegue de producción.

## Licencias firmadas

El formato `jpl1` usa Ed25519, incluye `instanceId`, plan, entitlements, vigencia y `graceUntil`, y se verifica con la clave pública central. La llave privada de firma debe permanecer fuera de Git y fuera de la base de datos. Una licencia vencida puede entrar en `OFFLINE_GRACE`; este estado limita el software, pero nunca desmonta WireGuard ni modifica el Core.
