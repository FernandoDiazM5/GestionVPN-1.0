# Plan de rendimiento y navegación multiusuario

## Objetivo

Conseguir que el cambio entre `Sitios`, `Buscar equipos`, `Mi equipo`,
`Estado de antenas` y `Configuración` responda visualmente en menos de 100 ms,
reutilice datos vigentes y actualice en segundo plano, sin mezclar información
entre usuarios, espacios de trabajo o roles.

Este plan no cambia las reglas de autorización: el backend seguirá validando la
sesión, el workspace y los permisos en cada petición.

## Principios obligatorios

1. La navegación nunca espera una API.
2. La última información válida permanece visible durante una revalidación.
3. La caché se segmenta por recurso y `workspace_id`; se añade `user_id` o un
   alcance de permisos cuando la respuesta dependa del usuario.
4. Contraseñas SSH, cookies, tokens y secretos no entran en TanStack Query,
   localStorage ni cachés persistentes.
5. Logout, expiración de sesión, cambio de workspace y pérdida de permisos
   cancelan solicitudes, cierran eventos y purgan la caché correspondiente.
6. Las mutaciones actualizan o invalidan sólo las claves afectadas.
7. Una sola conexión SSE general por pestaña distribuye los eventos del
   workspace. `/api/tunnel/events` permanece separado por su ciclo propio.
8. Caché y SSE mejoran rendimiento, pero nunca sustituyen la autorización.

## Fase 0 — Línea base y observabilidad

### Trabajo

- Añadir a Nginx un formato de access log con `$request_time`,
  `$upstream_response_time`, `$bytes_sent` y estado de caché.
- Añadir marcas de navegador:
  `navigation-click`, `module-visible`, `cached-data-visible` y
  `fresh-data-applied`.
- Medir primera visita y visita repetida para cada módulo.
- Registrar cantidad de peticiones por transición y conexiones SSE por sesión.
- Obtener P50/P95 con escritorio, móvil, red rápida y red limitada.

### Aceptación

- Existe una medición reproducible antes de optimizar.
- Se puede separar descarga, parseo/render y tiempo de API.
- No se registran identificadores sensibles ni contenido de respuestas.

## Fase 1 — Precarga segura de módulos

### Trabajo

- Crear un registro único de importadores dinámicos por módulo.
- Reutilizar esos importadores tanto en `React.lazy` como en la precarga.
- Precargar al `pointerenter`, `focus` y comienzo de interacción del menú.
- Precargar en tiempo ocioso `Sitios` y `Buscar equipos`, con fallback cuando
  `requestIdleCallback` no exista.
- No precargar módulos no visibles para el rol.
- Mantener `Suspense` y el límite de errores para fallos de descarga.
- Usar transición React para que el clic mantenga la interfaz receptiva.

### Escenarios

- Red offline durante la precarga: no bloquear el clic; permitir reintento.
- Chunk antiguo después de un deploy: recargar una sola vez ante error de
  importación versionada, evitando bucles.
- Usuario móvil sin hover: precarga por foco/touch/tiempo ocioso.
- Rol cambiado: no conservar acceso a un módulo ya no permitido.

### Aceptación

- Una vista precargada aparece sin esperar la descarga al hacer clic.
- No aumenta de forma descontrolada la descarga inicial.
- Los permisos siguen determinando qué módulos pueden solicitarse.

## Fase 2 — Compresión y entrega HTTP

### Trabajo

- Habilitar Brotli si la imagen Nginx lo soporta; gzip como fallback.
- Comprimir JS, CSS, JSON, SVG y fuentes; excluir respuestas SSE.
- Conservar para assets versionados:
  `Cache-Control: public, max-age=31536000, immutable`.
- Mantener `index.html` con revalidación corta para descubrir nuevos hashes.
- Verificar HTTP/2, `Vary: Accept-Encoding` y tipos MIME.

### Aceptación

- Los chunks JS responden con `br` o `gzip`.
- SSE continúa sin buffering ni compresión problemática.
- Una nueva versión no queda atrapada por la caché del HTML.

## Fase 3 — Capa de datos compartida

### Trabajo

- Incorporar TanStack Query y un `QueryClient` por sesión autenticada.
- Definir una fábrica de claves; ejemplos:

```ts
['nodes', workspaceId]
['devices', workspaceId]
['ap-monitor', workspaceId, nodeId]
['team', workspaceId]
['account', userId]
```

- Incluir `userId` o una huella de alcance cuando dos roles obtengan resultados
  diferentes dentro del mismo workspace.
- Valores iniciales recomendados:
  - nodos/equipos: `staleTime` 30–60 s;
  - sesión/permisos: más corto y revalidación explícita;
  - métricas vivas: actualizadas por SSE, con respaldo controlado;
  - `gcTime`: 5–10 min en memoria.
- Desactivar persistencia de la caché en la primera versión.
- Usar `AbortSignal` para cancelar peticiones al cerrar sesión o cambiar ámbito.
- Reintentar sólo lecturas idempotentes y errores transitorios, con backoff y
  jitter; no reintentar 401, 403 ni validaciones 4xx.

### Aceptación

- `Buscar equipos` y `Estado de antenas` comparten una única consulta de equipos.
- Solicitudes concurrentes iguales se deduplican dentro de la pestaña.
- Volver a una vista vigente no genera una nueva pantalla de carga.

## Fase 4 — Migración incremental por recurso

### Orden

1. Equipos (`/api/db/devices`), porque actualmente se duplica entre dos vistas.
2. Sitios (`/api/nodes`), eliminando el temporizador fijo de dos segundos.
3. Monitor de antenas.
4. Equipo, configuración y consultas administrativas.

### Reglas de migración

- Mantener la información anterior con `placeholderData` durante la revalidación.
- Mostrar skeleton completo sólo cuando nunca existieron datos.
- Mostrar “Actualizando…” en el control local, no bloquear la página.
- Después de crear/editar/eliminar/mover:
  - actualizar optimistamente sólo si el rollback es inequívoco;
  - en operaciones de red críticas, confirmar backend primero;
  - invalidar exclusivamente las claves afectadas.
- Evitar dos fuentes de verdad entre contextos React y Query.

### Aceptación

- No queda ningún `deviceDb.load()` duplicado al montar ambas vistas.
- Sitios revalida inmediatamente en segundo plano, sin `setTimeout(2000)`.
- Un fallo conserva datos anteriores y muestra una advertencia no bloqueante.

## Fase 5 — SSE centralizado

### Trabajo

- Montar un proveedor SSE general una sola vez por sesión autenticada.
- Suscribirse una vez a `/api/events/stream`.
- Distribuir `tunnel`, `ap-poll` y futuros eventos por tipo.
- Actualizar las claves de TanStack Query correspondientes.
- Mantener `/api/tunnel/events` como canal separado mientras conserve semántica
  y contrato distintos.
- Implementar reconexión con backoff, jitter y límite; respetar estado offline.
- Al reconectar, revalidar sólo los recursos que pudieron perder eventos.
- Ignorar eventos de otro workspace y eventos con versión/fecha anterior.

### Escenarios

- Evento duplicado o fuera de orden.
- Desconexión larga y pérdida de eventos.
- Sesión expirada durante reconexión.
- Cambio de workspace con una conexión anterior todavía cerrándose.
- Muchas pestañas del mismo usuario. Cada pestaña queda aislada; opcionalmente
  `BroadcastChannel` puede coordinar invalidaciones, nunca compartir secretos.

### Aceptación

- Existe una sola conexión a `/api/events/stream` por pestaña.
- No se multiplican listeners al navegar repetidamente.
- Un evento sólo modifica el workspace y recurso correspondientes.

## Fase 6 — Ciclo de sesión y aislamiento

### Trabajo

- En logout o expiración:
  1. detener SSE/polling;
  2. cancelar consultas;
  3. limpiar `QueryClient`;
  4. limpiar cachés temporales y credenciales;
  5. revocar el túnel mediante el flujo servidor existente.
- En cambio de workspace o identidad, crear un nuevo ámbito de caché y purgar el
  anterior antes de presentar datos.
- En cambio de rol/permisos, refrescar sesión, retirar módulos no autorizados y
  eliminar consultas cuyo alcance ya no sea válido.
- Pausar polling/revalidación al ocultar la pestaña; revalidar al volver sólo si
  los datos vencieron.
- Tratar 401 como cierre de sesión coordinado y 403 como pérdida de permiso, sin
  reintentos automáticos.

### Aceptación

- Dos usuarios consecutivos en el mismo navegador nunca ven datos entre sí.
- Cambiar workspace no muestra ni un frame de información anterior.
- Logout no deja solicitudes, eventos ni temporizadores activos.

## Fase 7 — Experiencia de carga y errores

### Trabajo

- Respuesta visual al clic menor de 100 ms.
- Mantener menú, cabecera y contenido previo estable durante una transición.
- Skeleton localizado únicamente para datos sin caché.
- Indicadores independientes por tabla, botón y mutación.
- Estados offline y datos desactualizados claramente diferenciados.
- Botón de reintento para errores recuperables.
- No sustituir contenido válido por una pantalla vacía ante errores temporales.

## Fase 8 — Pruebas obligatorias

### Unitarias y de integración

- Fábrica de query keys y aislamiento por workspace/usuario/rol.
- Deduplicación de consultas.
- Invalidación exacta tras cada mutación.
- Cancelación por logout/cambio de workspace.
- Datos anteriores durante revalidación y rollback de errores.
- Eventos SSE duplicados, tardíos, de otro workspace y reconexión.
- Precarga por hover, foco, touch e idle.
- Error de chunk y recuperación sin bucle.

### E2E

- Dos usuarios y dos workspaces en navegadores independientes.
- Cambio rápido repetido entre Sitios, Buscar equipos y Monitor.
- Varias pestañas, logout en una y expiración de sesión.
- Red lenta, offline/online y backend temporalmente indisponible.
- Deploy mientras una pestaña conserva chunks antiguos.
- 20–50 sesiones simultáneas con SSE y consultas compartidas por pestaña.

### Seguridad

- Ninguna query key, log o almacenamiento contiene secretos.
- Backend rechaza acceso cruzado aunque se manipulen query keys o eventos.
- 401/403 limpian el estado adecuado.

## Fase 9 — Despliegue gradual y rollback

1. Publicar observabilidad y compresión.
2. Publicar precarga.
3. Migrar equipos bajo bandera de funcionalidad.
4. Migrar sitios y monitor.
5. Centralizar SSE.
6. Activar por porcentajes o por workspace de prueba.
7. Comparar P50/P95, errores, solicitudes por navegación y conexiones SSE.

Cada fase debe tener commit y despliegue independiente. El rollback desactiva la
bandera o restaura la imagen frontend/Nginx anterior; las fases iniciales no
requieren migración de base de datos.

## Métricas de salida

- Respuesta visual al clic: P95 < 100 ms.
- Datos en caché visibles: P95 < 300 ms.
- Segunda visita: sin descarga de chunk ni pantalla completa de carga.
- Una consulta de equipos concurrente por workspace/pestaña.
- Una conexión SSE general por pestaña autenticada.
- Cero exposición cruzada en pruebas multiusuario.
- Reducción medible de bytes y solicitudes sin aumentar errores.

