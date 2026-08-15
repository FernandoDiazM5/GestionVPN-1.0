# Joinpoint Control Plane

Servicio aislado para clientes, planes, instancias, pools y activaciones. No controla todavía ningún VPS productivo.

## Configuración mínima

- `CONTROL_PLANE_PORT` (default `3100`)
- `CONTROL_PLANE_ADMIN_TOKEN` (mínimo 32 caracteres; secreto fuera del repositorio)
- `ACTIVATION_CODE_PEPPER` (mínimo 32 caracteres; secreto distinto al token)
- `ACTIVATION_RATE_LIMIT_PEPPER` (mínimo 32 caracteres; distinto de los anteriores)
- `LICENSE_SIGNING_KEY_ID` y `LICENSE_SIGNING_PRIVATE_KEY_FILE` (PEM Ed25519 fuera del repositorio)
- `CONTROL_DB_HOST`, `CONTROL_DB_PORT`, `CONTROL_DB_USER`, `CONTROL_DB_PASSWORD`, `CONTROL_DB_NAME`

El servidor escucha exclusivamente en `127.0.0.1`. La publicación futura debe pasar por HTTPS y un proxy con rate limiting. El Bearer actual es una protección administrativa provisional; debe sustituirse por sesiones fuertes con MFA antes de construir la interfaz central.

## API administrativa MVP

Todas las rutas bajo `/api/admin` exigen `Authorization: Bearer <token>`.

- `GET|POST /api/admin/customers`
- `GET|POST /api/admin/plans`
- `GET|POST /api/admin/instances`
- `GET|POST /api/admin/instances/:id/activation-codes`
- `POST /api/admin/activation-codes/:id/revoke`
- `POST /api/admin/instances/:id/subscriptions`

El instalador usa `POST /api/activate`. El endpoint aplica primero rate limiting durable y después ejecuta atómicamente: consumir código, registrar identidad Ed25519, activar instancia y emitir la primera licencia. Devuelve FQDN, `/22`, licencia y clave pública de verificación; los errores de código/suscripción se unifican como `ACTIVATION_FAILED` para evitar enumeración.

El código en claro sólo aparece al emitirlo. Los listados exponen estado y fechas, pero nunca el código ni su huella HMAC.

## Límites deliberados

- Sin interfaz web central.
- Sin endpoint público de activación hasta añadir rate limiting durable y licencias firmadas.
- Sin DNS, TLS, facturación, heartbeat o comandos remotos.
- Sin despliegue de producción.

El limitador durable permite 5 intentos por IP seudonimizada en 15 minutos y bloquea 60 minutos al excederlos. La tabla sólo conserva HMAC, ventana, contador y vencimiento del bloqueo.

## Licencias firmadas

El formato `jpl1` usa Ed25519, incluye `instanceId`, plan, entitlements, vigencia y `graceUntil`, y se verifica con la clave pública central. La llave privada de firma debe permanecer fuera de Git y fuera de la base de datos. Una licencia vencida puede entrar en `OFFLINE_GRACE`; este estado limita el software, pero nunca desmonta WireGuard ni modifica el Core.
