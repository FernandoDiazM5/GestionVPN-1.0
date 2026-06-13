# 🎨 Plan de Estandarización del Sistema de Diseño

> **Objetivo**: que toda la UI se sienta como **un único producto** —
> mismos botones, mismos efectos, mismos colores semánticos, dark mode
> consistente, sin "parches" de proyectos distintos.
>
> **Tracking**: ejecutar `npm run audit:design` después de cada commit
> para medir progreso. El total inicial era **1,096 hallazgos**.

---

## 📊 Estado actual

### Antes de este plan (snapshot inicial §45)

| Severidad | Regla | Violaciones | Archivos |
|---|---|---|---|
| info    | DS05 — `text-slate-300/400` posible contraste insuficiente | 411 | 97 |
| **error**   | DS03 — `text-[10/11px]` literales | **313** | 57 |
| warning | DS02 — fondo claro sin variante `dark:` | 265 | 80 |
| **error**   | DS01 — color fuera de la paleta semántica | **62** | 16 |
| info    | DS06 — botón con `bg+text` inline en vez de `.btn-*` | 26 | 17 |
| warning | DS04 — gradiente multicolor (mezcla paletas) | 19 | 10 |
| | **TOTAL** | **1,096** | 333 archivos |

### Después de §46 (wins rápidos + sistema extendido)

| Severidad | Regla | Antes | Después | Δ |
|---|---|---|---|---|
| **error**   | DS03 — `text-[10/11px]` literales | 313 | **61** | **−252 (−80.5%)** |
| **error**   | DS01 — palette prohibida (red/blue/green/etc) | 62 | **55** | **−7** |
| info    | DS05 — text-slate-300/400 | 411 | 411 | 0 (requiere revisión manual) |
| warning | DS02 — bg sin dark: | 265 | 265 | 0 (refactor archivo por archivo) |
| info    | DS06 — botón inline | 26 | 26 | 0 (necesita extender clases — hecho en §46-1) |
| warning | DS04 — gradiente multicolor | 19 | 19 | 0 (excepción documentada — backgrounds decorativos) |
| | **TOTAL** | **1,096** | **837** | **−259 (−23.6%)** |

---

## 🧰 Sistema de diseño extendido (§46-1)

Estas clases viven en [`vpn-manager/src/index.css`](vpn-manager/src/index.css) y deben usarse **siempre** que el contexto lo permita.

### 🔘 Botones — catálogo canónico

| Clase | Intención | Color base | Cuándo usar |
|---|---|---|---|
| `.btn-primary` | Acción primaria de la zona | indigo | **1 por zona** (Login, Guardar, Confirmar) |
| `.btn-success` | Confirmación positiva | emerald | Guardar, Activar, Conectar |
| `.btn-danger`  | Acción destructiva | rose | Eliminar, Revocar, Cancelar destructivo |
| `.btn-warning` | Atención sin destruir | amber | Renovar pronto, Reintentar |
| `.btn-info`    | Acción informativa | sky | Mostrar detalles, Más info |
| `.btn-accent`  | Etiqueta semántica violet | violet | Acciones WireGuard, secundario destacado |
| `.btn-outline` | Secundario que acompaña primario | slate | Cancelar suave, Cerrar modal |
| `.btn-ghost`   | Terciario sin fondo | slate | Botones icon-only, links de tabla |

**Todos** los `.btn-*` traen ahora:
- ✅ `transition-all duration-200`
- ✅ `active:scale-[0.98]` (feedback táctil)
- ✅ `focus-visible:ring-2 ring-offset-2` (WCAG)
- ✅ `disabled:opacity-50 disabled:cursor-not-allowed`
- ✅ Variante `dark:` con `ring-offset-slate-900`
- ✅ Shadow semántico (`shadow-{color}-500/25`)

### 📏 Tamaños — modificadores composables

| Clase | Padding | Texto | Cuándo usar |
|---|---|---|---|
| `.btn-sm` | `px-3 py-1.5` | `text-xs` | Botones de tabla/celda |
| `.btn-md` | `px-4 py-2.5` | `text-sm` | **Default** — la mayoría de casos |
| `.btn-lg` | `px-5 py-3` | `text-base` | Hero / acciones principales |
| `.btn-icon` | `p-2` | — | Icon-only (con `aria-label`) |

**Ejemplo de composición:**

```tsx
<button className="btn-primary btn-md">Guardar</button>
<button className="btn-outline btn-sm">Cancelar</button>
<button className="btn-danger btn-icon" aria-label="Eliminar">
  <Trash2 className="w-4 h-4" />
</button>
```

### 🪟 Modal canónico

```tsx
{open && (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-panel" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Título</h2>
        <button className="btn-ghost btn-icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="modal-body">…</div>
      <div className="modal-footer">
        <button className="btn-outline btn-md" onClick={onClose}>Cancelar</button>
        <button className="btn-primary btn-md" onClick={onConfirm}>Confirmar</button>
      </div>
    </div>
  </div>
)}
```

### 🏷️ Badges — única fuente para estados

`.badge` + `.badge-{success|danger|warning|info|neutral|accent}`. Ya estandarizado desde §38.

### 📊 Datos en tablas

- `.data-cell` — `font-mono text-xs font-semibold text-slate-700`
- `.data-muted` — cuando el valor es `null` o `'—'`
- `.th-cell` — encabezado estándar de columna

### 🎴 Cards

- `.card` — contenedor base (bg + border + shadow + dark)
- `.card-hover` — agrega hover effect

---

## 🛣️ Fases de refactor

### ✅ Fase 0 — Sistema extendido + wins rápidos (§46) — **COMPLETADA**

- [x] Agregar `.btn-warning`, `.btn-info`, `.btn-accent` faltantes
- [x] Agregar `focus-visible:ring` WCAG a TODOS los `.btn-*`
- [x] Agregar `disabled:` consistente
- [x] Agregar tamaños `.btn-sm` / `.btn-md` / `.btn-lg` / `.btn-icon`
- [x] Agregar `.modal-overlay` / `.modal-panel` / `.modal-header` / `.modal-body` / `.modal-footer`
- [x] sed-replace `text-[11px]` → `text-2xs` (−252)
- [x] sed-replace `text-[10px]` → `text-2xs`
- [x] sed-replace `from-blue-50` → `from-sky-50` (paleta válida)
- [x] sed-replace `to-blue-50` → `to-sky-50`
- [x] sed-replace `via-blue-50` → `via-sky-50`

**Resultado**: 1,096 → 837 hallazgos (−259, −23.6%). Sin tocar ningún archivo manualmente.

### 🔄 Fase 1 — Migrar botones inline al sistema (P1)

**Objetivo**: eliminar las 26 violaciones DS06 + estandarizar tamaños/efectos en TODOS los botones.

**Estrategia**: por cada archivo con violaciones, reemplazar:

```tsx
// ANTES (inline, sin focus ring, sin disabled state)
<button className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl
                   px-3 py-1.5 text-xs shadow-sm transition-all">
  Guardar
</button>

// DESPUÉS (clase del sistema, todo consistente)
<button className="btn-success btn-sm">Guardar</button>
```

**Archivos prioritarios** (ver `npm run audit:design --rule DS06`):

1. `Devices/NodeAccessPanel/modals/NuevoNodo.tsx`
2. `Devices/NodeAccessPanel/modals/EditarNodo.tsx`
3. `Devices/NetworkDevicesModule/components/DeviceStatusPanel.tsx`
4. `Auth/RouterAccess.tsx`
5. `Admin/ModeratorsModule/ModeratorsModule.tsx`

**Estimación**: 30-45 min por archivo × 17 archivos ≈ **8-12 horas**.

### 🔄 Fase 2 — Dark mode en componentes (P1)

**Objetivo**: bajar las 265 violaciones DS02 (fondos claros sin dark variant).

**Patrón canónico** — cualquier contenedor con bg claro debe tener:

```tsx
// ANTES
<div className="bg-white border border-slate-200 rounded-xl p-4">

// DESPUÉS — usar la clase del sistema
<div className="card p-4">

// O explícito si necesitas variante:
<div className="bg-white border border-slate-200 rounded-xl p-4
                dark:bg-slate-900 dark:border-slate-800">
```

**Top 10 archivos** (`npm run audit:design --rule DS02`):

1. NuevoNodo.tsx — 32 violaciones
2. DeviceStatusPanel.tsx — 22
3. constants.ts (NodeAccessPanel) — 21
4. EditarNodo.tsx — 18
5. ApGroupCard.tsx — 14
6. UsersTable.tsx — 13
7. BatchCsvModal.tsx — 12
8. ModeratorsModule.tsx — 10
9. ApRow.tsx — 10
10. NodeProvisionForm/* — 9

**Estimación**: 1-2h por archivo top × 10 ≈ **15-20 horas**.

### 🔄 Fase 3 — Modales unificados (P2)

**Objetivo**: que TODOS los modales usen `.modal-overlay/.modal-panel/.modal-header/.modal-body/.modal-footer`.

**Modales actuales del proyecto** (15+ archivos):

- `NodeAccessPanel/modals/NuevoNodo.tsx`
- `NodeAccessPanel/modals/EditarNodo.tsx`
- `NodeAccessPanel/modals/EliminarNodo.tsx`
- `NodeAccessPanel/modals/ScriptModal.tsx`
- `NodeAccessPanel/modals/BatchCsvModal.tsx`
- `NodeAccessPanel/modals/DiagnosticsModal.tsx`
- `NodeAccessPanel/modals/HistoryModal.tsx`
- `NodeAccessPanel/modals/TagModal.tsx`
- `NetworkDevicesModule/components/AddDeviceModal.tsx`
- `Common/M5FullInfoModal/M5FullInfoModal.tsx`
- `Users/UserManagementPanel/components/WgConfigModal.tsx`
- `Team/TeamModule/components/MemberWireGuardModal.tsx`
- `Devices/NodeAccessPanel/components/DeepLinkBanner.tsx` (no es modal pero similar)

**Estimación**: 20-30 min por modal × 13 ≈ **6-8 horas**.

### 🔄 Fase 4 — Texto contraste WCAG (P3)

**Objetivo**: bajar los 411 DS05 (`text-slate-300/400` en fondo claro).

**Regla aplicar**:
- Labels descriptivos (Sin búsqueda, contadores, hints): mínimo `text-slate-500` sobre fondo blanco.
- Texto principal (títulos, valores): mínimo `text-slate-700`.
- `text-slate-300/400` SOLO si:
  - Está acompañado de `dark:text-slate-{500|600}` para dark mode.
  - O es decorativo (icono de fondo, separador).

**Estimación**: 5-10 min por archivo × 97 ≈ **8-16 horas**. **Pero**: ataque masivo con sed después de identificar patrones seguros.

### 🔄 Fase 5 — DS01 palette prohibida (P4)

**Objetivo**: eliminar los 55 DS01 (colores `red/blue/green/yellow/orange/purple/pink/gray/etc`).

**Regla**:
- `red-*` → `rose-*` (mismo significado, paleta correcta)
- `green-*` → `emerald-*`
- `blue-*` → `sky-*` (si es info) o `indigo-*` (si es acción)
- `yellow-*` → `amber-*`
- `gray-*` → `slate-*`
- `purple-*`/`pink-*` → revisar caso por caso (¿es violet/accent? ¿es decorativo?)

**Estimación**: 5-15 min por archivo × 16 ≈ **2-4 horas**.

---

## ⏱️ Estimación total

| Fase | Horas | Acumulado |
|---|---|---|
| 0 — Wins rápidos | ✅ Hecho | — |
| 1 — Botones inline → sistema | 8-12h | 12h |
| 2 — Dark mode | 15-20h | 32h |
| 3 — Modales unificados | 6-8h | 40h |
| 4 — Texto contraste | 8-16h | 56h |
| 5 — Palettes prohibidas | 2-4h | **60h** |

≈ **1.5 semanas de trabajo enfocado** para llevar el proyecto a "diseño unificado" + cero warnings/errores en el audit.

**Trabajo incremental**: 1 fase por semana de iteración real (4-8h por sesión) = **6 semanas** sin interrumpir el flujo de features.

---

## 📋 Checklist por archivo (template)

Pegar al inicio de cada PR de refactor:

```markdown
- [ ] Sin literales `text-[10/11px]` (usar `text-2xs`)
- [ ] Todo `<button>` con `className="bg-…"` migrado a `.btn-*` + `.btn-{sm|md|lg|icon}`
- [ ] Todos los `bg-*` claros tienen variante `dark:` o usan `.card` / `.input-field` / etc.
- [ ] Sin colores fuera de la paleta (red/blue/green/yellow/etc.)
- [ ] Sin `text-slate-300/400` sin variante dark (subir a 500-600 si va sobre blanco)
- [ ] Modales con `.modal-overlay/.modal-panel/.modal-header/.modal-body/.modal-footer`
- [ ] `npm run audit:design --rule DS0X` confirma que las violaciones del archivo bajaron
- [ ] `npm run build` y `npx tsc --noEmit` verdes
- [ ] Probado en navegador en light + dark mode
```

---

## 🚦 Reglas operativas (refuerzo)

Las siguientes reglas son **estrictas** y todo PR nuevo debe cumplirlas:

1. **Color = intención** (CLAUDE.md). Nuevos componentes deben usar las 7 paletas permitidas.
2. **`text-2xs` antes que `text-[11px]`** en todo código nuevo. El literal `text-[10/11px]` queda **PROHIBIDO**.
3. **Botones siempre usan `.btn-*`** + un tamaño (`.btn-sm/md/lg/icon`). Botón inline = revisar PR.
4. **Fondos claros (bg-{color}-50/100/200, bg-white) requieren variante `dark:`** o una clase del sistema.
5. **Modales usan `.modal-*`** del sistema. Modal con clases ad-hoc = revisar PR.
6. **CI eventual**: cuando los errores bajen a 0, agregar `npm run audit:design` al workflow `ci.yml`.

---

## 🔗 Referencias

- [`vpn-manager/src/index.css`](vpn-manager/src/index.css) — clases utility del sistema
- [`vpn-manager/src/styles/DESIGN_SYSTEM.md`](vpn-manager/src/styles/DESIGN_SYSTEM.md) — guía visual completa
- [`vpn-manager/tailwind.config.js`](vpn-manager/tailwind.config.js) — paletas semánticas
- [`vpn-manager/CLAUDE.md`](vpn-manager/CLAUDE.md) — reglas operativas del proyecto
- [`scripts/audit-design.js`](scripts/audit-design.js) — auditor automático (`npm run audit:design`)
- Skill `tailwind-design-system` (wshobson/agents, 48.1K installs) — patrones OKLCH + CVA de referencia
