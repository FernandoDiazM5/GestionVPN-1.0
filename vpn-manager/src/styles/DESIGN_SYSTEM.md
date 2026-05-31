# 🎨 Sistema de Diseño — MikroTikVPN Remote Manager

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
<button className="btn-primary px-6 py-3">Actualizar</button>   {/* acción principal */}
<button className="btn-success px-4 py-2.5">Nuevo Nodo</button>  {/* crear */}
<button className="btn-danger px-4 py-2.5">Revocar</button>      {/* destructivo */}
<button className="btn-outline px-3 py-2">CSV</button>           {/* secundario */}
<button className="btn-ghost px-3 py-2">Cancelar</button>        {/* terciario */}
```
Regla: **un solo botón de color sólido por zona**; el resto `.btn-outline`/`.btn-ghost`.

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
| `animate-spin` | Carga en progreso |
| `transition-all duration-200` | Hover suave |

🚫 Evita varias animaciones infinitas simultáneas en la misma zona (distrae).
🚫 No animes elementos que no cambian de estado.

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
