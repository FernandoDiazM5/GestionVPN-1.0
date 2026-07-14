# Informe de auditoria frontend - GestionVPN

**Fecha:** 2026-07-14  
**Rama auditada:** `vps_prod`  
**Base:** commit `a0a4ea4` (documentacion posterior en `46a32a9` y `63b7e89`)  
**Alcance:** UX, validaciones, manejo de errores, accesibilidad, sistema visual, tipografia, paleta, responsive, tablas, hooks, transiciones, rendimiento, dependencias y codigo muerto.

## 1. Resumen ejecutivo

El frontend compila y sus 66 pruebas actuales pasan. La fuente principal esta correctamente unificada en **Inter** y los datos tecnicos usan **JetBrains Mono**. Semgrep no encontro vulnerabilidades en las reglas ejecutadas.

La auditoria si encontro problemas funcionales y de experiencia que conviene corregir antes de considerar cerrado el frontend:

- **2 hallazgos de prioridad alta (P1):** estado inconsistente al borrar el nodo activo y accesibilidad incompleta en drawer/modales.
- **10 grupos de prioridad media (P2):** errores ocultos, ausencia de Error Boundary, validaciones incompletas, navegacion sin URL/historial, overflows moviles, tablas no operables por teclado, cancelacion de requests defectuosa, contraste/paleta y carga innecesaria de dependencias.
- **8 grupos de prioridad baja (P3):** peticiones duplicadas, dependencias declaradas sin uso, stores residuales, alertas nativas, favicon/base path, idioma del documento y cobertura insuficiente.
- **42 archivos TypeScript/TSX inalcanzables**, equivalentes a unas **1.643 lineas**, detectados desde el grafo de imports de `src/main.tsx`.

No se recomienda retirar IndexedDB en bloque: sigue siendo parte activa del producto. Se debe retirar solamente lo demostrado como residual.

## 2. Metodologia y verificaciones

- Lectura estatica de los 318 archivos TS/TSX y construccion de un grafo de imports desde `src/main.tsx`.
- Revision manual de `App`, contextos, hooks, autenticacion, Equipo, Nodos, Escanear, Monitor AP, Ajustes y tablas.
- Pruebas visuales en navegador a **1280x720** y **375x667**, incluyendo login, invitacion, Workspace, Nodos y drawer movil.
- `npm run analyze --prefix vpn-manager`: **OK**.
- `npm test --prefix vpn-manager -- --run`: **66/66 tests, 11/11 archivos**.
- `node scripts/audit-design.js --json`: **21 hallazgos**, sin errores bloqueantes.
- Semgrep `1.166.0`: **125 reglas, 320 archivos, 0 findings**; 10 timeouts parciales de analisis de flujo.
- `test:coverage`: no pudo ejecutarse porque falta fisicamente `@vitest/coverage-v8` en la instalacion local, aunque esta declarado.

## 3. Hallazgos P1 - alta prioridad

### P1.1 Estado obsoleto al eliminar el nodo activo

**Evidencia:** `vpn-manager/src/context/hooks/useNodeManagement.ts:14,43-49`.

`activeNodeVrfRef` se inicializa en `null` y nunca se sincroniza con `activeNodeVrf`. La condicion que deberia limpiar el tunel al eliminar el nodo activo nunca se cumple. Los `timeoutRef` y `keepaliveRef` locales tampoco son los mismos refs administrados por `useTunnelTimeout` y `useTunnelKeepalive`.

**Impacto:** la interfaz puede conservar un tunel/nodo activo que ya fue eliminado, mostrar expiracion obsoleta y ejecutar acciones contra estado inexistente.

**Correccion:** eliminar esos refs duplicados; pasar `activeNodeVrf` real al hook o sincronizar un unico ref en `VpnProvider`. Agregar test: eliminar nodo activo debe dejar `activeNodeVrf=null`, `tunnelExpiry=null` y detener timers.

### P1.2 Drawer y modales no controlan foco ni semantica

**Evidencia:** `vpn-manager/src/components/Layout/Sidebar.tsx:250-278`. Hay 20 componentes con `.modal-overlay`; solo `DiagnosticsModal` declara `role="dialog"` y `aria-modal="true"`. `ConfirmModal` tampoco lo hace.

En movil, el foco permanece en "Abrir menu" detras del overlay, el contenido principal sigue navegable, `Escape` no cierra y no existe focus trap/restauracion. El drawer no tiene `aria-expanded`, `aria-controls`, `role="dialog"` ni `aria-modal`.

**Impacto:** usuarios de teclado o lector de pantalla pueden interactuar con contenido oculto y perder el contexto. Es un fallo transversal, no de un solo modal.

**Correccion:** crear un primitivo comun `Dialog/Drawer` con portal, titulo accesible, foco inicial, trap, `Escape`, restauracion de foco e `inert` en el fondo. Migrar los 19 overlays sin semantica y `ConfirmModal`.

## 4. Hallazgos P2 - prioridad media

### P2.1 No existe Error Boundary para modulos lazy

**Evidencia:** `vpn-manager/src/App.tsx:92-104,129-140`.

La aplicacion usa `lazy` y `Suspense`, pero no hay `ErrorBoundary` ni `componentDidCatch`. Un error de render o un chunk obsoleto tras un deploy puede dejar toda la pantalla en blanco, sin reintento.

**Correccion:** envolver cada modulo lazy en un boundary con mensaje, boton Reintentar y recuperacion de errores de import dinamico.

### P2.2 Los errores de Equipo se muestran como datos vacios

**Evidencia:** `vpn-manager/src/components/Team/TeamModule/TeamModule.tsx:48-68`.

`loadData` y `reloadLogs` silencian errores. Una caida de API se representa como “Sin propietario”, “0 miembros” y actividad vacia, indistinguible de un workspace realmente vacio.

**Correccion:** estado explicito `loading/error/success`, conservar ultimo dato valido, banner con reintento y mensajes independientes por panel.

### P2.3 Validaciones y formularios de autenticacion incompletos

**Evidencia:**

- `RouterAccess.tsx:198-235`: labels sin `htmlFor`, inputs sin `id`, `name` ni `autocomplete`.
- `AcceptInvitationForm.tsx:169-185`: password sin `required` ni `minLength`; el boton se habilita con password vacio.
- `InvitePanel.tsx:46-74`: no usa `<form>` y solo valida que el email no este vacio.
- Reset/invitacion/login: errores asincronos sin `role="alert"` o `aria-live`.

**Impacto:** validacion tardia en servidor, peor uso con gestores de contrasenas, teclado movil y lectores de pantalla.

**Correccion:** esquema compartido de validacion en cliente, `form` nativo, labels vinculados, `autocomplete` (`username`, `current-password`, `email`, `one-time-code`, `new-password`), error por campo y region `aria-live`. Para invitaciones, distinguir usuario nuevo/existente antes de exigir password o explicar la regla.

### P2.4 Navegacion sin URL ni historial

**Evidencia:** `vpn-manager/src/context/hooks/useModuleNavigation.ts:9-15` y `App.tsx:132`.

El modulo activo vive solo en `localStorage`; no cambia URL ni historial. Back/Forward no navega entre modulos, no se puede compartir una vista y `key={activeModule}` remonta el arbol, perdiendo estado local y repitiendo cargas.

**Correccion:** rutas reales (`/nodes`, `/scan`, `/monitor`, `/team`, `/settings`) o, como minimo, History API con estado. Mantener lazy loading por ruta y decidir deliberadamente que estado se conserva.

### P2.5 Overflows y targets tactiles en movil

**Evidencia visual:**

- Login 375 px: `scrollWidth=552` frente a `clientWidth=360`; los fondos absolutos de 384 px (`RouterAccess.tsx:142-143`) generan overflow oculto y scroll vertical innecesario.
- Workspace 375 px: `scrollWidth=396`; la tab “Peers WireGuard” queda recortada (`TeamModule.tsx:175,284-295`).
- Nodos 375 px: tabla aproximada de 996 px dentro de un viewport util de 326 px.
- Botones de fila y menu: varios miden 28 px; login 40 px; enlaces de retorno cerca de 16 px.

**Correccion:** contener decoraciones dentro de un wrapper `overflow-hidden`, tabs `grid-cols-2 min-w-0` con copy compacto, presets de columnas por breakpoint y targets tactiles de 44x44 px.

### P2.6 Tablas no operables completamente por teclado

**Evidencia:**

- `UsersTable.tsx:280-311`: ordenacion con `onClick` directamente en `<th>`.
- `NodesTable.tsx:81-97`: mismo patron.
- `DeviceTable.tsx:150-180`: headers y resize grip basados en `div/span` y mouse.
- Checkboxes custom de Escanear: 16x16 px.

**Impacto:** ordenacion y redimensionamiento no accesibles por teclado; targets demasiado pequenos.

**Correccion:** botones dentro de `<th>` con `aria-sort`, handlers de teclado, grip accesible o alternativa numerica, y ampliar hit area sin agrandar visualmente el icono.

### P2.7 Escalabilidad de tablas grandes

`NodesListSection` pagina correctamente a 50 filas. En cambio, `DeviceTable` renderiza todo `sortedRows`, `UsersTable` todos los peers filtrados y `MembersTable` todos los miembros.

**Correccion:** para mas de 100 filas, paginacion/virtualizacion; para volumen moderado, `content-visibility:auto`. Priorizar peers y dispositivos; no virtualizar por reflejo si el volumen real sigue pequeno.

### P2.8 `fetchWithTimeout` descarta la cancelacion del llamador

**Evidencia:** `vpn-manager/src/utils/fetchWithTimeout.ts:16-23`.

El helper reemplaza `options.signal` por su propio `AbortController`. Un componente no puede cancelar por desmontaje o cambio de consulta; solo vence el timeout.

**Correccion:** combinar señales con `AbortSignal.any`, o propagar el aborto del caller al controller interno. Limpiar siempre el timer en `finally`.

### P2.9 Contraste y uso inconsistente de tokens

La familia tipografica es consistente, pero varios componentes usan `text-slate-400` sobre blanco. `#94a3b8` sobre `#ffffff` tiene contraste aproximado **2.56:1**, insuficiente para texto normal. Ejemplos: `TeamModule.tsx:107,128,193,222,262,264,295` y `Sidebar.tsx:206`.

El auditor DS05 no los marca cuando la misma linea incluye una variante `dark:`, aunque el modo claro siga fallando. El auditor de diseno encontro ademas 21 desviaciones: 18 gradientes multicolor, un `bg-amber-50` sin variante dark (`ScanModeToggle.tsx:226`) y dos botones con colores crudos sin `.btn-*` (`MoveToNodeModal.tsx:49`, `UsersTable.tsx:438`).

**Correccion:** usar tokens (`text-muted`/`text-subtle`) y minimo `slate-500` en fondo claro; corregir DS05 para evaluar cada modo; tokenizar excepciones semanticas y eliminar gradientes no necesarios.

### P2.10 Carga inicial y chunks innecesarios

`AcceptInvitationForm`, `MemberProfile` y `MemberWireGuardModal` importan `qrcode` estaticamente, aunque el QR solo existe despues de recibir un `.conf`. El login publico termina enlazando ese runtime.

`@gestionvpn/contracts` expone todos los schemas Zod desde un unico barrel y no declara `sideEffects:false`; el unico valor runtime del frontend, `ROLE_LABEL`, puede arrastrar Zod al chunk de Equipo.

**Correccion:** `import('qrcode')` al generar el QR; crear subpaths `contracts/types`, `contracts/constants` y `contracts/schemas`, o marcar/verificar tree-shaking. Mantener ExcelJS/jsPDF como imports dinamicos.

## 5. Hallazgos P3 - prioridad baja

### P3.1 Peticion de sesion duplicada

`VpnProvider.tsx:34` llama `/account/me`; despues `WorkspaceSessionProvider` monta `useSession`, que repite la llamada (`useSession.ts:24`). Reusar una unica fuente de sesion.

### P3.2 Dependencias directas sin uso

No hay imports en `src` de `clsx`, `tailwind-merge`, `zustand` ni `zod`. Revisar y retirar las dependencias directas redundantes; Zod sigue siendo dependencia legitima de `@gestionvpn/contracts` en backend/contratos.

### P3.3 IndexedDB: activo y residual a la vez

No retirar `localforage` ni `store/db.ts`/`deviceDb.ts`: se usan en `VpnProvider`, persistencia de nodos, Escanear y Monitor AP. `credCache` es memoria efimera aunque comparte modulo con caches IndexedDB.

`cpeCache.ts`, en cambio, no tiene `set` ni `load` consumidores; solo se invoca `clear()`. Es un store residual y puede retirarse junto con sus limpiezas despues de una prueba de regresion.

### P3.4 Persistencia de polling pesada

`usePolling` serializa `pollResults` completos a `sessionStorage` con frecuencia. Con muchos AP/CPE puede bloquear el hilo principal o exceder cuota. Persistir solo resumen/IDs, aplicar throttle y medir el tamano.

### P3.5 Alertas y errores fuera del sistema visual

Los menus de exportacion de Escanear y Nodos usan `window.alert` para errores. Clipboard en `UsersTable.tsx:502` ignora el fallo. Sustituir por toast accesible y feedback junto a la accion.

### P3.6 Idioma y base path

`vpn-manager/index.html:2` usa `lang="en"` en una aplicacion espanola. El favicon apunta a `/favicon.svg`, fuera del base `/GestionVPN-1.0/`, y puede producir 404 en produccion. Usar `lang="es"` y ruta compatible con `BASE_URL`.

### P3.7 Cobertura de pruebas insuficiente para UX

Existe `playwright.config.ts`, pero no hay specs E2E. Las 66 pruebas cubren utilidades y algunos providers/componentes, no auth, drawers, modales, rutas, tablas, responsive ni estados de error. Reparar primero la instalacion de coverage y agregar smoke E2E desktop/mobile.

### P3.8 Cache de nodos sin TTL efectivo

`useNodeFetching` guarda `{at, nodes}` en `sessionStorage`, pero no valida la antiguedad antes de mostrarlo. La sincronizacion posterior reduce el impacto, aunque puede haber datos viejos transitorios. Aplicar TTL real o retirar el campo `at`.

## 6. Codigo muerto confirmado

El grafo desde `src/main.tsx` marco **42 archivos / 1.643 lineas** sin ruta de import activa. Los grupos principales son:

- `components/VPN/NodeProvisionForm/**`: 23 archivos, modulo completo sin consumidor.
- `NetworkDevicesModule`: `useNodeSelection.ts` y cinco utilidades legacy (`authService`, `deviceService`, `formatters`, `ipValidation`, `scanService`).
- `NodeAccessPanel`: `constants.ts`, `useNodePolling.ts`, `formatters.ts`, `nodeValidation.ts`, `passwordGenerator.ts`.
- `ApMonitorModule`: barrels `components/index.ts`, `hooks/index.ts`, `utils/index.ts`, ademas de `constants.ts`, `types.ts`, `useColumnPrefs.ts`.
- `AdminPeersManager.tsx`, `settingsValidator.ts` y `M5FullInfoModal/components/ModalBackdrop.tsx`.

**Recomendacion:** borrar por grupos en commits pequenos, ejecutar `tsc`, tests y build despues de cada grupo. Los barrels inalcanzables pueden retirarse primero; `NodeProvisionForm` merece confirmar en historial que no exista un deep link externo antes de eliminarlo.

## 7. Aspectos correctos encontrados

- Inter se aplica globalmente y JetBrains Mono se reserva para IPs, claves, codigos y datos tecnicos.
- Tailwind y las clases base (`btn`, `card`, `input-field`, badges) ya proporcionan una base coherente.
- Los modulos principales usan lazy loading; ExcelJS, jsPDF y html2canvas quedan fuera de la carga inicial.
- Nodos pagina a 50 filas y Actividad reciente pagina a 8.
- Los hooks SSE y la mayoria de intervalos limpian listeners/timers correctamente.
- Semgrep no encontro secretos, XSS ni patrones de seguridad bloqueantes en las reglas completadas.

## 8. Plan de correccion recomendado

### Fase FE-1 - integridad y errores

1. Corregir `useNodeManagement` y cubrir eliminacion del nodo activo.
2. Incorporar Error Boundary por modulo lazy.
3. Modelar estados de error/reintento en Equipo y llamadas silenciosas criticas.
4. Corregir composicion de `AbortSignal`.

### Fase FE-2 - accesibilidad y validaciones

1. Crear primitivo Dialog/Drawer y migrar overlays.
2. Reparar formularios auth/invitacion: labels, autocomplete, reglas y `aria-live`.
3. Convertir ordenacion de tablas a controles de teclado con `aria-sort`.
4. Normalizar targets tactiles a 44 px.

### Fase FE-3 - responsive y navegacion

1. Eliminar overflows de login y Workspace.
2. Definir presets de columnas/tablas para movil.
3. Pasar modulos a rutas con historial y URLs compartibles.
4. Agregar transicion sutil respetando `prefers-reduced-motion`, sin remontar estado innecesariamente.

### Fase FE-4 - sistema visual

1. Sustituir `text-slate-400` legible por tokens AA.
2. Corregir los 21 hallazgos del auditor de diseno.
3. Ajustar DS05 para no ocultar fallos del modo claro por tener variante dark.
4. Documentar colores semanticos AP/CPE/tags como excepciones tokenizadas.

### Fase FE-5 - rendimiento y limpieza

1. Hacer dinamico `qrcode` y separar los exports de contratos/Zod.
2. Evitar la doble llamada `/account/me`.
3. Paginar/virtualizar tablas segun volumen medido.
4. Retirar los 42 archivos muertos, `cpeCache` residual y dependencias directas sin uso.

### Fase FE-6 - calidad

1. Reparar `test:coverage` y establecer umbral gradual.
2. Agregar E2E de login, invitacion, navegacion, drawer, modal, tabla y error de API en desktop/mobile.
3. Ejecutar build, lint, tests, Semgrep, auditor de diseno y capturas responsive en CI.

## 9. Orden de ejecucion sugerido

El orden recomendado es **FE-1 -> FE-2 -> FE-3 -> FE-4 -> FE-5 -> FE-6**. FE-1 y FE-2 reducen riesgo funcional y de accesibilidad; la limpieza de codigo debe ir despues para no mezclar eliminaciones grandes con correcciones de comportamiento.
