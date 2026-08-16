# Plataforma Central Joinpoint

Despliegue aislado del control comercial. Requiere un VPS limpio, DNS `central.joinpoint.cloud`,
certificado TLS y una imagen `joinpoint-central` versionada. MariaDB no publica puertos y la API sólo
se alcanza mediante Nginx HTTPS.

Los secretos obligatorios de `central.env` son `CONTROL_ADMIN_MFA_ENCRYPTION_KEY`,
`CONTROL_ADMIN_SESSION_PEPPER`, `ACTIVATION_CODE_PEPPER`, `ACTIVATION_RATE_LIMIT_PEPPER` y
`LICENSE_SIGNING_KEY_ID`. La privada Ed25519 se monta read-only desde el host y nunca se copia a la
imagen o base de datos.

El primer administrador se crea una sola vez ejecutando, con variables temporales introducidas en la
sesión, `docker compose run --rm central node control-plane/src/scripts/bootstrapAdmin.js`. La URI TOTP
y los diez códigos deben guardarse fuera del VPS; después se eliminan las variables temporales.

No ejecutar todavía sobre el VPS administrador hasta completar el instalador TLS/backup y validar el
flujo E2E de creación de cliente, plan, instancia, suscripción y código.
