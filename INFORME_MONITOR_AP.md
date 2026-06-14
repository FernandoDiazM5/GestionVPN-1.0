# Informe de auditoría — Vista **Monitor AP**

> Alcance: módulo `ApMonitorModule` (frontend) + endpoints `ap.routes.js` / `ap.service.js` (backend) que lo alimentan.
> Fecha: 2026-06-14 · Branch: `dev`
> Herramientas usadas: `npm run audit:design` (auditor del sistema de diseño), `tsc --noEmit`, `eslint`, `npm audit`, tests (Vitest), revisión manual de código.

## 0. Estado base (verificado)

| Check | Resultado |
|---|---|
| `tsc --noEmit` (frontend) | ✅ 0 errores |
| `eslint` (frontend) | ⚠️ 0 errores · 117 warnings (2 reales de hooks, resto `any`/react-refresh) |
| `audit:design` global | ✅ 0 errores · 20 warnings · 3 infos |
| Tests backend / frontend | ✅ 142 / 44 passing |
| `npm audit --omit=dev` backend | ✅ 0 vulnerabilidades |
| `npm audit --omit=dev` frontend | ⚠️ 2 moderate (uuid vía exceljs) |

**Conclusión:** no hay errores que rompan el build. Los hallazgos son de **consistencia visual (dark mode + paleta), UX y seguridad/correctitud en backend**.

---

## A. Frontend — Consistencia visual / sistema de diseño

### 🔴 A1 — Dark mode incompleto (alto impacto, el tema por defecto es oscuro)
La app arranca en dark mode por defecto, pero muchos textos/bordes usan colores *light-only* sin variante `dark:`. En dark mode quedan con contraste pobre o casi invisibles.

- `ApGroupCard.tsx:64` — `text-slate-800` (nombre del nodo, sin `dark:`)
- `ApRow.tsx:57` — `text-slate-800` (nombre del AP)
- `CpeRow.tsx:53` — `text-slate-800`
- `CpeDetailModal.tsx:168`, `StatCard.tsx:5` — fallback `text-slate-800`
- Bordes/fondos `border-cyan-100 bg-cyan-50/30` (ApGroupCard sección "CPEs guardados") sin `dark:`
- Container del toggle de filtros `border-slate-200` sin `dark:border-slate-700` (`ApMonitorModule.tsx:135`)
- ~16 ocurrencias `text-slate-700/800/900` sin `dark:` solo en este módulo.

### 🟠 A2 — Mal uso de la paleta `violet` (reservada a WireGuard) y doble color para "CPE"
CLAUDE.md: *"accent / violet → SOLO etiqueta de protocolo WireGuard"* y *"cpe / cyan → SOLO indicadores de CPEs"*.

- `violet` se usa para cosas que **no** son WireGuard: contador "CPEs live" del header (`ApMonitorModule.tsx:133`), badge de conteo live (`ApRow.tsx:114`), botón "Informe" (`ApRow.tsx:164`), botón "Enrich" (`StationTable.tsx:103`).
- Resultado: el concepto **CPE** se pinta con **dos paletas distintas** — `cyan` (CPEs guardados, `ApGroupCard.tsx:72,130`) y `violet` (CPEs live). Un concepto = un color. Confunde la lectura semántica.

**Corrección:** todo lo "CPE" → `cyan`; liberar `violet` por completo. El botón "Informe" debería ser `.btn-outline` neutro.

### 🟡 A3 — Gradiente multicolor (DS04, ya lo marca el auditor)
- `StationTable.tsx:79` — `bg-gradient-to-r from-indigo-50/40 to-slate-50/20` mezcla paletas. Sustituir por fondo plano (`bg-slate-50 dark:bg-slate-800/40`).

### 🟡 A4 — Botones con color inline sin clase del sistema (DS06, ya lo marca el auditor)
- `modals/ApDetailModal.tsx:168` y `modals/MoveToNodeModal.tsx:49` — `bg-indigo-600 text-white …` inline en vez de `.btn-primary`. Pierden `active:scale`, focus ring y dark mode coherente.

### 🟡 A5 — Radios de borde inconsistentes
- El toggle de filtros usa `rounded-lg` (`ApMonitorModule.tsx:135`); el buscador y el selector de poll usan `rounded-xl`. CLAUDE.md: controles → `rounded-xl`. Botones internos del row mezclan `rounded-lg`.

### 🟡 A6 — Semántica de color de señal/CCQ incorrecta
`utils/colors.ts`:
- `sigColor`: bueno→`emerald`, medio→`sky`, débil→`amber`. Problemas: (a) `sky` está reservado a "informativo neutro", no a un nivel de calidad; (b) **no hay rojo** para señal crítica (-90 dBm muestra `amber`, igual que -76).
- `ccqColor`: mismo patrón, sin estado de peligro.
- **Corrección:** escala `emerald → amber → rose` (bueno/advertencia/crítico), sin `sky`. Añadir `dark:` a cada uno.

### 🟡 A7 — `text-2xs` fuera de su uso permitido
Las etiquetas "Activos / Inactivos / Todos" usan `text-2xs` (`ApMonitorModule.tsx:144,154,164`). CLAUDE.md reserva `text-2xs` a micro-badges de estado, no a botones de filtro.

---

## B. Frontend — UX

### 🔴 B1 — Las estadísticas del header no coinciden con lo que se ve
Cuando el filtro está en **Activos** y no hay túnel, el cuerpo muestra "Sin túnel VPN activo" (vacío) pero el header sigue diciendo **"3 nodos · 17 APs"** (cuenta sobre `nodeGroups`, no sobre `filteredGroups`). Es exactamente lo que se ve en el screenshot: contadores que no reflejan la vista. → Calcular los totales sobre `filteredGroups`, o etiquetar claramente "(total)".

### 🟠 B2 — Estado vacío sin acción
"Sin túnel VPN activo" no ofrece salida. Debería incluir un CTA (`Conectar a un nodo` → Workspace/Nodos) o un botón para cambiar el filtro a "Todos".

### 🟠 B3 — Auto-poll por defecto vs. política SSH §43
`usePolling.ts:26-28` → intervalo por defecto **30 s**. Al expandir un AP se dispara polling SSH recurrente automático. La política §43 (HANDOFF) **prohíbe el polling SSH automático** y solo admite: fetch puntual al abrir, refresh manual, o job backend. Hay que decidir: (a) default `0` (Off) y dejar el auto-poll solo como opt-in explícito, o (b) mover el polling a un job backend que escribe en DB y el frontend lee de DB. Hoy contradice el contrato documentado.

### 🟡 B4 — Accesibilidad
- Botón `X` de limpiar búsqueda sin `aria-label`/`title` (`ApMonitorModule.tsx:174`, `StationTable.tsx:97`).
- `<select>` de intervalo de poll sin `aria-label`.
- Inputs de búsqueda sin `<label>` asociado (solo placeholder).

### 🟡 B5 — `window.confirm` para eliminar
`useApMonitorLogic.ts:111` usa `window.confirm` nativo (bloqueante, fuera del sistema visual). Reemplazar por modal de confirmación del sistema, coherente con el resto de la app.

### 🟡 B6 — Toast ad-hoc
`ApMonitorModule.tsx:110` monta su propio toast `fixed`. Si existe un sistema de notificaciones unificado, centralizar para consistencia.

---

## C. Backend — endpoints que alimentan Monitor AP

### 🔴 C1 — `POST /api/ap-monitor/cpes/enrich-batch` sin control de propiedad (IDOR)
`ap.routes.js:503` — a diferencia de `poll-direct` y `detail-direct`, **no llama a `ownsApUuid`**. Resuelve credenciales desde `aps WHERE uuid = apId` para **cualquier** `apId` y luego hace SSH a las IPs que mande el cliente. Un usuario autenticado podría usar el `apId` de otro workspace y disparar SSH con sus credenciales. **Falta el check de aislamiento** + validación de que las IPs pertenecen a ese AP/nodo.

### 🔴 C2 — `poll-direct` hace SSH a una IP arbitraria del body con credenciales del AP (SSRF)
`ap.routes.js:418` — usa `ip` **del body**, no la IP almacenada del AP. Aunque valida `ownsApUuid(apId)`, la IP es controlada por el cliente, así que se puede forzar una conexión SSH (con las credenciales cifradas del AP) hacia un host arbitrario. **Corrección:** usar `apRow.ip` de la DB, ignorar la IP del body.

### 🟠 C3 — Resolución de credenciales por "primer nodo que aparezca" (bug de correctitud)
`poll-direct` (`:401-412`) y `detail-direct` (`:592-597`) recorren **todos** los `node_ssh_creds` y usan el primero, porque *`ap_group` no está enlazado a `nodes`* (el propio comentario lo admite). Esto puede probar credenciales del **nodo equivocado** contra un AP. Es un hueco del modelo de datos: falta FK `ap_groups.node_id`.

### 🟠 C4 — Credenciales SSH en claro viajando por el navegador
`usePolling.ts:53` envía `pass: dev.sshPass` (texto plano) en el body de `poll-direct`; `StationTable.tsx:54` igual en `enrich-batch`. Las credenciales **ya están cifradas en la DB** y el backend sabe resolverlas. El frontend no debería transportar secretos. **Corrección:** dejar de enviar `user/pass` desde el front y resolver siempre server-side.

### 🟡 C5 — Inconsistencia de contrato API
`poll-direct` responde `res.json({ success:false })` con **HTTP 200** en el `catch` (`ap.routes.js:476`), mientras todo el resto del archivo usa `res.status(500)`. Unificar a 500 para errores de servidor.

---

## D. Plan de implementación / corrección (por fases, commits pequeños)

> Orden recomendado: **seguridad backend → consistencia visual → UX → features**. Cada fase es independiente y verificable.

### Fase 1 — Seguridad backend (bloqueante) 🔴
1. **C1**: añadir `if (!(await ownsApUuid(db, req, apId)))` al inicio de `enrich-batch`.
2. **C2**: en `poll-direct`, leer `ip/port` de `apRow` (DB) y **no** del body.
3. **C4**: eliminar el envío de `user/pass` desde `usePolling.ts` y `StationTable.tsx`; resolver creds 100% en backend.
4. **C5**: cambiar el `catch` de `poll-direct` a `res.status(500)`.
- *Verificación:* tests backend + smoke; añadir test de aislamiento para `enrich-batch`.

### Fase 2 — Modelo de datos (correctitud) 🟠
5. **C3**: añadir columna/relación `ap_groups.node_id` (FK a `nodes`) + migración + backfill; usar esa relación para resolver `node_ssh_creds` en vez de "el primero". (Tarea mayor — puede ir como issue aparte.)

### Fase 3 — Consistencia visual (dark mode + paleta) 🟠
6. **A1**: barrer el módulo y añadir `dark:` a todos los `text-slate-700/800/900`, bordes `slate-200`/`cyan-100` y fondos `cyan-50`.
7. **A2**: migrar todo lo "CPE" a `cyan`; quitar `violet` (header, badge live, botones "Informe"/"Enrich"). "Informe" → `.btn-outline`.
8. **A3/A4**: quitar gradiente de `StationTable:79`; pasar botones inline de los dos modales a `.btn-primary`.
9. **A5**: unificar radios a `rounded-xl` en controles.
10. **A6**: reescribir `colors.ts` a escala `emerald→amber→rose` con `dark:`.
11. **A7**: subir labels de filtro a `text-xs`.
- *Verificación:* `npm run audit:design` (debe seguir en 0 errores y bajar warnings) + revisión visual en dark/light.

### Fase 4 — UX 🟡
12. **B1**: totales del header calculados sobre `filteredGroups`.
13. **B2**: CTA en el estado vacío ("Conectar a un nodo" / "Ver todos").
14. **B3**: decidir política de auto-poll (default `0` o mover a job backend) acorde a §43.
15. **B4**: `aria-label` en botones icon-only y `<select>`; `<label>` en inputs.
16. **B5**: confirmación de borrado con modal del sistema.

### Fase 5 — Mantenimiento
17. Bajar warnings de eslint reales: `useSession.ts:48` (setState en effect) y `useWorkspaceEvents.ts:18` (ref en render).
18. `npm audit fix` del front (uuid/exceljs) evaluando el breaking change.

---

## E. Funcionalidades adicionales propuestas

| # | Feature | Por qué | Esfuerzo |
|---|---|---|---|
| E1 | **Monitoreo vía job backend → DB** (SSE/WebSocket al front) | Cumple §43, datos "live" sin SSH desde el navegador, sin coste por panel abierto. Reusa `monitoringJob`/`signal_history`. | Alto |
| E2 | **Sparkline de señal por AP/CPE en la fila** | `signal_history` ya se guarda; un mini-gráfico de tendencia da contexto sin abrir modal. | Medio |
| E3 | **Umbrales de alerta** (señal < X, CCQ < Y) con badge de color | Detección proactiva de enlaces degradados. | Medio |
| E4 | **Exportar CPEs a CSV** por AP/nodo | Ya existe util `csv` en backend; reporte operativo. | Bajo |
| E5 | **Acción "Reiniciar AP"** (con modal de confirmación + auditoría) | Contemplado por la política §43 como reversible y con confirmación. | Medio |
| E6 | **Densidad de tabla / presets de columnas** | Mejora ergonomía en pantallas densas. | Bajo |
| E7 | **Indicador "última actualización" global** + auto-refresh visible | Hoy el `polledAt` está por tabla; un reloj global aclara frescura. | Bajo |

---

## Resumen ejecutivo

- **Nada está roto a nivel build/tests.** Los problemas son de **dark mode incompleto**, **mal uso de paleta** (violet/cyan para CPE), y **3 hallazgos de seguridad/correctitud en backend** (`enrich-batch` sin authz, `poll-direct` con IP del body, resolución de credenciales por nodo equivocado).
- **Empezar por la Fase 1 (seguridad)** y la **Fase 3 (visual)**, que son las de mayor impacto/menor riesgo.
- Las features E1 (job backend + SSE) y E3 (alertas) son las que más alinean el producto con la política operativa y el valor para el operador.
