# Imagen oficial de la instancia Joinpoint

Este directorio contiene componentes reproducibles para instalar una instancia aislada en el VPS de un cliente. Todavia no modifica ni despliega el VPS de produccion.

## Instalador por estados

`install.sh --check` solo verifica requisitos y no escribe nada. `--apply` exige la frase explicita `JOINPOINT_CONFIRM='INSTALAR JOINPOINT'`, genera la identidad Ed25519 dentro del VPS y consume el codigo de un solo uso. Si DNS aun no apunta a la IP declarada, conserva el estado protegido como `PENDING_DNS_TLS`; `--resume` retoma la misma instalacion sin consumir otro codigo.

El estado `READY_FOR_TLS` no significa que la instancia ya este publicada: deliberadamente no inicia contenedores hasta que el siguiente incremento emita o monte un certificado valido. El directorio `/opt/joinpoint` nunca se sobrescribe automaticamente.

## Distribucion de imagenes

Las imagenes de aplicacion no se compilan en el VPS. Una version inmutable publicada por el workflow
`.github/workflows/publish-joinpoint-images.yml` produce:

- `ghcr.io/fernandodiazm5/joinpoint-backend:<version>`;
- `ghcr.io/fernandodiazm5/joinpoint-frontend:<version>`;
- `ghcr.io/fernandodiazm5/joinpoint-agent:<version>`.

El instalador exige `JOINPOINT_SOFTWARE_VERSION`, rechaza `latest` y descarga las tres imagenes antes
del bootstrap. Para un rollout fijado por digest pueden definirse explicitamente
`JOINPOINT_BACKEND_IMAGE`, `JOINPOINT_FRONTEND_IMAGE` y `JOINPOINT_AGENT_IMAGE` con referencias
`ghcr.io/...@sha256:...`. Si los paquetes permanecen privados, el operador debe autenticar Docker
contra GHCR antes de ejecutar el instalador; esas credenciales no se reciben ni almacenan en Joinpoint.

La publicacion se inicia con una etiqueta Git `joinpoint-v<version>` o manualmente indicando una
version. No se genera una etiqueta mutable `latest`. Cuando se publica una etiqueta Git, el mismo
workflow adjunta a su GitHub Release `joinpoint-installer-<version>.tar.gz` y su checksum SHA-256.
Ese paquete contiene solamente Compose, instalador, renovacion TLS, plantilla Nginx y este runbook;
el VPS no necesita clonar el monorepo.

## Composicion de servicios

`compose.yaml` declara MariaDB, backend, frontend y agente. La base de datos solo publica su puerto en loopback; el backend conserva red de host para alcanzar WireGuard/MikroTik, pero elimina capacidades Linux y aplica `no-new-privileges`; el agente usa filesystem de solo lectura, `tmpfs`, cero capacidades y una clave privada montada en solo lectura. Las integraciones del moderador permanecen desactivadas hasta que este ingrese sus propias credenciales.

La plantilla `.env.compose.example` documenta referencias, no credenciales utilizables. El instalador generara los secretos reales fuera del codigo y nunca reutilizara valores entre clientes.

Para el primer cliente se asume un VPS nuevo. `JOINPOINT_SOURCE_DIR` apunta al paquete oficial del
instalador y sus plantillas, no al codigo usado para construir los contenedores. La configuracion
generada deja Telegram, Gemini, Firebase y el autosync de WireGuard apagados. El moderador incorporara
sus propias credenciales y conectara su MikroTik local despues del primer acceso; ninguna integracion
personal bloquea el arranque base.

Tras validar DNS, el instalador usa la imagen oficial fijada `certbot/certbot:v5.7.0` en modo standalone para el primer certificado. Exige correo ACME y aceptacion explicita de terminos, valida el certificado y conserva el material renovable fuera del codigo. Luego descarga y prepara el agente, verifica la licencia inicial y elimina la respuesta temporal de activacion.

La configuracion Nginx de la instancia se genera con el FQDN exacto y rechaza otros encabezados Host. Expone solamente el directorio ACME durante el desafio HTTP. `renew-tls.sh` renueva por webroot sin detener el panel, valida el nuevo certificado y recarga Nginx solo despues de que `nginx -t` tenga exito.

El arranque greenfield ejecuta primero MariaDB y backend. Las migraciones preconfiguran transaccionalmente el `/22` recomendado por Central, pero el Administrador todavia puede cambiarlo durante el primer asistente mientras no existan sitios ni se haya preparado el Core. Solo tras salud MySQL se inician frontend y agente. Si falla backend, HTTPS o agente, se detienen esos tres servicios y se preserva MariaDB con todos sus volumenes. Al completar los gates se habilita un timer systemd de renovacion TLS cada 12 horas con demora aleatoria.

## Agente de instancia

`Dockerfile.agent` construye solamente el agente y el protocolo criptografico compartido. Se ejecuta sin privilegios y no contiene claves, licencias ni datos de un cliente.

Los secretos se crean durante la instalacion y se montan desde el host. La clave privada de la instancia nunca debe incorporarse a la imagen. El estado del agente debe conservarse en un volumen exclusivo con permisos restrictivos.

Antes de iniciar el servicio continuo, el instalador debe:

1. generar localmente un par Ed25519;
2. enviar solo la clave publica junto con el codigo de activacion de un uso;
3. guardar la respuesta de activacion en un archivo temporal con modo `0600`;
4. ejecutar `npm run bootstrap --workspace=@joinpoint/instance-agent` con las variables `JOINPOINT_*`;
5. eliminar el archivo temporal y arrancar el agente.

DNS y TLS quedan en estado pendiente si `<cliente>.joinpoint.cloud` aun no resuelve a la IP publica del VPS; el instalador no inventa ni solicita credenciales globales dentro de la imagen. La configuracion automatica de WireGuard y del MikroTik Core sigue fuera de este paquete y debe completarse antes del primer cliente productivo.
