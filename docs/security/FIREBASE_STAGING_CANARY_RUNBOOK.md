# Runbook: staging y canary de Firebase Auth

Estado: **preparado, no ejecutado**. Este documento no autoriza activar Firebase en producción.

## 1. Invariantes

- Usar un proyecto Firebase exclusivo de staging.
- Firebase sólo autentica; MySQL conserva usuario, workspace, rol, suspensión y sesiones locales.
- No auto-crear usuarios, workspaces o roles desde claims.
- No introducir contraseñas, ID tokens, refresh tokens ni JSON de cuenta de servicio en Git, logs o comandos.
- Conservar el login local y `password_hash` durante todo el piloto.
- El canary inicial debe ser un único moderador `OWNER` activo, no el administrador de plataforma.
- El UID se captura automáticamente al enlazar Google; nunca se pide al usuario ni se copia al `.env`.
- Backend y frontend permanecen apagados hasta completar cada gate de este runbook.

Referencias oficiales: [configurar Firebase Admin con ADC](https://firebase.google.com/docs/admin/setup), [consultar usuarios por UID](https://firebase.google.com/docs/auth/admin/manage-users) y [revocar refresh tokens](https://firebase.google.com/docs/auth/admin/manage-sessions).

## 2. Preparar el proyecto aislado

1. Crear o seleccionar el proyecto Firebase de staging.
2. Registrar una aplicación web y habilitar únicamente el proveedor Google para este piloto.
3. Registrar únicamente los dominios de staging necesarios.
4. Confirmar que el correo del `OWNER` canary es una cuenta Google verificada y coincide exactamente con su perfil local.
5. Configurar ADC fuera del repositorio y de la imagen. En infraestructura externa a Google, preferir Workload Identity Federation; un JSON temporal debe montarse read-only y rotarse/eliminarse al terminar.
6. No importar usuarios, contraseñas ni hashes Argon2: la adopción es progresiva y autoservicio.

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

## 5. Habilitar el frontend y enlazar el canary

Sólo después de que el preflight quede `LISTO`:

```dotenv
VITE_FEDERATED_AUTH_ENABLED=true
VITE_FIREBASE_API_KEY=<identificador-web-publico>
VITE_FIREBASE_AUTH_DOMAIN=<auth-domain-staging>
VITE_FIREBASE_PROJECT_ID=<proyecto-staging>
VITE_FIREBASE_APP_ID=<app-id-web>
```

Reconstruir el frontend de staging. El `OWNER` canary debe:

1. Entrar primero con su login local.
2. Abrir **Perfil y seguridad → Google**.
3. Escribir nuevamente su contraseña local y pulsar **Enlazar cuenta de Google**.
4. Seleccionar la cuenta Google cuyo correo coincide exactamente con el perfil.
5. Confirmar que aparece **Google enlazado**.

El backend verifica sesión local, contraseña, token Firebase reciente y revocable, proveedor `google.com`, correo verificado, igualdad de correo y unicidad usuario↔UID. El navegador nunca recibe ni muestra el UID; MySQL lo conserva en `auth_identities`.

El CLI queda como herramienta operativa de consulta y recuperación, no como flujo normal del usuario:

```bash
npm run firebase:canary --prefix server -- status --email <correo-canary>
```

## 6. Matriz de prueba

Probar como mínimo:

1. **Continuar con Google** crea `vpn_session` local y permite el workspace esperado.
2. Recarga del navegador conserva sólo la sesión local; no existe sesión Firebase persistente.
3. Login local del mismo usuario continúa funcionando.
4. Google no vinculado, correo distinto, token no Google, usuario suspendido o mapping deshabilitado son rechazados.
5. Una cuenta Google no puede vincularse a dos usuarios y un usuario no puede vincular dos cuentas.
6. Desvincular exige nuevamente la contraseña local, deshabilita el mapping y revoca refresh tokens Firebase.
7. Logout y logout global invalidan la sesión local.
8. MEMBER, OWNER y administrador conservan exactamente sus permisos MySQL; Firebase no concede RBAC.
9. Observar errores, latencia, cuotas y coste durante al menos 48 horas antes de cualquier ampliación.

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
- confirmación de que no se importaron contraseñas ni hashes y el login local sigue disponible;
- presupuesto, cuotas, alertas y responsable operativo aprobados;
- revisión humana de seguridad y privacidad.
