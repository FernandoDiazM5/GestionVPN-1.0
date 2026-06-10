# CLAUDE.md — MikroTikVPN Remote Manager

> Reglas operativas que Claude lee automáticamente en cada sesión.
> El detalle visual completo vive en [`src/styles/DESIGN_SYSTEM.md`](./src/styles/DESIGN_SYSTEM.md).

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + lucide-react (iconos)
- **Estado:** Context API (`src/context`) + hooks por feature
- **Backend:** Express + SQLite + RouterOS API + SSH (ssh2) a Ubiquiti
- Tema: dark mode por clase (`darkMode: 'class'`), default oscuro salvo `localStorage vpn_dark_mode === 'false'`

## Sistema de diseño — REGLAS OBLIGATORIAS

Al crear o modificar CUALQUIER componente, respeta esto sin excepción:

### 🎨 Color = intención (nunca decoración)

| Token | Paleta | Úsalo SOLO para |
|-------|--------|-----------------|
| `brand` / `indigo` | índigo | Acción primaria, links, foco, estado "interactivo" |
| `success` / `emerald` | verde | Éxito, activo, conectado |
| `danger` / `rose` | rojo | Peligro, desconectado, revocar, error |
| `warning` / `amber` | ámbar | Advertencia, por expirar |
| `info` / `sky` | celeste | Informativo neutro (subredes, datos 2º) |
| `accent` / `violet` | violeta | SOLO etiqueta de protocolo WireGuard |
| `neutral` / `slate` | gris | Texto, estructura, datos. **~80% de la UI** |

**Prohibido:**
- Usar un color para dos significados (ej. indigo para "acción" y para "dato VRF").
- Más de **un botón con color sólido** por zona. Los secundarios usan `.btn-outline`.
- Gradientes multicolor (`from-emerald to-sky`) — un estado = un color.
- Dar al mismo estado dos señales de color distintas (ícono azul + badge verde para "conectado").

**Tablas de datos:** mayoritariamente neutras (`slate`). El color se reserva para la columna/badge de **estado**, no para cada columna.

### 🔤 Tipografía

- **UI / texto:** `font-sans` (Inter) — ya es el default, no hace falta declararlo.
- **Datos técnicos** (IP, VRF, MAC, puertos, usuarios, claves): **siempre** `font-mono` (JetBrains Mono) o la clase `.data-cell` / `.data-muted`.
- **Tamaño mínimo: 12px (`text-xs`).** No usar `text-[10px]` ni `text-[11px]`. Para micro-badges existe `text-2xs` (11px) reservado.

### 🧩 Usa las clases del sistema (no reinventes)

Definidas en `src/index.css`:
- Botones: `.btn-primary`, `.btn-success`, `.btn-danger`, `.btn-outline`, `.btn-ghost`
- Badges de estado: `.badge` + `.badge-success` / `.badge-danger` / `.badge-warning` / `.badge-info` / `.badge-neutral` / `.badge-accent`
- Datos: `.data-cell`, `.data-muted` · Tabla: `.th-cell`
- Contenedores: `.card`, `.card-hover` · Inputs: `.input-field`

Tokens semánticos en `tailwind.config.js` (`brand`, `success`, …) y variables CSS en `:root` (`--c-brand`, …).

### 📐 Espaciado y forma

- Contenedores → `rounded-2xl` (`.card`). Controles → `rounded-xl`.
- Stack vertical entre secciones → `space-y-5`.
- Padding de card → `p-4` / `p-6`.

### 🎬 Motion

- El movimiento **señala cambios de estado**, no decora.
- Permitido: `active:scale-[0.98]` en botones, `animate-pulse` en estado crítico, `animate-spin` en carga.
- Evita varias animaciones infinitas simultáneas en la misma zona.

### ♿ Accesibilidad

- Botones icon-only → `aria-label` o `title` obligatorio.
- El estado nunca debe depender SOLO del color: acompaña con icono o texto.
- Labels en `slate-600` mínimo (no `slate-400`) para contraste AA.

## Convenciones de código

- Componentes en PascalCase, un componente por carpeta cuando crece (patrón `NodeCard/`, `NodeAccessPanel/`).
- Lógica → custom hooks (`hooks/`); presentación → `components/`; helpers → `utils/`.
- **No modificar lógica al refactorizar UI** salvo petición explícita.
- Barrel exports (`index.ts`) por carpeta.
- Rutas relativas: cuidado con la profundidad desde `components/sections/` (5 niveles a `src/`).

## Convenciones post-refactor (fases 0-12)

### Contratos API (F5) — `@gestionvpn/contracts`

Tipos compartidos backend↔frontend en `packages/contracts/`. **Cambiar un campo aquí rompe ambos lados en `tsc`** — esa es la garantía.

```ts
// vpn-manager/src/types/account.ts (re-export)
export type { Member, Role, AcceptResponse } from '@gestionvpn/contracts';
```

Tras editar un schema: `npm run build:contracts` (genera `.d.ts`).

### Code-splitting (F10) — lazy modules

Cualquier módulo nuevo se agrega así en `App.tsx`:

```tsx
const Nuevo = lazy(() => import('./components/<Dom>/<Nombre>/<Nombre>'));
// dentro del <Suspense> ÚNICO existente — NO crear uno por módulo
{activeModule === 'nuevo' && <Nuevo />}
```

Suspense fallback: `ModuleSkeleton` (compartido). RouterAccess tiene Suspense propio porque es el flujo público.

Si tu módulo supera 200 KB raw, validar en `npm run analyze` qué arrastra.

### Testing (F3 + F4)

- Vitest globals (`describe`/`it`/`expect`) — están tipados via `vitest/globals` en `tsconfig.app.json`. **No importar de `'vitest'` con `require()`** (rompe el run).
- Wrapper de testing: `renderWithProviders` (en `src/test/render.tsx`) monta `VpnProvider` + `WorkspaceSessionProvider` reales.
- MSW para mocks de fetch — el `server` global está en `src/test/setup.ts`.

### Build production (F10)

- `npm run build` debe pasar antes de commit (lo cubre `pre-commit` con `tsc --noEmit`).
- `npm run analyze` → `dist/stats.html` con treemap (gzip + brotli).
- Bundle inicial objetivo: < 250 KB raw / < 80 KB gzip.

### Auditoría (F12)

- `npm audit --omit=dev` debe ser 0 vulnerabilidades en producción.
- Semgrep en CI: `p/security-audit` + `p/javascript` + `p/typescript` + `p/react` deben quedar en 0 findings (ver `.semgrepignore` para exclusiones legítimas).
- Cualquier bypass intencional (ej. `rejectUnauthorized: false` en certs internos) requiere `// nosemgrep: <regla>` + comentario justificativo.
