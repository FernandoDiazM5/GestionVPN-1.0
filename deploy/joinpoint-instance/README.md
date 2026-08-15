# Imagen oficial de la instancia Joinpoint

Este directorio contiene componentes reproducibles para instalar una instancia aislada en el VPS de un cliente. Todavia no modifica ni despliega el VPS de produccion.

## Instalador por estados

`install.sh --check` solo verifica requisitos y no escribe nada. `--apply` exige la frase explicita `JOINPOINT_CONFIRM='INSTALAR JOINPOINT'`, genera la identidad Ed25519 dentro del VPS y consume el codigo de un solo uso. Si DNS aun no apunta a la IP declarada, conserva el estado protegido como `PENDING_DNS_TLS`; `--resume` retoma la misma instalacion sin consumir otro codigo.

El estado `READY_FOR_TLS` no significa que la instancia ya este publicada: deliberadamente no inicia contenedores hasta que el siguiente incremento emita o monte un certificado valido. El directorio `/opt/joinpoint` nunca se sobrescribe automaticamente.

## Composicion de servicios

`compose.yaml` declara MariaDB, backend, frontend y agente. La base de datos solo publica su puerto en loopback; el backend conserva red de host para alcanzar WireGuard/MikroTik, pero elimina capacidades Linux y aplica `no-new-privileges`; el agente usa filesystem de solo lectura, `tmpfs`, cero capacidades y una clave privada montada en solo lectura. Las integraciones del moderador permanecen desactivadas hasta que este ingrese sus propias credenciales.

La plantilla `.env.compose.example` documenta referencias, no credenciales utilizables. El instalador generara los secretos reales fuera del codigo y nunca reutilizara valores entre clientes.

Para el primer cliente se asume un VPS nuevo y una distribucion oficial completa indicada mediante `JOINPOINT_SOURCE_DIR`. La configuracion generada deja Telegram, Gemini, Firebase y el autosync de WireGuard apagados. El moderador incorporara sus propias credenciales y conectara su MikroTik local despues del primer acceso; ninguna integracion personal bloquea el arranque base.

Tras validar DNS, el instalador usa la imagen oficial fijada `certbot/certbot:v5.7.0` en modo standalone para el primer certificado. Exige correo ACME y aceptacion explicita de terminos, valida el certificado y conserva el material renovable fuera del codigo. Luego construye el agente, verifica la licencia inicial y elimina la respuesta temporal de activacion. El estado `READY_FOR_PLATFORM_BOOTSTRAP` todavia no inicia la aplicacion: falta preconfigurar el `/22` recomendado y superar los health gates.

La configuracion Nginx de la instancia se genera con el FQDN exacto y rechaza otros encabezados Host. Expone solamente el directorio ACME durante el desafio HTTP. `renew-tls.sh` renueva por webroot sin detener el panel, valida el nuevo certificado y recarga Nginx solo despues de que `nginx -t` tenga exito. El siguiente incremento instalara su timer de systemd junto con el arranque controlado.

## Agente de instancia

`Dockerfile.agent` construye solamente el agente y el protocolo criptografico compartido. Se ejecuta sin privilegios y no contiene claves, licencias ni datos de un cliente.

Los secretos se crean durante la instalacion y se montan desde el host. La clave privada de la instancia nunca debe incorporarse a la imagen. El estado del agente debe conservarse en un volumen exclusivo con permisos restrictivos.

Antes de iniciar el servicio continuo, el instalador debe:

1. generar localmente un par Ed25519;
2. enviar solo la clave publica junto con el codigo de activacion de un uso;
3. guardar la respuesta de activacion en un archivo temporal con modo `0600`;
4. ejecutar `npm run bootstrap --workspace=@joinpoint/instance-agent` con las variables `JOINPOINT_*`;
5. eliminar el archivo temporal y arrancar el agente.

La automatizacion integral de DNS, TLS, base de datos, backend, frontend y WireGuard corresponde al siguiente incremento. DNS y TLS deben quedar en estado pendiente si `<cliente>.joinpoint.cloud` aun no resuelve a la IP publica del VPS; el instalador no debe inventar ni solicitar credenciales globales dentro de la imagen.
