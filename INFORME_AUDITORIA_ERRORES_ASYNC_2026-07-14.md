# Informe de auditoria: errores, estados asincronos y pagina 404

Fecha: 2026-07-14  
Rama: `vps_prod`  
Alcance: frontend React, clientes HTTP, integracion SMTP del backend y navegacion del SPA.

## 1. Resumen ejecutivo

La aplicacion ya tenia `ModuleErrorBoundary`, skeleton de modulos y varios estados vacios, pero la cobertura no era completa. Se encontraron errores de consulta convertidos silenciosamente en listas vacias, loaders sin skeleton, una sesion que podia quedar cargando indefinidamente y rutas desconocidas redirigidas al ultimo modulo en lugar de mostrar 404.

La correccion agrega tres niveles de Error Boundary, captura global de errores asincronos, reporte por correo al administrador, un patron comun de cuatro estados para consultas y una pagina 404 real. Los flujos prioritarios que ocultaban errores fueron migrados.

Resultado actual: no quedan hallazgos P0/P1 abiertos dentro del alcance. Los riesgos residuales se detallan en la seccion 8.

## 2. Metodo y cobertura

- Inventario AST de `vpn-manager/src`: 71 archivos de produccion con `await`, 239 expresiones `await` y 152 funciones `async`.
- Revision manual de consultas de entrada, mutaciones, polling, importaciones dinamicas y operaciones de portapapeles.
- Revision de `App`, contexto de sesion, navegacion y clientes HTTP `apiFetch`/`apiJson`.
- Revision del SMTP existente y diseno de un endpoint sin destinatario controlable por el cliente.
- Pruebas unitarias, compilacion, lint, auditor de diseno, Semgrep y prueba visual responsive.

La regla aplicada es:

| Tipo de operacion | Estados exigidos |
| --- | --- |
| Consulta que reemplaza una vista | Cargando con skeleton, error con reintento, vacio y exito |
| Mutacion/comando | Inactivo, enviando, error y exito; `vacio` no aplica |
| Polling/refresh de fondo | Conservar dato anterior, indicar actualizacion, mostrar error no bloqueante y permitir reintento |
| Degradacion opcional | Mantener la funcion principal y mostrar un mensaje accionable |

## 3. Hallazgos y correcciones

### P1 - Fallos presentados como datos vacios

`HistoryModal`, Monitor AP, perfil de miembro, asignaciones, invitaciones, WireGuard y la carga de moderadores tenian `catch` vacios o fallbacks `[]`. El usuario no podia distinguir entre "no hay datos" y "el servidor fallo".

Estado: corregido. Cada flujo conserva ahora un error separado y ofrece `Reintentar`; un 404 esperado de WireGuard sigue siendo un vacio valido.

### P1 - Skeleton infinito al perder la sesion de workspace

`useSession` devolvia `null` tanto para ausencia como para error. `ModuleRouter` respondia con `ModuleSkeleton` mientras `session` fuera nula, incluso despues de finalizar la consulta.

Estado: corregido. La sesion expone `loading`, `error` y `session` por separado. El router muestra error recuperable y ejecuta `refresh()` al reintentar.

### P1 - Error Boundary incompleto

El boundary existente cubria modulos lazy, pero solo escribia en consola y no cubria fallos del provider/layout. Los errores de eventos, promesas y llamadas HTTP tampoco son capturados por React Error Boundaries.

Estado: corregido.

- Boundary raiz alrededor de `VpnProvider` y `AppContent`.
- Boundary del flujo publico de autenticacion.
- Boundary por modulo autenticado con reinicio independiente.
- Listeners globales para `window.error` y `unhandledrejection`.
- Reporte automatico de errores de red y respuestas HTTP 5xx desde ambos clientes HTTP.

### P1 - No existia una pagina 404 real

`useModuleNavigation` convertia cualquier pathname desconocido al ultimo modulo guardado y lo canonicalizaba. La ruta incorrecta desaparecia antes de que la UI pudiera identificarla.

Estado: corregido. Las rutas desconocidas se conservan, se exponen como `isNotFound` y muestran una pagina 404 publica o integrada al layout autenticado.

### P2 - Loaders sin skeleton y sin reintento

Dashboard, metricas, historial, ajustes, Monitor AP, notificaciones y varias vistas de Equipo usaban spinners aislados o mensajes no accionables.

Estado: corregido con `AsyncQueryState`, que centraliza skeleton, error, reintento y vacio. Los refresh de Dashboard/metricas mantienen datos previos y muestran un aviso no bloqueante si la actualizacion falla.

### P2 - Degradaciones opcionales invisibles

La generacion dinamica de QR, portapapeles, estadisticas SSH y sincronizacion de credenciales podian fallar sin feedback.

Estado: corregido en los flujos revisados. El `.conf` sigue disponible si falla el QR y se muestra una alternativa; los fallos de copiar o recuperar estadisticas producen un mensaje visible.

## 4. Servicio de reporte al administrador

Se implemento un servicio propio porque el proyecto ya dispone de Nodemailer/SMTP. No requiere una cuenta externa ni agrega un SDK pesado al bundle.

Flujo:

1. React, los listeners globales o el cliente HTTP detectan el error.
2. El frontend envia un payload acotado a `POST /api/error-reports`.
3. El backend valida con Zod y rechaza campos desconocidos.
4. Se redactan JWT, tokens, OTP, cookies, passwords, query params sensibles y claves privadas.
5. Se deduplican errores iguales por 10 minutos y se limita cada IP a 5 reportes por 10 minutos.
6. El correo se envia a `ERROR_REPORT_EMAIL`; si no existe, usa `SMTP_USER`.

El cliente no puede elegir el destinatario y no envia cuerpos HTTP, credenciales, datos del usuario ni contenido de `localStorage`. El correo se genera en texto plano para evitar una superficie de inyeccion HTML.

## 5. Modulos actualizados

- App, navegacion, sesion de workspace y pagina 404.
- Dashboard y metricas en vivo.
- Moderadores.
- Historial y edicion de nodos.
- Monitor AP y panel de estadisticas SSH.
- Ajustes globales y preferencias de notificacion.
- WireGuard propio y de miembros.
- Perfil, invitaciones y asignaciones de Equipo.
- Clientes HTTP legacy y tipado.

Se retiro `SettingsLoadingState.tsx` porque quedo reemplazado por el componente comun y ya no tenia consumidores.

## 6. Verificaciones

| Verificacion | Resultado |
| --- | --- |
| Backend Vitest | 44 archivos, 341/341 pruebas |
| Frontend Vitest | 29 archivos, 106/106 pruebas |
| `check:all` | Node check, TypeScript y ESLint OK |
| Build Vite | OK |
| Auditor de diseno | 271 archivos, 0 violaciones |
| Semgrep focalizado | 125 reglas, 5 archivos criticos, 0 hallazgos |
| 404 movil | 375x667, sin scroll horizontal; contenido y botones dentro del viewport |
| `git diff --check` | OK |

El escaneo Semgrep de todo `server` + `vpn-manager/src` fue detenido despues de 14 minutos sin salida. Se ejecuto despues un escaneo focalizado completo sobre la nueva superficie. La auditoria integral anterior del repositorio ya habia finalizado con 0 hallazgos.

## 7. Configuracion operativa

En produccion debe existir SMTP valido. El destinatario recomendado es explicito:

```env
ERROR_REPORT_EMAIL=administrador@tuempresa.com
```

Si se omite, el sistema usa `SMTP_USER`. Reiniciar/recrear el backend despues de cambiar la variable.

## 8. Riesgos residuales y recomendaciones

- El rate limit y la deduplicacion viven en memoria. Son adecuados para la unica instancia actual; con multiples replicas deben moverse a Redis o base de datos.
- El servicio propio envia stack, ruta y user-agent, pero no ofrece releases, source maps, breadcrumbs ni agrupacion avanzada de Sentry. Si el volumen crece, Sentry puede agregarse como segundo destino sin retirar el correo actual.
- Los HTTP 4xx esperados no generan correo para evitar ruido y abuso. Siguen apareciendo en la UI mediante sus estados de error.
- Las operaciones best-effort de cache/localStorage, parseo de eventos SSE y lectura de datos opcionales permanecen silenciosas por diseno; no representan una consulta visible ni deben bloquear al usuario.
- La cobertura visual autenticada de todos los estados forzados por red aun puede ampliarse con fixtures E2E de 404/500 por modulo.

