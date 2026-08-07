# 🎨 Sistema de Diseño — Joinpoint NOC

## Escala canónica de interfaz

Las vistas reutilizan los componentes de `components/Common/ui.tsx`; no deben reconstruir estos patrones con tamaños manuales.

| Uso | Tamaño | Peso |
|---|---:|---:|
| Título de página (`PageHeader`) | 20 px; 18 px en móvil | 700 |
| Título de tarjeta o estado vacío | 18 px | 700 |
| Subtítulo o sección | 16 px | 600–700 |
| Texto normal | 14 px | 400 |
| Botón normal | 14 px | 600 |
| Etiqueta auxiliar | 12 px | 500–600 |
| Dato técnico | 12–14 px, JetBrains Mono | 400–600 |

### Componentes estructurales

- `PageHeader`: icono de 24 px dentro de 48 × 48 px, separación de 16 px y tarjeta con 24 px de relleno.
- `EmptyState`: icono de 32 px dentro de 64 × 64 px, descripción de máximo 448 px, acciones separadas 24 px y relleno vertical de 48 px.
- `Button`: exige variante y tamaño semánticos. Toda variante conserva objetivo táctil mínimo de 44 px; `sm` reduce sólo el relleno y la tipografía para tablas, modales y controles densos.
- `SectionCard`, `StatusBadge`, `SearchInput` y `SegmentedControl`: concentran superficie, estado, búsqueda y selección.

Las clases manuales pueden definir distribución (`w-full`, anchos responsivos), pero no deben redefinir tipografía, altura, padding o color del componente salvo una excepción documentada.

> Identidad visual única para todo el proyecto. Cualquier componente nuevo o
> modificación debe seguir estos parámetros. Las reglas operativas resumidas
> están en [`/CLAUDE.md`](../../CLAUDE.md).
>
> **Última actualización:** 2026-05-30

---

## 1. Filosofía

Herramienta de administración de red para profesionales. La estética es
**"minimalismo técnico con feedback en vivo"**: superficie limpia y neutra,
datos en monoespaciada, y color usado con disciplina para comunicar **estado**,
no para decorar. El operador debe leer el estado de 12+ nodos en menos de 2
segundos.

**Principio rector:** el color es información. Si un elemento no comunica un
estado o una acción, es neutro (`slate`).

---

## 2. Color

### 2.1 Tokens semánticos

Usa los **nombres semánticos** (no el color crudo) en componentes nuevos:

| Token Tailwind | Variable CSS | Paleta | Significado ÚNICO |
|----------------|--------------|--------|-------------------|
| `brand-*`   | `--c-brand`   | índigo  | Acción primaria, links, foco, interactivo |
| `success-*` | `--c-success` | esmeralda | Éxito · activo · conectado |
| `danger-*`  | `--c-danger`  | rosa    | Peligro · desconectado · revocar · error |
| `warning-*` | `--c-warning` | ámbar   | Advertencia · por expirar |
| `info-*`    | `--c-info`    | celeste | Informativo neutro (subredes, dato 2º) |
| `accent-*`  | `--c-accent`  | violeta | SOLO etiqueta de protocolo WireGuard |
| `neutral-*` / `slate-*` | `--c-text*` | gris | Texto, estructura, datos (~80%) |

### 2.2 Escala de uso (regla 80/15/5)

- **80 % neutro** (slate): fondos, texto, bordes, la mayor parte de las tablas.
- **15 % color de estado** (success/danger/warning): badges, indicadores.
- **5 % brand** (índigo): el botón primario, el link activo, el foco.

### 2.3 Anti-patrones (lo que rompió la v1)

❌ Un color con dos significados (índigo = acción Y dato VRF).
❌ Cada columna de la tabla con su propio color.
❌ Ícono de estado azul + badge de estado verde para el mismo "conectado".
❌ Más de un botón con relleno sólido por zona.
❌ Gradientes multicolor en estados (`from-emerald-50 to-sky-50`).

✅ Tabla neutra; color solo en la columna de estado.
✅ Un estado → un color, en todas sus representaciones.
✅ Un botón primario sólido; el resto `.btn-outline`.

---

## 3. Tipografía

| Uso | Familia | Clase | Pesos |
|-----|---------|-------|-------|
| UI / texto / títulos | **Inter** | `font-sans` (default) | 400–800 |
| Datos técnicos (IP, VRF, MAC, puertos, usuarios, claves) | **JetBrains Mono** | `font-mono` / `.data-cell` | 400–700 |

Cargadas vía Google Fonts en `index.html`. Declaradas en `tailwind.config.js`.

### Escala de tamaños

| Token | px | Uso |
|-------|----|----|
| `text-2xl` | 24 | Números de stats, métricas grandes |
| `text-lg` | 18 | Títulos de sección |
| `text-sm` | 14 | Texto de cuerpo, botones |
| `text-xs` | 12 | **Mínimo legible.** Tablas, labels, datos |
| `text-2xs` | 11 | SOLO micro-badges de estado |

🚫 **Prohibido `text-[10px]`.** Bajo el umbral de legibilidad.

---

## 4. Componentes reutilizables (`src/index.css`)

### Botones
```tsx
<Button variant="primary" size="md">Actualizar</Button>  {/* acción principal */}
<Button variant="success" size="md">Nuevo sitio</Button> {/* crear o confirmar */}
<Button variant="danger" size="md">Revocar</Button>      {/* destructivo */}
<Button variant="outline" size="md">Descargar</Button>   {/* secundario */}
<Button variant="ghost" size="md">Cancelar</Button>      {/* terciario */}
```
Base visual común: Inter semibold, radio de 12 px, transición de 200 ms,
reducción a 98 % al pulsar, foco de 2 px y objetivo táctil mínimo de 44 px.
Las acciones elevadas usan sombra semántica al 25 % y la refuerzan al 40 %
en hover. El color cambia por intención, no por componente. Regla: **un solo
botón de color sólido por zona**; el resto `.btn-outline`/`.btn-ghost`.
Tabs, menús, selectores y botones exclusivamente de icono comparten foco,
tipografía y respuesta al toque, pero no reciben sombra elevada.

### Badges de estado
```tsx
<span className="badge badge-success">Conectado</span>
<span className="badge badge-danger">Desconectado</span>
<span className="badge badge-warning">Por expirar</span>
<span className="badge badge-accent">WG</span>      {/* protocolo */}
<span className="badge badge-info">SSTP</span>      {/* protocolo */}
```

### Datos en tablas
```tsx
<td><span className="data-cell text-emerald-600">{ip}</span></td>
<td><span className="data-muted">—</span></td>   {/* valor vacío */}
<th className="th-cell">VRF</th>
```

### Contenedores e inputs
```tsx
<div className="card p-6">…</div>
<div className="card card-hover p-4">…</div>
<input className="input-field" />
```

---

## 5. Espaciado y forma

| Elemento | Valor |
|----------|-------|
| Radio de card | `rounded-2xl` (16px) |
| Radio de control (botón/input) | `rounded-xl` (12px) |
| Padding de card | `p-4` (compacto) · `p-6` (espacioso) |
| Separación entre secciones | `space-y-5` |
| Gap en filas de controles | `gap-2` / `gap-3` |

---

## 6. Motion

El movimiento **comunica cambios de estado**, no adorna.

| Permitido | Cuándo |
|-----------|--------|
| `active:scale-[0.98]` | Feedback táctil al pulsar |
| `animate-pulse` | Estado crítico / urgente |
| `<Spinner />` (`Common/Spinner`) | Carga en progreso (ver 6.1) |
| `transition-all duration-200` | Hover suave |
| `anim-*` (ver 6.2) | Entrada de toasts, banners, drawers, overlays |

🚫 Evita varias animaciones infinitas simultáneas en la misma zona (distrae).
🚫 No animes elementos que no cambian de estado.
🚫 **PROHIBIDO `animate-in` / `fade-in` / `zoom-in-*` / `slide-in-from-*`** (clases del plugin `tailwindcss-animate`): el plugin **NO está instalado** — esas clases no generan CSS y el elemento aparece en seco, sin error visible. Usa las utilidades `anim-*` de 6.2. Lo vigila la regla **DS09** del auditor.

### 6.1 Carga — Spinner SVG canónico

Componente único de carga: **`Common/Spinner`** (arco SVG con animación de trazo sobre anillo tenue). Reemplaza los `<Loader2 className="animate-spin" />` ad-hoc en loaders centrales.

```tsx
<Spinner />                                  // 24px indigo inline
<Spinner block label="Cargando resumen…" />  // loader de módulo, centrado py-12
<Spinner className="text-violet-500" />      // color = intención del contexto (WG)
<Spinner size="lg" />                        // xs 14 · sm 16 · md 24 · lg 32
```

- Color por `currentColor` → pásalo con `text-<paleta>-500` según el contexto semántico.
- `role="status"` + `label` accesible incluidos.
- `prefers-reduced-motion`: degrada a rotación lenta sin morphing (CSS `.spinner-svg`).
- `Loader2` sigue siendo válido **dentro de botones** (spinner de acción en curso, hereda el color del botón).
- Placeholders de contenido → `.skeleton` (shimmer con dark + reduced-motion), no un spinner pelado.

### 6.2 Animaciones de ENTRADA — utilidades `anim-*` (index.css §55)

Keyframes propios (mismo racional que §50: nada de plugins). Un elemento = una clase; todas respetan `prefers-reduced-motion`.

| Clase | Efecto | Úsala en |
|-------|--------|----------|
| `anim-fade-in` | fade 200ms | Backdrops, apariciones simples |
| `anim-fade-up` | fade + sube 12px | Contenido de módulo (`<main>` de App) |
| `anim-fade-down` | fade + baja 8px | Banners que caen (DeepLink, progreso de escaneo) |
| `anim-slide-left` / `anim-slide-right` | fade + 16px lateral | Pasos de provisión / toasts |
| `anim-zoom-in` | fade + scale 0.95→1 | Paneles/imágenes destacadas |
| `anim-drawer-left` | translateX(-100%)→0 | Drawer móvil del Sidebar |

Los modales NO las necesitan: `.modal-overlay`/`.modal-panel` ya traen su animación (§50).

---

## 7. Accesibilidad (WCAG AA)

- Texto sobre blanco: usa `slate-600`+ para labels (contraste ≥ 4.5:1). `slate-400` solo para texto decorativo grande.
- Estado nunca solo por color → acompaña con **icono + texto**.
- Botones icon-only → `aria-label` o `title`.
- Foco de teclado visible en elementos interactivos.

---

## 8. Iconografía

- Librería única: **lucide-react**. No mezclar con emojis ni SVG inline ad-hoc.
- Tamaños: `w-4 h-4` (inline texto), `w-5 h-5` (botones), `w-3.5 h-3.5` (compacto en tabla).
- Iconos de estado de nodo: `Wifi` (conectado), `WifiOff` (caído), `Radio` (sesión activa), `Loader2` (pending).

---

## 9. Checklist antes de mergear UI

- [ ] ¿Cada color comunica una intención del sistema (sección 2.1)?
- [ ] ¿La tabla es neutra salvo la columna de estado?
- [ ] ¿Un solo botón sólido por zona?
- [ ] ¿Los datos técnicos usan `font-mono`?
- [ ] ¿Ningún texto bajo `text-xs` (12px)?
- [ ] ¿Reutilicé `.badge` / `.btn-*` / `.data-cell` en vez de clases sueltas?
- [ ] ¿Los iconos son de lucide-react (sin emojis)?
- [ ] ¿Botones icon-only con `aria-label`?
