# MikroTik VPN Manager — `GestionVPN-1.0`

Panel SaaS multi-tenant para gestionar túneles VPN sobre un **MikroTik central compartido** (SSTP + WireGuard) y monitorear equipos **Ubiquiti airOS** (AC/M5, APs/CPEs) en las LAN remotas vía VRF.

## Estructura

```
ProyectoVPN_3.0/
├── server/             — Backend Node.js + Express + MySQL + RouterOS API
├── vpn-manager/        — Frontend React 19 + TypeScript + Vite + Tailwind
├── HANDOFF.md          — Contexto técnico para retomar trabajo entre sesiones
├── REFACTOR_PLAN.md    — Plan de refactor incremental (13 fases)
└── .github/workflows/  — CI: tsc + eslint + node --check
```

Para el **contexto técnico completo**, lee [`HANDOFF.md`](./HANDOFF.md).
Para el **plan de mejora**, lee [`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md).

---

## ⚡ Arranque rápido

1. **MySQL/XAMPP** arriba.
2. **Backend:**
   ```bash
   cd server
   npm install
   npm run init:multiuser   # 1ª vez tras pull
   npm run dev              # arranca en :3001
   ```
3. **Frontend:**
   ```bash
   cd vpn-manager
   npm install
   npm run dev              # arranca en :5173/GestionVPN-1.0/
   ```
4. Login: `admin/admin` (Administrador de plataforma) o `fernando@local.app / 48523451` (Moderador).

> Para configurar SMTP de invitaciones/recuperación y el endpoint WG, copia `server/.env.example` a `server/.env` y completa los valores.

---

## 🤝 Contribuir

### Setup local

```bash
# 1) Clonar
git clone https://github.com/FernandoDiazM5/GestionVPN-1.0.git
cd GestionVPN-1.0

# 2) Instalar deps en raíz (husky + lint-staged)
npm install

# 3) Instalar deps de backend y frontend
cd server && npm install && cd ..
cd vpn-manager && npm install && cd ..
```

`npm install` en raíz dispara `husky` que configura el hook `pre-commit` automáticamente.

### Flujo de commit

Cada `git commit` ejecuta automáticamente:

1. **lint-staged** sobre archivos en stage:
   - `vpn-manager/src/**/*.{ts,tsx}` → `eslint --fix`
   - `server/**/*.js` → `node --check` (sintaxis)
2. **tsc --noEmit** sobre `vpn-manager/` si hay archivos `.ts`/`.tsx` staged.

Si algo falla, el commit se aborta. Corrige y vuelve a `git add` + `git commit`.

> ⚠️ Para casos puntuales puedes saltar el hook con `git commit --no-verify`, pero CI sigue corriendo y va a fallar igual.

### Scripts disponibles (desde la raíz)

| Comando | Hace |
|---------|------|
| `npm run check:backend` | `node --check` de los puntos de entrada del backend |
| `npm run check:frontend` | `tsc --noEmit` en `vpn-manager/` |
| `npm run lint:frontend` | `eslint` en `vpn-manager/` |
| `npm run check:all` | Los tres anteriores en orden |

### CI

Cada push a `dev`/`main` y cada PR dispara [`.github/workflows/ci.yml`](./.github/workflows/ci.yml):

- **Backend job:** `node --check` sobre `index.js`, `routes/*`, `lib/*`, `db/*`, `middleware/*`
- **Frontend job:** `tsc --noEmit` + `eslint`
- **CI ✓ job:** agrega los resultados (usa este como required check en branch protection)

Los tests aún no están — la **FASE 3 del REFACTOR_PLAN** introduce Vitest, Supertest y Playwright.

### Convenciones

- **Commits:** prefijo convencional (`feat`, `fix`, `chore`, `docs`, `refactor`, `style`, `test`, `ci`, `perf`). Mensaje en español aceptado.
- **Branches:** trabajo en `dev`. PR a `main` solo para release.
- **Co-author:** si trabajaste con Claude Code, agrega `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` al final del mensaje.

### Regla de oro del refactor

> "Cada commit deja la app funcionando." — Martin Fowler

Si una fase del REFACTOR_PLAN se vuelve grande, divídela en sub-fases. Nunca acumules commits rotos en `dev`.

---

## Reglas de diseño (UI)

Lee [`vpn-manager/CLAUDE.md`](./vpn-manager/CLAUDE.md) y `vpn-manager/src/styles/DESIGN_SYSTEM.md` antes de tocar UI.

Resumen:
- **Color = intención**, nunca decoración. Usa los tokens `brand`/`success`/`danger`/`warning`/`info`/`accent`/`neutral`.
- **Tipografía:** `font-sans` para UI, `font-mono` para datos técnicos (IP, MAC, claves). Mínimo `text-xs` (12px).
- **Clases del sistema:** `.btn-*`, `.badge-*`, `.card`, `.data-cell`, `.th-cell`, `.skeleton`, etc.
- **Dark mode** por clase, **motion** señala cambios de estado.

---

## Licencia

Privado / sin licencia abierta.
