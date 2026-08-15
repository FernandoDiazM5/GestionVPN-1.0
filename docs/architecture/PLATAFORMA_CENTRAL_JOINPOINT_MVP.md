# Plataforma Central Joinpoint — contrato MVP

## Objetivo

Separar el control comercial y de licencias de la operación de red. La plataforma central administra clientes, planes, instancias y activaciones; cada cliente opera en un VPS independiente. La indisponibilidad o suspensión comercial nunca elimina configuraciones ni desmonta WireGuard.

## Fuentes de verdad

- `platform_settings.root_domain`: dominio raíz vigente; inicia en `joinpoint.cloud`.
- `product_instances.subdomain_label`: label estable y único del cliente.
- FQDN efectivo: se deriva en tiempo de lectura como `<subdomain_label>.<root_domain>`; no se persiste una copia susceptible de quedar desactualizada.
- `activation_codes.code_digest`: huella HMAC del código; el código en claro sólo se entrega una vez.
- `instance_identities`: clave pública que sustituye al código después de activar.
- `subscriptions` + `plan_entitlements`: autoridad comercial y capacidades.
- `network_allocations`: reserva central de supernets `/22` para evitar conflictos futuros.

## Activación de un solo uso

1. El Administrador crea cliente, instancia, plan, subdominio y reserva `/22`.
2. La plataforma emite un código aleatorio con expiración máxima recomendada de 24 horas.
3. Sólo se guarda su huella HMAC; el secreto servidor `ACTIVATION_CODE_PEPPER` vive fuera de la BD y del repositorio.
4. El instalador presenta el código una sola vez junto con la clave pública recién generada en el VPS.
5. Una transacción bloquea la fila del código, comprueba `ISSUED`, vigencia e instancia, registra la identidad y cambia el código a `CONSUMED`.
6. La plataforma devuelve una licencia firmada. Las comunicaciones posteriores usan la identidad de la instancia, nunca el código.

## Cambio de dominio raíz

Un cambio de `joinpoint.cloud` a otro dominio es una migración, no una edición inmediata:

1. Validar propiedad y control DNS del dominio nuevo.
2. Crear registros para todos los labels activos.
3. Emitir certificados individuales; nunca distribuir una llave wildcard compartida.
4. Actualizar URLs, CORS, callbacks e integraciones.
5. Confirmar salud HTTPS de cada instancia.
6. Activar el nuevo dominio raíz con control de versión.
7. Mantener el dominio anterior y redirecciones durante la ventana acordada.
8. Retirar el anterior sólo cuando no existan instancias pendientes.

## Límite de este incremento

La API administrativa local permite el CRUD inicial de clientes/planes, creación y listado de instancias, reserva automática del `/22` libre más bajo y emisión/listado/revocación de activaciones. El Bearer provisional fue retirado: el acceso usa contraseña derivada con `scrypt`, TOTP cifrado, sesión opaca en cookie segura y CSRF en escrituras. El servidor continúa escuchando sólo en `127.0.0.1`; no se publicará una UI hasta completar TLS, recuperación de cuenta y canary operativo.

Todavía no crea clientes reales, no emite licencias productivas, no expone el consumo público de activaciones, no modifica DNS, no despliega VPS y no conecta la instancia actual con el control plane.
