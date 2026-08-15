# Joinpoint Control Plane

Servicio aislado para clientes, planes, instancias, pools y activaciones. No controla todavía ningún VPS productivo.

## Configuración mínima

- `CONTROL_PLANE_PORT` (default `3100`)
- `CONTROL_ADMIN_MFA_ENCRYPTION_KEY` (32 bytes en Base64; cifra secretos TOTP y permanece fuera del repositorio)
- `CONTROL_ADMIN_SESSION_PEPPER` (mínimo 32 caracteres; seudonimiza el origen de sesión)
- `ACTIVATION_CODE_PEPPER` (mínimo 32 caracteres; secreto distinto al token)
- `ACTIVATION_RATE_LIMIT_PEPPER` (mínimo 32 caracteres; distinto de los anteriores)
- `LICENSE_SIGNING_KEY_ID` y `LICENSE_SIGNING_PRIVATE_KEY_FILE` (PEM Ed25519 fuera del repositorio)
- `CONTROL_DB_HOST`, `CONTROL_DB_PORT`, `CONTROL_DB_USER`, `CONTROL_DB_PASSWORD`, `CONTROL_DB_NAME`

El servidor escucha exclusivamente en `127.0.0.1`. La publicación futura debe pasar por HTTPS y un proxy con rate limiting adicional. La autenticación administrativa ya usa sesiones y MFA; todavía no debe exponerse hasta completar el proxy TLS, recuperación de cuenta y canary operativo.

## API administrativa MVP

`POST /api/admin-auth/login` recibe correo, contraseña y código TOTP. Todas las rutas bajo `/api/admin` exigen la cookie opaca `__Host-joinpoint_admin`; las operaciones que modifican datos requieren además el valor entregado como `csrfToken` en `X-CSRF-Token`. La cookie es `HttpOnly`, `Secure`, `SameSite=Strict`, dura como máximo ocho horas y vence tras 30 minutos de inactividad.

- `GET|POST /api/admin/customers`
- `GET|POST /api/admin/plans`
- `GET|POST /api/admin/instances`
- `GET|POST /api/admin/instances/:id/activation-codes`
- `POST /api/admin/activation-codes/:id/revoke`
- `POST /api/admin/instances/:id/subscriptions`
- `GET|POST /api/admin/license-keys`
- `POST /api/admin/license-keys/:keyId/activate`
- `POST /api/admin/license-keys/:keyId/revoke`
- `GET /api/admin/instances/:id/licenses`
- `POST /api/admin/licenses/:id/revoke`
- `GET /api/admin/me`
- `POST /api/admin/logout`
- `POST /api/admin/recovery-codes/regenerate`

## Primer administrador

Después de aplicar el esquema y antes de publicar el servicio, definir temporalmente `CONTROL_ADMIN_BOOTSTRAP_EMAIL`, `CONTROL_ADMIN_BOOTSTRAP_NAME` y `CONTROL_ADMIN_BOOTSTRAP_PASSWORD`, además de las variables de base y cifrado, y ejecutar `npm run bootstrap:admin`. Sólo funciona cuando no existe ningún administrador y muestra una URI TOTP y diez códigos de recuperación una única vez. Registrar la URI, guardar los códigos fuera del VPS y retirar inmediatamente las tres variables de bootstrap.

Las contraseñas se derivan con `scrypt`; los secretos TOTP se cifran con AES-256-GCM. Cada código de recuperación es de un solo uso y la base conserva únicamente su HMAC. El administrador puede regenerar todo el conjunto reingresando contraseña y TOTP; los anteriores se invalidan atómicamente. Cinco fallos consecutivos bloquean la cuenta durante 15 minutos. Además, cada origen seudonimizado admite diez intentos en 15 minutos y se bloquea 30 minutos al excederlos, incluso tras reiniciar el servicio. La base conserva únicamente hashes de tokens de sesión y CSRF, nunca sus valores en claro.

El instalador usa `POST /api/activate`. El endpoint aplica primero rate limiting durable y después ejecuta atómicamente: consumir código, registrar identidad Ed25519, activar instancia y emitir la primera licencia. Devuelve FQDN, `/22`, licencia y clave pública de verificación; los errores de código/suscripción se unifican como `ACTIVATION_FAILED` para evitar enumeración.

## Sincronización de instancias

`POST /api/instance/sync` distribuye el paquete de claves públicas, revocaciones de la instancia, metadatos de la licencia vigente y, cuando corresponde, una licencia renovada. La petición se autentica con la identidad Ed25519 creada en la activación mediante `X-Joinpoint-Instance`, `X-Joinpoint-Timestamp`, `X-Joinpoint-Nonce` y `X-Joinpoint-Signature`. Se firma `JP-INSTANCE-V1`, método, ruta, instancia, tiempo Unix, nonce y SHA-256 del JSON canónico. El reloj admite ±5 minutos y cada nonce se persiste y acepta una sola vez.

El paquete de confianza completo se firma como `JP-TRUST-BUNDLE-V1` con la clave central activa. Para rotar sin romper confianza: registrar la nueva pública como `VERIFY_ONLY`, distribuirla mientras el paquete aún lo firma la clave anterior y sólo después promoverla a `ACTIVE` e instalar su privada externa. Una renovación normal sólo se admite dentro de las últimas 48 horas; recuperar una licencia perdida no puede repetirse antes de una hora. Suspender comercialmente una instancia no bloquea esta sincronización ni altera WireGuard.

La prueba `test:integration` sólo se activa con `CONTROL_INTEGRATION_TEST=true` y una MariaDB temporal indicada por `CONTROL_TEST_DB_PORT`. Recorre el ciclo HTTP completo y confirma que el código no puede reutilizarse.

El código en claro sólo aparece al emitirlo. Los listados exponen estado y fechas, pero nunca el código ni su huella HMAC.

## Límites deliberados

- Sin interfaz web central.
- Sin DNS, TLS, facturación, heartbeat o comandos remotos.
- Sin despliegue de producción.

El limitador durable permite 5 intentos por IP seudonimizada en 15 minutos y bloquea 60 minutos al excederlos. La tabla sólo conserva HMAC, ventana, contador y vencimiento del bloqueo.

## Ciclo de claves y licencias

La rotación conserva las claves anteriores como `VERIFY_ONLY`; una revocación de emergencia las marca `REVOKED` y el verificador las rechaza aunque la firma sea correcta. Activar una clave en la base no instala su clave privada: el archivo externo y `LICENSE_SIGNING_KEY_ID` deben corresponder exactamente o la emisión falla de forma cerrada. Las licencias se revocan con motivo administrativo, sin almacenar ni volver a exponer su token.

## Licencias firmadas

El formato `jpl1` usa Ed25519, incluye `instanceId`, plan, entitlements, vigencia y `graceUntil`, y se verifica con la clave pública central. La llave privada de firma debe permanecer fuera de Git y fuera de la base de datos. Una licencia vencida puede entrar en `OFFLINE_GRACE`; este estado limita el software, pero nunca desmonta WireGuard ni modifica el Core.
