# Runbook: staging y canary de Firebase Auth

Estado: **preparado, no ejecutado**. Este documento no autoriza activar Firebase en producción.

## 1. Invariantes

- Usar un proyecto Firebase exclusivo de staging.
- Firebase sólo autentica; MySQL conserva usuario, workspace, rol, suspensión y sesiones locales.
- No auto-crear usuarios, workspaces o roles desde claims.
- No introducir contraseñas, ID tokens, refresh tokens ni JSON de cuenta de servicio en Git, logs o comandos.
- Conservar el login local y `password_hash` durante todo el piloto.
- El canary inicial debe ser un único moderador `OWNER` activo, no el administrador de plataforma.
- Backend y frontend permanecen apagados hasta completar cada gate de este runbook.

Referencias oficiales: [configurar Firebase Admin con ADC](https://firebase.google.com/docs/admin/setup), [consultar usuarios por UID](https://firebase.google.com/docs/auth/admin/manage-users) y [revocar refresh tokens](https://firebase.google.com/docs/auth/admin/manage-sessions).

## 2. Preparar el proyecto aislado

1. Crear o seleccionar el proyecto Firebase de staging.
2. Registrar una aplicación web y habilitar el proveedor Email/Password.
3. Registrar únicamente los dominios de staging necesarios.
4. Crear la identidad canary fuera de GestionVPN. Su correo debe coincidir exactamente con el usuario local y estar verificado.
5. Configurar ADC fuera del repositorio y de la imagen. En infraestructura externa a Google, preferir Workload Identity Federation; un JSON temporal debe montarse read-only y rotarse/eliminarse al terminar.
6. No importar todavía el universo de usuarios ni hashes Argon2.

## 3. Configuración inicial del backend de staging

En el entorno aislado del backend:

```dotenv
FIREBASE_PILOT_ENV=staging
FEDERATED_AUTH_ENABLED=true
FEDERATED_AUTH_PROVIDER=firebase
FIREBASE_PROJECT_ID=<proyecto-staging>
FEDERATED_AUTH_MAX_AGE_SECONDS=300
# FIREBASE_TENANT_ID=<solo-si-el-piloto-usa-un-tenant>
```

ADC se entrega por el entorno del host. El preflight sólo informa si la fuente es ambiental o un archivo externo; nunca imprime su ruta.

Mantener todavía en `false`:

```dotenv
VITE_FEDERATED_AUTH_ENABLED=false
```

## 4. Migración y preflight read-only

Aplicar la migración idempotente y ejecutar primero el diagnóstico local:

```bash
npm run migrate:auth-identities --prefix server
npm run firebase:preflight --prefix server
```

El diagnóstico sin `--provider` es parcial y no declara el canary listo. El gate completo comprueba ADC y acceso de sólo lectura a Firebase Authentication sin imprimir usuarios:

```bash
npm run firebase:preflight --prefix server -- --provider
```

Todos los checks deben mostrar `OK` y el resultado debe ser `LISTO`. Si falla, no habilitar el frontend.

## 5. Vincular el moderador canary

Consultar el estado sin modificar datos:

```bash
npm run firebase:canary --prefix server -- status --email <correo-canary>
```

Validar el plan. El CLI consulta el UID con Firebase Admin y exige que la identidad esté activa, verificada y tenga exactamente el mismo correo que el `OWNER` local:

```bash
npm run firebase:canary --prefix server -- link --email <correo-canary> --uid <firebase-uid>
```

Aplicar sólo después de revisar el dry-run:

```bash
npm run firebase:canary --prefix server -- link --email <correo-canary> --uid <firebase-uid> --apply --confirm LINK_FIREBASE_CANARY
```

El comando no crea usuarios Firebase, no recibe contraseñas y no modifica roles. Si el mapping estaba deshabilitado y conserva el mismo UID, lo reactiva; cualquier colisión usuario↔UID bloquea la operación.

## 6. Habilitar el frontend y probar

Sólo después del mapping:

```dotenv
VITE_FEDERATED_AUTH_ENABLED=true
VITE_FIREBASE_API_KEY=<identificador-web-publico>
VITE_FIREBASE_AUTH_DOMAIN=<auth-domain-staging>
VITE_FIREBASE_PROJECT_ID=<proyecto-staging>
VITE_FIREBASE_APP_ID=<app-id-web>
```

Reconstruir el frontend de staging. Probar como mínimo:

1. Login Firebase correcto crea `vpn_session` local y permite el workspace esperado.
2. Recarga del navegador conserva sólo la sesión local; no existe sesión Firebase persistente.
3. Login local del mismo usuario continúa funcionando.
4. Correo/contraseña incorrectos siempre devuelven el mensaje genérico.
5. UID no vinculado, correo distinto, usuario suspendido o mapping deshabilitado son rechazados.
6. Logout y logout global invalidan la sesión local.
7. MEMBER, OWNER y administrador conservan exactamente sus permisos MySQL; Firebase no concede RBAC.
8. Observar errores, latencia, cuotas y coste durante al menos 48 horas antes de cualquier ampliación.

## 7. Rollback del canary

El dry-run no cambia nada:

```bash
npm run firebase:canary --prefix server -- disable --email <correo-canary>
```

Aplicar el rollback explícito:

```bash
npm run firebase:canary --prefix server -- disable --email <correo-canary> --apply --confirm DISABLE_FIREBASE_CANARY
```

Este comando conserva el mapping para auditoría, lo deshabilita, revoca todas las sesiones locales del usuario y luego revoca sus refresh tokens Firebase. Si Google no responde, el mapping local ya queda bloqueado y el comando termina con error para exigir seguimiento.

Después:

1. Poner `VITE_FEDERATED_AUTH_ENABLED=false` y reconstruir el frontend.
2. Poner `FEDERATED_AUTH_ENABLED=false` y reiniciar el backend.
3. Confirmar que el usuario entra nuevamente por el login local.
4. No borrar el usuario Firebase ni la fila `auth_identities` durante la investigación.

## 8. Criterio de salida

No avanzar a más usuarios ni producción hasta tener:

- 48 horas sin regresiones de RBAC, suspensión, revocación o sesión;
- prueba documentada de rollback;
- decisión Argon2 REST/Java o migración progresiva sin texto plano;
- presupuesto, cuotas, alertas y responsable operativo aprobados;
- revisión humana de seguridad y privacidad.
