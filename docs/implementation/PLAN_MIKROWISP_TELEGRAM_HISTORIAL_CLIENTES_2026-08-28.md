# Plan acotado: MikroWisp + control de temas Telegram

Fecha: 2026-08-28  
Estado: fases 1–5 implementadas localmente; sin commit ni despliegue

## Progreso de implementación

- [x] Fase 1: integración MikroWisp read-only, cifrado, endpoint nominal, anti-SSRF, DTO por allowlist y pruebas negativas.
- [x] Fase 2: catálogos externos genéricos, sincronización manual y fallback `Pendiente de sincronizar`. Se admiten únicamente endpoints oficiales documentados: routers/nodos, equipos monitoreados y cajas NAP.
- [x] Fase 3: grupos, guía PDF y temas.
- [x] Fase 4: participantes conocidos, invitación individual verificada, retiro, reintegro y auditoría.
- [x] Fase 5: comandos de consulta efímera por tema y participante activo.
- [ ] Fase 6: migración local verificada; canary y despliegue pendientes de un grupo/bot de laboratorio.

El alcance de catálogos queda cerrado a los datos que intervienen operativamente con el cliente: routers/nodos (`GetRouters`), equipos monitoreados (`GetMonitoreo`) y cajas NAP (`GetCajasNap`). No se habilitan operadores, departamentos, tareas, VLAN, profiles, ODB ni otros catálogos, aunque estén publicados. La documentación oficial vigente tampoco publica una operación para listar planes o todos los servicios; no se inventa esa ruta.

### Contrato real confirmado de `GetClientsDetails`

La respuesta usa `estado` y un arreglo `datos`. La allowlist exacta conserva del cliente `id`, `nombre`, `estado`, `correo`, `telefono`, `movil`, `cedula` y `direccion_principal`; de cada servicio conserva `id`, `idperfil`, `nodo`, `costo`, `ipap`, `mac`, `ip`, `instalado`, `tiposervicio`, `status_user`, `coordenadas`, `direccion` y `perfil`; y de `facturacion` conserva `facturas_nopagadas` y `total_facturas`. `idperfil` usa el nombre incluido en `perfil`, sin abrir otro catálogo. `nodo` se resuelve exclusivamente contra `GetRouters` y, si falta, muestra `Pendiente de sincronizar`. Se eliminan usuario/clave PPP, comunidad SNMP, token y cualquier campo no reconocido.

Referencia técnica: [Telegram Bot API](https://core.telegram.org/bots/api).

## Objetivo

Crear en Joinpoint un módulo sencillo para administrar un supergrupo privado de Telegram con foro, sus temas por cliente y sus participantes. MikroWisp se usará únicamente para consultar datos actuales del cliente.

## Reglas confirmadas

1. **MikroWisp es estrictamente de solo lectura.** Joinpoint nunca creará, editará, activará, suspenderá, facturará ni modificará información en MikroWisp.
2. El ID de cliente MikroWisp es su identificador externo único dentro del workspace.
3. Los catálogos externos son extensibles; no se limitan a planes y nodos.
4. La actualización de catálogos será manual y bajo demanda.
5. Si falta un nombre de catálogo, la consulta no falla: muestra el ID recibido y `Pendiente de sincronizar`.
6. Nunca se muestran ni almacenan credenciales PPP/Hotspot, contraseñas, comunidad SNMP ni el token MikroWisp.
7. Joinpoint **no guarda mensajes, archivos ni conversaciones** del grupo. Todo ese contenido permanece sólo en Telegram.
8. Joinpoint conserva únicamente los metadatos necesarios para controlar grupos, temas y participantes.
9. El backend no tendrá un método genérico `request(ruta)`: el adaptador MikroWisp expondrá sólo consultas concretas incluidas en una allowlist.
10. Un workspace puede vincular varios grupos; cada grupo se vincula manualmente y se lista con sus temas conocidos.
11. Sólo el moderador del workspace puede vincular grupos, crear/cerrar/reabrir temas y agregar/retirar participantes. Los invitados sólo consultan e interactúan y no reciben controles administrativos.

## Módulo propuesto: Clientes en Telegram

### Grupo

- Joinpoint muestra una guía: crear manualmente el grupo en Telegram, convertirlo en supergrupo con foro, agregar el bot como administrador y pegar/enviar el código de vinculación.
- La guía breve permanece visible junto al formulario de vinculación y puede complementarse con un botón `Ver guía PDF`.
- Joinpoint no promete crear el grupo: el Bot API oficial no ofrece esa operación.
- Validar que tenga modo foro habilitado.
- Validar que el bot pueda administrar temas, invitaciones y retiros antes de activar el módulo.
- Mostrar nombre, estado del grupo y permisos faltantes.
- Un workspace puede vincular varios grupos. `Historial de clientes` es el grupo inicial recomendado, no un límite.
- La pantalla lista todos los grupos vinculados y, al abrir uno, sus temas conocidos y estados.
- Cada grupo completa su propio flujo manual de creación en Telegram y vinculación con Joinpoint.

### Guía PDF administrada

- El administrador de plataforma puede subir, reemplazar o desactivar un PDF de ayuda para esta integración.
- El usuario ve únicamente la versión activa junto al asistente de vinculación; si no hay PDF, conserva los pasos breves en pantalla y el flujo no se bloquea.
- En el MVP se guarda el archivo activo y sus metadatos mínimos: título, versión, fecha y administrador responsable; no se necesita una biblioteca documental completa.
- La carga acepta sólo PDF real validado por contenido y tipo, con límite de tamaño, nombre interno aleatorio y descarga autenticada. La ruta de almacenamiento no se expone públicamente.
- Cambiar la guía no modifica ni desconecta grupos ya vinculados.

### Carpetas de clientes

En Telegram son **temas del foro**.

- El dato mínimo para crear una carpeta es el ID del cliente.
- Normalizar el ID para que `0014` y `14` no creen carpetas distintas.
- Consultar MikroWisp por ese ID y exigir que la respuesta contenga exactamente al mismo cliente.
- Mostrar el nombre devuelto por MikroWisp en una vista previa; el operador confirma antes de crear.
- Crear el tema con formato obligatorio `ID · Nombre del cliente`.
- El ID debe ser el entero positivo confirmado por MikroWisp; el nombre final usa `${ID canónico} · ${nombre}`.
- Limpiar caracteres de control, espacios repetidos y ajustar el título al máximo de 128 caracteres de Telegram sin perder el ID.
- Evitar dos temas activos del mismo cliente.
- Listar y monitorear desde Joinpoint: cliente, ID, nombre del tema, identificador Telegram, estado, fecha y creador.
- Estados: activo, cerrado, eliminado o requiere reparación.
- Abrir el tema directamente en Telegram.
- Cerrar, reabrir o recrear el tema con confirmación.
- Registrar un tema preexistente mediante un comando administrativo ejecutado dentro de ese tema, porque el Bot API no ofrece una operación para listar todos los temas históricos del foro.

Joinpoint no lee ni replica lo escrito dentro del tema.

Estados internos de creación: `VALIDATING`, `READY`, `CREATING`, `ACTIVE`, `CREATE_UNKNOWN`, `REPAIR_REQUIRED`, `CLOSED`.

### Participantes

- Listar usuarios Joinpoint autorizados y su vinculación Telegram.
- Mostrar estado: invitación pendiente, miembro activo, retirado o no verificado.
- **Agregar:** desde Joinpoint se ordena al bot generar una invitación individual o aprobar una solicitud de ingreso. Telegram no permite forzar el alta silenciosa de una persona.
- **Retirar:** desde Joinpoint se ordena al bot retirar o bloquear al usuario del supergrupo.
- **Reintegrar:** levantar el bloqueo si corresponde y emitir una invitación nueva.
- Auditar quién invitó, aprobó, retiró o reintegró a una persona.

La membresía es para todo el grupo: Telegram no permite dar acceso a un tema y ocultar los demás a ese mismo miembro.

Joinpoint controlará participantes conocidos: usuarios vinculados, invitados o detectados por eventos recibidos mientras el bot esté activo. El Bot API permite consultar un miembro conocido, administradores y conteos, pero no descargar la lista completa de integrantes. La interfaz no debe presentar el registro local como un censo total de Telegram.

Las invitaciones deben ser individuales, con vencimiento y un solo uso. Si se usa solicitud de ingreso, Joinpoint sólo la aprueba después de relacionar la identidad Telegram con el usuario esperado. Retirar usa la operación administrativa del bot; reintegrar exige desbloquear y emitir una nueva invitación.

Implementación local de fase 4: la lista parte de los usuarios vigentes del workspace y muestra si tienen el bot del workspace vinculado. El bot crea un enlace con vencimiento de 24 horas y `creates_join_request`; al recibir `chat_join_request` exige que coincidan grupo, Telegram user ID, enlace exacto y vigencia. Una solicitud desconocida o con enlace reenviado se rechaza. El ingreso confirmado pasa a `ACTIVE`; retirar bloquea al usuario en el grupo completo y revoca su invitación; reintegrar desbloquea y emite una invitación nueva. Los eventos `chat_member` observados actualizan participantes conocidos que salen o son retirados. Todas las acciones administrativas quedan auditadas.

### Consulta dentro del tema

- `/informacion`: ID, nombre, estado, correo, teléfono, móvil, documento y dirección principal.
- `/servicios`: ID, perfil, nodo, costo, IP de AP, MAC, IP, fecha de instalación, tipo, estado de usuario, coordenadas, dirección y nombre del perfil.
- `/facturacion`: resumen de deuda, cantidad y total de facturas pendientes, sin datos de pago sensibles.
- `/ayuda`: comandos disponibles.

El bot identifica al cliente por el tema; el usuario no vuelve a escribir su ID. Cada comando consulta MikroWisp en ese momento y descarta la respuesta después de mostrarla.

Implementación local de fase 5: el bot resuelve `grupo + message_thread_id` contra un tema `ACTIVE` y exige que `message.from.id` corresponda a un participante conocido `ACTIVE` del mismo grupo. `/informacion`, `/servicios` y `/facturacion` consultan `GetClientsDetails` en ese momento y formatean únicamente su subconjunto de allowlist; `/ayuda` valida el mismo acceso pero no consulta MikroWisp. La respuesta se publica en el mismo `message_thread_id` y no se persiste. Un tema no registrado, cerrado o un usuario no activo recibe denegación sin datos del cliente.

### Política de campos MikroWisp

Se usa una allowlist de salida. Sólo pasan los campos necesarios para identificar al cliente, contactarlo, ubicar su servicio y conocer su estado:

- cliente: ID, nombre, estado, correo, teléfono, móvil, documento y dirección principal;
- servicio: ID, ID de perfil, nodo, costo, IP de AP, MAC, IP, fecha de instalación, tipo, estado de usuario, coordenadas, dirección y perfil;
- facturación: cantidad de facturas no pagadas y total pendiente;
- catálogos: ID externo y nombre visible.

Se descartan siempre, aunque MikroWisp los devuelva: usuario y clave PPP/PPPoE, credenciales Hotspot, contraseñas, tokens, API keys, secretos, comunidades SNMP, cookies, sesiones y cualquier campo futuro no reconocido. El filtrado ocurre en backend antes de guardar, registrar o enviar datos a Telegram. Los datos de cliente son efímeros y los logs no conservan la respuesta completa.

## Datos mínimos en Joinpoint

| Registro | Datos permitidos |
| --- | --- |
| Integración MikroWisp | URL, token cifrado, estado y fecha de validación. |
| Catálogo externo | Tipo, ID externo, nombre visible y última sincronización. |
| Grupo Telegram | Workspace, chat ID, nombre y estado. |
| Tema Telegram | Grupo, ID externo del cliente, nombre visible, thread ID y estado. |
| Participante | Usuario Joinpoint, Telegram user ID, estado de membresía y fechas. |
| Auditoría | Actor, acción administrativa, resultado y fecha. |
| Guía de integración | Clave de integración, título, versión, archivo protegido, estado activo, autor y fecha. |

No se crean tablas para mensajes, adjuntos ni historial de conversación.

## Barreras de solo lectura MikroWisp

La regla se aplica en profundidad:

1. **UI:** no existen botones ni formularios para modificar MikroWisp.
2. **API Joinpoint:** sólo endpoints internos `GET/consulta` con validación de filtros; ningún proxy de ruta libre.
3. **Adaptador:** métodos nominales como `getClientDetails`; allowlist exacta de URL, método y campos enviados.
4. **Red:** URL base validada y fijada por integración para impedir SSRF o redirecciones a destinos no aprobados.
5. **Datos:** DTO de salida por allowlist exacta con los campos de cliente, servicio y facturación confirmados arriba. Elimina PPP/PPPoE, Hotspot, passwords, token, API keys, SNMP y campos futuros no reconocidos.
6. **Pruebas:** contrato que falla si aparece una ruta mutadora o si el adaptador acepta una ruta arbitraria.
7. **Observabilidad:** logs guardan resultado, latencia y código interno, nunca token ni request/response completos.

## Flujo principal

```mermaid
flowchart TD
  A["Ingresar ID de cliente"] --> B["Normalizar ID"]
  B --> C{"Tema ya registrado?"}
  C -- "Sí" --> D["Mostrar Ya está creado + abrir tema"]
  C -- "No" --> E["Consultar MikroWisp en modo lectura"]
  E --> F{"Coincidencia exacta?"}
  F -- "No" --> G["Informar cliente no encontrado o respuesta ambigua"]
  F -- "Sí" --> H["Vista previa ID · Nombre"]
  H --> I["Confirmar creación"]
  I --> J["Reservar registro CREATING"]
  J --> K["Crear tema en Telegram"]
  K --> L{"Respuesta confirmada?"}
  L -- "Sí" --> M["Guardar thread ID y marcar ACTIVE"]
  L -- "Timeout/ambigua" --> N["Marcar CREATE_UNKNOWN y no reintentar"]
  M --> O["Comandos consultan el cliente del tema"]
```

## Validaciones y conflictos

| Escenario | Comportamiento esperado |
| --- | --- |
| ID vacío, negativo o inválido | Bloquear antes de llamar MikroWisp. |
| Usuario escribe `0014` y existe `14` | Normalizar al mismo ID canónico y evitar duplicado. |
| MikroWisp devuelve cero clientes | Mostrar `Cliente no encontrado`; no crear tema. |
| MikroWisp devuelve otro ID o varios resultados | Marcar respuesta ambigua; no crear tema. |
| Cliente válido | Mostrar vista previa con ID y nombre; crear sólo tras confirmación. |
| Tema ya registrado | Mostrar `Ya está creado`, estado y botón para abrirlo; no llamar Telegram. |
| Dos operadores crean simultáneamente | Restricción única y bloqueo transaccional: sólo uno llega a Telegram. |
| Telegram acepta pero la respuesta vence | Estado `CREATE_UNKNOWN`; prohibido reintento automático para no duplicar. |
| Telegram crea y luego falla guardar en BD | Intentar eliminar/cerrar el tema como compensación; si no se confirma, dejar alerta de reparación. |
| Tema creado manualmente fuera de Joinpoint | No puede descubrirse por listado; un administrador lo registra desde ese tema antes de crear otro. |
| Tema fue borrado manualmente | Marcar `REPAIR_REQUIRED` al recibir el evento o al fallar una operación; recrear sólo con confirmación. |
| Nombre del cliente cambió | Mostrar diferencia y ofrecer renombrar el tema manualmente; no hacerlo en cada consulta. |
| Nombre demasiado largo/caracteres extraños | Sanitizar y truncar sólo el nombre, conservando siempre el ID. |
| Cliente tiene varios servicios | Mantener un solo tema por cliente y listar servicios dentro de él. |
| Cliente suspendido o retirado | Advertir el estado, pero no borrar automáticamente su tema. |
| Bot sin permiso o grupo sin foro | Bloquear creación y mostrar el paso exacto de la guía que falta. |
| MikroWisp/Telegram no disponible | Error temporal, sin crear registro `ACTIVE` falso ni repetir llamadas ambiguas. |
| Catálogo no sincronizado | Mostrar ID + `Pendiente de sincronizar`; no bloquear la carpeta ni la consulta. |
| Mismo ID en otro workspace | Permitido y aislado; la unicidad siempre incluye `workspace_id + group_id`. |

## Fases de implementación

1. **MikroWisp read-only:** integración cifrada, adaptador sin ruta genérica, allowlist exacta, filtrado de secretos y pruebas negativas de escritura.
2. **Catálogos extensibles:** tabla genérica, sincronización manual y fallback al ID.
3. **Grupo, guía y temas:** publicar pasos breves y PDF administrable, validar foro/permisos, crear/listar los temas conocidos, cerrar/reparar, registrar temas preexistentes y evitar duplicados.
4. **Participantes:** invitación individual/aprobación, eventos futuros, verificación de usuarios conocidos, retiro, reintegro y auditoría.
5. **Comandos de consulta:** respuestas filtradas dentro del tema correspondiente.
6. **Canary:** probar primero en un grupo de laboratorio y luego desplegar con backup/rollback.

Avance local de fase 6: el 2026-08-28 se levantó MariaDB/XAMPP y se detectó antes del despliegue que las nuevas FK usaban tipo/intercalación incompatibles con `users.id` y `workspaces.id`. Se corrigieron los UUID relacionados a `CHAR(36)` y se fijó `utf8mb4_unicode_ci`. La inicialización creó correctamente nueve tablas nuevas y 17 FK, y una repetición confirmó idempotencia. La advertencia preexistente de `core_provision_runs` no pertenece a esta funcionalidad. El canary real no puede ejecutarse hasta disponer de un bot del workspace, supergrupo privado con foro y usuario piloto vinculados en un entorno de laboratorio; producción no debe usarse como sustituto del canary.

## Criterios de aceptación

- Ninguna operación de escritura MikroWisp es invocable.
- El adaptador no acepta rutas arbitrarias ni puede convertirse en proxy hacia MikroWisp.
- Ningún mensaje contiene credenciales o secretos.
- Los campos PPP/PPPoE, Hotspot, contraseñas, tokens, API keys, SNMP y campos desconocidos se eliminan antes de cualquier persistencia, log o envío a Telegram.
- Un catálogo faltante no rompe la consulta.
- No existen temas duplicados para el mismo cliente.
- El ID se normaliza y la unicidad se aplica antes de llamar a Telegram.
- Un timeout ambiguo nunca dispara un reintento automático.
- Joinpoint refleja temas eliminados o desincronizados.
- El administrador puede reemplazar o desactivar la guía PDF y el usuario sólo puede abrir la versión activa mediante acceso autenticado.
- La ausencia o falla del PDF no impide completar la vinculación con la guía en pantalla.
- La UI diferencia temas/participantes controlados de un inventario completo, que Telegram no proporciona.
- Un usuario retirado pierde acceso al grupo completo.
- Una invitación no equivale a miembro activo hasta que Telegram confirme el ingreso.
- MySQL no almacena conversaciones ni adjuntos de Telegram.

## Decisiones cerradas

1. El workspace admite varios grupos vinculados y Joinpoint lista cada grupo con sus temas conocidos.
2. Sólo el moderador administra grupos, temas y participantes; los invitados no pueden crear, cerrar ni eliminar.
3. Los únicos catálogos habilitados son routers/nodos (`GetRouters`), equipos monitoreados (`GetMonitoreo`) y cajas NAP (`GetCajasNap`), siempre con clientes nominales de solo lectura.
4. Los comandos sólo muestran la allowlist operativa anterior; toda credencial o llave se elimina.
