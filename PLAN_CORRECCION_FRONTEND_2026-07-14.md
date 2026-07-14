# Plan de correccion frontend - GestionVPN

**Fecha:** 2026-07-14  
**Rama objetivo:** `vps_prod`  
**Fuente:** [`INFORME_AUDITORIA_FRONTEND_2026-07-14.md`](./INFORME_AUDITORIA_FRONTEND_2026-07-14.md)  
**Alcance:** todos los P1, P2, P3 y el codigo muerto confirmado en la auditoria.

## Estado de ejecucion

**COMPLETADO el 2026-07-14.** Por solicitud del usuario, las fases se consolidaron en un unico commit final y no se hizo push. Se cerraron FE-0 a FE-7, incluida la limpieza de los 42 archivos TS/TSX inalcanzables confirmados; se conservaron `dbService` y `deviceDb` porque IndexedDB sigue siendo parte activa del producto.

Gates finales: 100/100 pruebas frontend; coverage 15.84% statements, 10.81% branches, 12.58% functions y 17.12% lines; `check:all`, build/analyze y auditor de diseño sin errores; 10/10 E2E en 1280x720 y 375x667 con fixtures OWNER/MEMBER y Axe; Semgrep 0 findings sobre 279 archivos; grafo de imports con 0 archivos de producción inalcanzables. La advertencia conocida de bundle es `exceljs` (929.91 kB), pero permanece aislado en un chunk dinámico que solo se descarga al exportar Excel.

## 1. Objetivo

Corregir los problemas funcionales, de UX, accesibilidad, validacion, responsive, sistema visual, rendimiento y mantenibilidad del frontend sin mezclar cambios de alto riesgo ni alterar contratos backend innecesariamente.

La propuesta original dividía la ejecución en commits pequeños. La ejecución real mantuvo las mismas verificaciones por fase, pero se consolidó en un solo commit por instrucción expresa del usuario.

## 2. Reglas de ejecucion

1. No borrar IndexedDB/localforage en bloque: `dbService` y `deviceDb` siguen activos.
2. No mezclar limpieza masiva con cambios funcionales.
3. Un comportamiento por commit siempre que sea posible.
4. Agregar primero una prueba que reproduzca cada bug funcional.
5. Mantener compatibilidad con cookies HttpOnly y RBAC existentes.
6. No introducir colores crudos cuando exista un token o clase del sistema.
7. Toda nueva interaccion debe funcionar con teclado, tactil y lector de pantalla.
8. Actualizar `HANDOFF.md` y `HANDOFF_LOG.md` al cerrar cada fase.
9. No desplegar hasta completar la validacion de la fase y el gate final.

## 3. Gates obligatorios por commit

- `npm run lint --prefix vpn-manager`
- `npm test --prefix vpn-manager -- --run`
- `npm run build --prefix vpn-manager`
- Para UI: captura/inspeccion en 375x667 y 1280x720.
- Para seguridad o formularios: Semgrep frontend al cerrar la fase.
- Para sistema visual: `node scripts/audit-design.js --json`.

## 4. Fase FE-0 - linea base y protecciones

**Prioridad:** inmediata  
**Complejidad:** pequena  
**Objetivo:** poder medir las correcciones y detectar regresiones desde el primer cambio.

### FE-0.1 Reparar cobertura

**Acciones**

- Corregir la instalacion fisica de `@vitest/coverage-v8` mediante instalacion reproducible del workspace.
- Verificar que `npm run test:coverage --prefix vpn-manager` funcione desde una instalacion limpia.
- Registrar la cobertura inicial sin imponer de inmediato un umbral irreal.
- Definir un umbral gradual para archivos nuevos/modificados.

**Aceptacion**

- Coverage termina con exit code 0.
- El resultado se puede reproducir con `npm ci`.

### FE-0.2 Crear infraestructura E2E

**Acciones**

- Crear fixtures Playwright para sesion OWNER, MEMBER y errores API.
- Añadir smoke de login y carga de cada modulo.
- Añadir viewport desktop 1280x720 y mobile 375x667.
- Integrar `@axe-core/playwright` o equivalente para chequeos accesibles basicos.

**Aceptacion**

- Existe al menos un spec E2E ejecutable en CI/local.
- Los fixtures no incluyen secretos reales.

### FE-0.3 Congelar metricas iniciales

Registrar como baseline:

- tamaños de chunks del build analyze;
- numero de findings del auditor de diseño;
- archivos inalcanzables;
- `scrollWidth/clientWidth` de login, Workspace y Nodos;
- requests `/account/me` durante arranque.

## 5. Fase FE-1 - integridad, errores y peticiones

**Prioridad:** P1/P2  
**Complejidad:** media  
**Dependencia:** FE-0.

### FE-1.1 Corregir eliminacion del nodo activo

**Archivos principales**

- `vpn-manager/src/context/hooks/useNodeManagement.ts`
- `vpn-manager/src/context/VpnProvider.tsx`
- hooks de timeout/keepalive relacionados.

**Acciones**

- Eliminar `activeNodeVrfRef`, `timeoutRef` y `keepaliveRef` duplicados o conectar una unica fuente de verdad.
- Hacer que `removeNodeFromState` reciba/consulte el `activeNodeVrf` real.
- Al eliminar el nodo activo, limpiar `activeNodeVrf`, `tunnelExpiry` y persistencia asociada.
- Confirmar que los hooks propietarios cancelen sus timers al cambiar el estado.

**Pruebas**

- Eliminar nodo inactivo no afecta el tunel.
- Eliminar nodo activo limpia estado y timers.
- El estado persistido no restaura el nodo eliminado.

**Aceptacion**

- No queda referencia visual ni persistida al nodo eliminado.

### FE-1.2 Componer correctamente AbortSignal

**Archivo:** `vpn-manager/src/utils/fetchWithTimeout.ts`.

**Acciones**

- Combinar `options.signal` con el timeout mediante `AbortSignal.any` o puente compatible.
- Mover la limpieza del timer a `finally`.
- Distinguir cancelacion del usuario/desmontaje frente a timeout cuando la UI necesite mensajes diferentes.

**Pruebas**

- Aborto del caller cancela la peticion.
- Timeout cancela la peticion.
- Peticion exitosa limpia el timer.

### FE-1.3 Modelar errores reales en Equipo

**Archivo:** `vpn-manager/src/components/Team/TeamModule/TeamModule.tsx`.

**Acciones**

- Sustituir catches silenciosos por estados `loading`, `success`, `error`.
- Mantener el ultimo dato valido durante un refresh fallido.
- Mostrar error y boton Reintentar por seccion.
- Diferenciar workspace vacio de fallo de carga.
- Manejar por separado miembros, invitaciones y actividad.

**Pruebas**

- 500 inicial muestra error, no “0 miembros”.
- Error durante refresh conserva los datos anteriores.
- Reintentar recupera la vista.

### FE-1.4 Incorporar Error Boundary para modulos lazy

**Archivos:** `App.tsx` y nuevo componente comun de boundary.

**Acciones**

- Crear boundary por modulo, no uno unico para toda la aplicacion.
- Mostrar modulo afectado, accion Reintentar y Volver a inicio.
- Gestionar errores de import dinamico posteriores a un deploy.
- Registrar errores sin incluir datos sensibles.

**Pruebas**

- Error de render no elimina sidebar ni sesion.
- Error de chunk presenta recuperacion.
- Reintento remonta solo el modulo afectado.

### FE-1.5 Unificar feedback de errores

**Acciones**

- Reemplazar `window.alert` de exportaciones por toast accesible.
- Informar fallos de clipboard en `UsersTable`.
- Definir un primitivo comun de toast/status con `aria-live`.
- Revisar catches silenciosos restantes y clasificar: esperado, best-effort o visible.

**Aceptacion de fase FE-1**

- P1.1, P2.1, P2.2, P2.8 y P3.5 cerrados.
- No hay pantallas en blanco ante error controlado.
- No se presentan fallos API como estados vacios.

## 6. Fase FE-2 - accesibilidad, modales y validaciones

**Prioridad:** P1/P2  
**Complejidad:** alta  
**Dependencia:** FE-1.

### FE-2.1 Crear primitivos Dialog y Drawer

**Acciones**

- Portal a `document.body`.
- `role="dialog"`, `aria-modal="true"`, titulo con `aria-labelledby`.
- Foco inicial seguro, focus trap y restauracion al disparador.
- Cierre con `Escape` y backdrop cuando corresponda.
- Fondo `inert`/no navegable mientras esta abierto.
- Scroll lock sin salto de layout.
- Respetar modales no cancelables durante acciones criticas.

**Pruebas**

- Recorrido Tab/Shift+Tab permanece dentro.
- Escape cierra y devuelve foco.
- Lector de pantalla recibe titulo y descripcion.

### FE-2.2 Migrar drawer y overlays por lotes

**Orden de migracion**

1. Sidebar movil y `ConfirmModal`.
2. Modales de Nodos.
3. Modales de Monitor AP y Escanear.
4. Modales de Equipo/Usuarios y restantes.

Cada lote debe ser un commit separado. `DiagnosticsModal` se adapta al primitivo aunque ya tenga semantica parcial.

### FE-2.3 Corregir formularios publicos

**Archivos principales**

- `RouterAccess.tsx`
- `AcceptInvitationForm.tsx`
- `PasswordResetRequest.tsx`
- `PasswordResetConfirm.tsx`

**Acciones**

- `id`, `name`, `htmlFor` y `autocomplete` correctos.
- Errores por campo y resumen accesible con `aria-live`.
- Password minimo 8 cuando sea obligatorio.
- OTP de seis digitos con validacion explicita.
- No habilitar submit con datos invalidos.
- Conservar reglas del contrato backend como fuente de verdad.
- Distinguir invitado existente/nuevo antes de exigir password o explicar claramente la condicion.

### FE-2.4 Corregir InvitePanel

**Acciones**

- Convertirlo en `<form>` real.
- Usar validacion nativa y de dominio para email.
- Permitir Enter sin handlers manuales duplicados.
- Vincular labels y anunciar resultado/error.

### FE-2.5 Hacer tablas operables por teclado

**Acciones**

- Colocar botones de ordenacion dentro de `<th>`.
- Añadir `aria-sort` y foco visible.
- Dar alternativa accesible al resize de columnas.
- Aumentar areas activas de checkboxes/iconos a 44 px conservando icono compacto.
- Revisar menus kebab con flechas, Escape y retorno de foco.

**Aceptacion de fase FE-2**

- P1.2, P2.3 y P2.6 cerrados.
- Todos los dialogs/drawers cumplen foco, Escape y semantica.
- Auth, invitaciones y tablas principales pasan axe sin violaciones serias.

## 7. Fase FE-3 - navegacion, transiciones y responsive

**Prioridad:** P2/P3  
**Complejidad:** alta  
**Dependencia:** FE-2.

### FE-3.1 Introducir rutas reales

**Rutas propuestas**

- `/nodes`
- `/scan`
- `/monitor`
- `/team`
- `/settings`
- rutas administrativas segun permisos.

**Acciones**

- Incorporar un router React mantenido y compatible con Vite.
- Mantener guards RBAC con `visibleModules/canSeeModule`.
- Migrar una vez el valor legacy de `localStorage` a la ruta equivalente.
- Corregir deep links de activacion/desactivacion sin perder parametros.
- Definir ruta 404 y fallback a primer modulo permitido.

**Pruebas**

- Back/Forward cambia de modulo.
- Refresh conserva la vista.
- URL compartida abre el modulo permitido.
- MEMBER no accede por URL a rutas restringidas.

### FE-3.2 Corregir transiciones

**Acciones**

- Retirar el remount indiscriminado `key={activeModule}` cuando no sea necesario.
- Mantener Suspense por ruta.
- Transicion corta solo de contenido, sin bloquear navegacion.
- Respetar `prefers-reduced-motion`.
- Evitar que un cambio de modulo borre filtros que deban persistir.

### FE-3.3 Reparar overflow de autenticacion

**Acciones**

- Encapsular decoraciones absolutas en contenedor sin afectar dimensiones del documento.
- Ajustar tamaños por breakpoint o retirar las decoraciones que no aporten informacion.
- Verificar 320, 360, 375 y 414 px.

### FE-3.4 Reparar tabs de Workspace

**Acciones**

- Usar grid de dos columnas con `min-w-0`.
- Reducir padding/descripcion en viewport estrecho.
- Garantizar que “Usuarios VPN” y “Peers WireGuard” sean legibles y tocables.

### FE-3.5 Responsive de tablas

**Acciones**

- Definir presets de columnas por breakpoint.
- Mantener columnas primarias y acciones visibles.
- Permitir selector para recuperar columnas ocultas.
- Mantener scroll horizontal solo dentro de la tabla, nunca en el documento.
- Evaluar vista de detalle por fila para informacion secundaria en movil.

### FE-3.6 Metadatos del documento

- Cambiar `lang="en"` a `lang="es"`.
- Corregir favicon para el base path `/GestionVPN-1.0/`.
- Verificar title y nombres accesibles por ruta.

**Aceptacion de fase FE-3**

- P2.4, P2.5 y P3.6 cerrados.
- `document.scrollWidth === document.clientWidth` en pantallas principales.
- Navegacion historica, refresh y deep links funcionan.

## 8. Fase FE-4 - sistema visual, paleta y tipografia

**Prioridad:** P2  
**Complejidad:** media  
**Dependencia:** FE-3.

### FE-4.1 Corregir contraste

**Acciones**

- Migrar texto legible `text-slate-400` en claro a token AA o minimo `slate-500`.
- Revisar especialmente Team, Sidebar, tablas y textos de 10-14 px.
- Validar light/dark por separado.
- No alterar placeholders decorativos o iconos sin revisar su funcion.

### FE-4.2 Corregir findings del auditor

**Objetivos**

- `ScanModeToggle`: variante dark faltante.
- `MoveToNodeModal` y `UsersTable`: botones con clases canonicas.
- Gradientes multicolor: retirar los decorativos no necesarios; documentar solo excepciones con significado.
- Eliminar findings provenientes de `NodeProvisionForm` cuando el modulo muerto se retire en FE-6.

### FE-4.3 Mejorar DS05

**Acciones**

- Evaluar modo claro aunque exista `dark:text-*` en la misma linea.
- Separar texto, iconos y superficies oscuras permanentes.
- Permitir suppressions documentadas y puntuales, no por archivo completo salvo excepcion real.

### FE-4.4 Normalizar tokens semanticos

- Definir colores para AP, CPE, estados, tags y severidades.
- Mantener Inter como fuente de interfaz.
- Mantener JetBrains Mono solo para IPs, claves, codigo y mediciones tecnicas.
- Retirar estilos ad hoc que dupliquen `btn`, `input-field`, `badge` o `card`.

**Aceptacion de fase FE-4**

- P2.9 cerrado.
- Auditor de diseño sin hallazgos pendientes no justificados.
- Contraste AA para texto normal en vistas auditadas.

## 9. Fase FE-5 - rendimiento, tablas, hooks y almacenamiento

**Prioridad:** P2/P3  
**Complejidad:** media-alta  
**Dependencia:** FE-4.

### FE-5.1 Cargar QRCode bajo demanda

- Reemplazar imports estaticos por `import('qrcode')` dentro del flujo que recibe `.conf`.
- Aplicar en invitacion, perfil y modal WireGuard.
- Manejar cancelacion si el componente se desmonta antes de generar el QR.

**Aceptacion:** el chunk de login normal no incluye runtime QRCode.

### FE-5.2 Separar contratos y Zod

**Acciones**

- Crear exports/subpaths diferenciados para tipos, constantes y schemas.
- Importar `ROLE_LABEL` desde un modulo de constantes sin Zod.
- Declarar `sideEffects:false` solo despues de verificar que es correcto.
- Confirmar que Team no carga Zod por una constante.

### FE-5.3 Eliminar doble `/account/me`

- Unificar sesion en un unico provider/store.
- Hacer que `WorkspaceSessionProvider` consuma el resultado ya restaurado.
- Conservar refresh explicito tras cambios de perfil/rol.

**Aceptacion:** una sola llamada de sesion en arranque normal.

### FE-5.4 Optimizar persistencia de polling

- Medir tamaño/frecuencia de `pollResults`.
- Aplicar throttle/debounce.
- Persistir solo resumen necesario para restauracion.
- Manejar cuota excedida con degradacion visible solo cuando afecte funcionalidad.

### FE-5.5 Escalabilidad de tablas

**Acciones**

- Mantener paginacion de Nodos a 50.
- Añadir paginacion cliente o servidor para peers.
- Para dispositivos, activar virtualizacion solo al superar un umbral medido, por ejemplo 100 filas.
- Evaluar `content-visibility:auto` para volumen intermedio.
- Mantener seleccion, orden, columnas sticky y accesibilidad con virtualizacion.

### FE-5.6 TTL real de cache

- Validar `at` antes de restaurar nodos desde sessionStorage.
- Definir TTL explicito o retirar el campo si siempre se debe refrescar.
- Mostrar cache solo como estado transitorio y no como dato confirmado.

**Aceptacion de fase FE-5**

- P2.7, P2.10, P3.1, P3.4 y P3.8 cerrados.
- Bundle analyze demuestra reduccion de carga publica/Team.
- Tablas mantienen interaccion fluida con datasets de prueba grandes.

## 10. Fase FE-6 - codigo muerto y dependencias

**Prioridad:** P3/mantenibilidad  
**Complejidad:** media  
**Dependencia:** FE-5.

### FE-6.1 Eliminar barrels y utilidades inalcanzables

Primer lote de bajo riesgo:

- barrels `index.ts` muertos de Monitor AP;
- `useNodeSelection.ts`;
- utilidades legacy de NetworkDevices;
- utilidades/constants legacy de NodeAccessPanel;
- `settingsValidator.ts`;
- `M5FullInfoModal/components/ModalBackdrop.tsx`;
- `AdminPeersManager.tsx`.

Después de cada grupo: typecheck, tests, build y nuevo grafo de imports.

### FE-6.2 Retirar `NodeProvisionForm/**`

**Antes de borrar**

- Buscar imports dinamicos, rutas externas y referencias de documentacion.
- Revisar historial para confirmar que fue sustituido.
- Registrar componente vigente que cubre el alta/provision.

**Aceptacion:** alta de nodos y generacion de scripts siguen operativas por E2E.

### FE-6.3 Retirar `cpeCache`

- Confirmar de nuevo que no existen `set/load` activos.
- Eliminar el store y llamadas que solo ejecutan `clear()`.
- No tocar `deviceDb`, `statsCache`, `dbService` ni `localforage` mientras tengan consumidores.

### FE-6.4 Limpiar dependencias y assets

- Retirar dependencias directas sin uso confirmado: `clsx`, `tailwind-merge`, `zustand` y posiblemente `zod` del package frontend.
- Mantener Zod en `@gestionvpn/contracts` donde los schemas lo necesitan.
- Revisar `react.svg`, `vite.svg`, `hero.png` y otros assets no referenciados.
- Ejecutar `npm install` controlado y revisar solo cambios esperados del lockfile.

**Aceptacion de fase FE-6**

- P3.2, P3.3 y los 42 archivos muertos cerrados.
- Grafo de imports sin archivos TS/TSX inalcanzables de produccion, salvo excepciones documentadas.
- Build y E2E de provision/monitor/scan continúan pasando.

## 11. Fase FE-7 - cierre de calidad y preparacion de despliegue

**Prioridad:** obligatoria antes de deploy  
**Complejidad:** media.

### FE-7.1 Suite E2E minima

Casos obligatorios:

1. Login correcto, error y recuperacion.
2. Invitacion nueva/existente y validaciones.
3. Navegacion con URL, Back/Forward y refresh.
4. Drawer movil por teclado y Escape.
5. Modal: foco, cierre y restauracion.
6. Team: datos vacios frente a error 500.
7. Tabla: ordenar con teclado, columnas y scroll interno.
8. Eliminar nodo activo.
9. Error de lazy chunk renderizado por Error Boundary.
10. OWNER/MEMBER y rutas restringidas.

### FE-7.2 Matriz responsive final

Validar en:

- 320x568
- 375x667
- 768x1024
- 1280x720
- 1440x900

No debe haber overflow del documento, solapamientos, texto truncado sin alternativa ni controles menores a 44 px en acciones tactiles primarias.

### FE-7.3 Gates finales

- TypeScript/build: 0 errores.
- ESLint: 0 warnings.
- Unit/integration: 100% verdes.
- E2E: 100% verdes en desktop/mobile.
- Semgrep: 0 findings; revisar manualmente cualquier nuevo timeout.
- Auditor de diseño: 0 findings pendientes no justificados.
- Axe: 0 violaciones critical/serious.
- Bundle: login sin QRCode y Team sin Zod por `ROLE_LABEL`.
- Grafo de imports: 0 codigo muerto de produccion no documentado.

### FE-7.4 Despliegue

- Commit/PR por fase o grupo coherente.
- Desplegar exclusivamente desde `vps_prod` segun la regla del proyecto.
- Smoke en produccion: login, rutas, Nodos, Escanear, Monitor AP, Equipo y Ajustes.
- Verificar consola del navegador, 404 de assets y requests duplicados.
- Mantener rollback al commit anterior hasta completar el smoke.

## 12. Orden sugerido de commits

1. `test(frontend): repair coverage and add e2e fixtures`
2. `fix(vpn): clear active tunnel when deleting its node`
3. `fix(http): compose caller abort signal with timeout`
4. `fix(team): distinguish loading empty and error states`
5. `feat(ui): add module error boundary and recovery`
6. `feat(ui): add accessible toast feedback`
7. `feat(ui): add accessible dialog and drawer primitives`
8. `refactor(ui): migrate sidebar and confirm dialog`
9. `refactor(ui): migrate node dialogs`
10. `refactor(ui): migrate monitor team and user dialogs`
11. `fix(auth): add semantic labels autocomplete and validation`
12. `fix(team): make invitation panel a validated form`
13. `fix(tables): add keyboard sorting and accessible controls`
14. `feat(nav): route modules with browser history`
15. `fix(responsive): remove auth and workspace overflow`
16. `fix(tables): add responsive column presets`
17. `fix(design): align contrast palette and component tokens`
18. `perf(bundle): lazy-load qrcode generation`
19. `perf(contracts): split constants types and zod schemas`
20. `perf(session): remove duplicate account bootstrap request`
21. `perf(data): throttle polling persistence and enforce cache ttl`
22. `perf(tables): paginate or virtualize large datasets`
23. `refactor(frontend): remove unreachable legacy modules`
24. `chore(frontend): remove residual store dependencies and assets`
25. `test(frontend): complete responsive accessibility e2e matrix`

Los nombres son orientativos; no se deben agrupar varios puntos solo para reducir el numero de commits.

## 13. Matriz de trazabilidad

| Hallazgo | Fase/tarea | Evidencia de cierre |
|---|---|---|
| P1.1 Nodo activo obsoleto | FE-1.1 | Tests de eliminacion + estado/persistencia limpios |
| P1.2 Drawer/modales | FE-2.1/2 | E2E foco, Escape, inert y axe |
| P2.1 Sin Error Boundary | FE-1.4 | Test de render/chunk fallido |
| P2.2 Equipo oculta errores | FE-1.3 | Tests empty/error/retry |
| P2.3 Formularios incompletos | FE-2.3/4 | Tests validacion + axe |
| P2.4 Navegacion sin URL | FE-3.1/2 | Back/Forward/refresh/deep link |
| P2.5 Overflow/touch | FE-3.3/4/5 | Matriz responsive y targets 44 px |
| P2.6 Tablas mouse-only | FE-2.5 | Ordenacion por teclado + `aria-sort` |
| P2.7 Escalabilidad tablas | FE-5.5 | Dataset grande y medicion de render |
| P2.8 AbortSignal descartado | FE-1.2 | Tests caller abort/timeout |
| P2.9 Contraste/tokens | FE-4 | Auditor diseño + axe/contraste |
| P2.10 Bundle QR/Zod | FE-5.1/2 | Visualizer sin runtime innecesario |
| P3.1 `/account/me` duplicado | FE-5.3 | Una request en arranque |
| P3.2 Dependencias sin uso | FE-6.4 | Manifest/lock limpios |
| P3.3 IndexedDB residual parcial | FE-6.3 | Solo `cpeCache` retirado |
| P3.4 Polling pesado | FE-5.4 | Frecuencia/tamaño medidos y limitados |
| P3.5 Alerts/catches | FE-1.5 | Toast y feedback accesible |
| P3.6 Idioma/favicon | FE-3.6 | `lang=es`, asset sin 404 |
| P3.7 Sin E2E/coverage | FE-0 y FE-7 | Coverage y E2E verdes |
| P3.8 Cache sin TTL | FE-5.6 | Test de expiracion |
| 42 archivos muertos | FE-6.1/2 | Grafo final sin inalcanzables |

## 14. Definicion de terminado

El plan se considera completado cuando:

- todos los renglones de la matriz tienen evidencia automatizada o inspeccion documentada;
- no quedan P1/P2 abiertos;
- los P3 diferidos tienen justificacion explicita y ticket;
- la aplicacion pasa los gates de FE-7;
- `HANDOFF.md` refleja el estado real;
- el despliegue desde `vps_prod` supera el smoke de produccion.
