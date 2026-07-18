# Invariantes de seguridad del backend

Este archivo es referencia normativa para cualquier cambio en `server/` y `packages/contracts/`. “La UI ya lo valida” nunca es una excepción válida.

## 1. Entradas externas

- Validar en servidor `req.body`, `req.params` y `req.query` antes de usarlos.
- Usar Zod y preferir schemas compartidos en `@gestionvpn/contracts` cuando el contrato también lo consuma React.
- Definir tipo, longitud, rango, cardinalidad y enum/allowlist.
- Rechazar claves desconocidas en operaciones sensibles.
- Validar IP, CIDR, puerto, UUID, public key, VRF, PPP user y nombres mediante schemas dedicados.
- No “sanitizar” quitando caracteres peligrosos como defensa principal. Validar estructura y usar encoding/parametrización en el sink.
- Limitar tamaño JSON y uploads antes de procesarlos.
- Un fallo de validación devuelve `400 VALIDATION_ERROR`; no incluye stack, SQL, path local ni valor secreto.

## 2. Identidad y autorización

- Cookie HttpOnly `vpn_session` es el único transporte web de sesión.
- No aceptar JWT por query, localStorage o Bearer desde el SPA.
- Identidad no implica autorización: validar `workspace_id`, rol y pertenencia del recurso en servidor.
- `MEMBER` nunca obtiene capacidad de moderador por valores enviados por el cliente.
- La comprobación de estado de cuenta es fail-closed. Si no puede verificarse, responder 503 y no ejecutar la operación.
- Suspensión, eliminación, cambio de password y cierre global revocan sesiones según la política vigente.
- Toda mutación con cookie debe pasar la defensa CSRF/Origin definida por la plataforma.

## 3. Respuestas de autenticación

- Login público usa mensaje, código HTTP y shape genéricos para todos los fallos de cuenta/credencial.
- Registro, resend y recuperación no confirman si un email existe.
- Evitar diferencias de trabajo observables: usuario inexistente ejecuta una verificación de hash dummy.
- La causa interna puede medirse con labels de baja cardinalidad; nunca incluir email/IP/user ID en Prometheus.
- Logs de seguridad no incluyen password, hash, OTP, token, cookie, clave privada ni payload de credenciales.

## 4. Rate limiting

- Ejecutar el guard antes de bcrypt/Argon2, SMTP o llamadas externas costosas.
- Todo endpoint de login, setup, registro, OTP y reset debe declarar un limitador.
- Producción requiere estado compartido/persistente; un contador en memoria no es defensa suficiente.
- Aplicar buckets independientes por IP e identidad seudonimizada.
- La IP procede de `req.ip` tras configurar exactamente la cadena de proxy; no confiar directamente en cabeceras reenviadas.
- Responder 429 genérico con `Retry-After`.
- Probar concurrencia, reinicios, múltiples instancias y spoof de proxy.

## 5. Contraseñas y tokens

- Contraseñas nuevas: Argon2id mediante `lib/passwordHasher`; no invocar el algoritmo desde rutas/repositorios.
- Hashes bcrypt existentes sólo se verifican para migración y nunca vuelven a escribirse.
- Nunca almacenar password en texto plano ni cifrarlo de forma reversible.
- Los tokens aleatorios de reset se almacenan sólo como hash, expiran y son single-use.
- OTP y tokens no reutilizan automáticamente la política de contraseñas; documentar entropía, intentos y expiración.
- No registrar valores ni pegarlos en documentación/handoff.

## 6. SQL y otros sinks

- Toda consulta usa placeholders para valores externos.
- No concatenar ni interpolar entrada externa en SQL.
- Tabla, columna y dirección de orden sólo salen de mapas allowlist constantes.
- No usar `eval`, `new Function` ni shell construido con strings.
- Para RouterOS, SSH y comandos, validar cada argumento y usar APIs estructuradas cuando existan.
- Una validación SQL no vuelve seguro un valor para HTML/shell/router; aplicar controles por contexto.

## 7. XSS y contenido

- React renderiza datos como texto por defecto.
- `dangerouslySetInnerHTML` requiere revisión de seguridad, DOMPurify con allowlist mínima y prueba XSS.
- Los templates HTML de correo escapan todos los valores variables.
- URLs externas requieren protocolo/host permitido según el flujo.
- CSP/Helmet es defensa en profundidad, no reemplaza encoding ni validación.

## 8. Secretos y criptografía

- Secretos se inyectan por entorno/secret store y nunca se versionan.
- Claves persistentes no se generan dentro de una imagen efímera sin volumen seguro.
- Archivos de claves usan permisos mínimos.
- JWT soportará rotación active/previous con `kid`; no rotar borrando la única clave sin plan de sesión.
- No inventar algoritmos criptográficos.

## 9. Dependencias y proveedores

- Un BaaS autentica identidad; RBAC/workspace continúa verificado por Express/MySQL.
- Verificar issuer, audience, firma, expiración y revocación de tokens externos.
- Service accounts nunca viven en el repo.
- Toda dependencia nueva requiere justificación, versión mantenida y revisión de vulnerabilidades.

## 10. Pruebas obligatorias

- caso feliz y casos inválidos de cada schema;
- bypass directo por HTTP, no sólo interacción React;
- RBAC y tenant scope negativos;
- SQLi/XSS/command payloads como datos inertes;
- rate limit secuencial, concurrente y distribuido;
- respuesta genérica y dummy hash;
- redacción de logs;
- Semgrep, auditoría de dependencias, tests y `check:all`.

Una excepción necesita comentario junto al código, riesgo, mitigación compensatoria, propietario y fecha de revisión. No usar `nosemgrep` sin una justificación específica.
