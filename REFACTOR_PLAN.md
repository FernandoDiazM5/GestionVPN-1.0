# 🛠️ Plan de Refactor — MikroTik VPN Manager

> **Tipo:** Plan completo full-stack · **Duración estimada:** 3-4 semanas · **Generado:** 2026-06-07
> Sigue el principio de Martin Fowler: cada commit deja el código en estado funcional.
> Documento local (no GitHub issue). Se actualiza con tickeos `✅` al avanzar.

---

## 🎯 Problem Statement

El proyecto **MikroTik VPN Manager** funciona, pero tiene deuda técnica acumulada que frena la velocidad de cambio futuro y aumenta el riesgo en cada modificación:

- **Sin red de seguridad:** 0 tests en backend ni frontend. Cada refactor es a ciegas.
- **God-files:** `node.routes.js` (1264 LOC), `core.routes.js` (935 LOC), `NetworkDevicesModule.tsx` (1313 LOC) concentran demasiada responsabilidad.
- **Dos clientes HTTP coexistiendo:** `apiClient` (Bearer legacy) + `sessionClient` (cookies RBAC) — cada nueva ruta requiere decisión y duplica patrones.
- **Sin contrato API único:** los tipos en `vpn-manager/src/types/api.ts` se mantienen a mano y derivan de los routes de Express. Hay drift.
- **Sin observabilidad:** 18 `console.log/warn/error` esparcidos. Sin métricas. Sin health enriquecido. Difícil debuggear en producción.
- **Sin headers de seguridad:** falta `helmet`. CORS configurado pero no CSP, X-Frame-Options, etc.

---

## 💡 Solution

Refactor **incremental** en 13 fases, manteniendo SIEMPRE la app funcionando. Cada fase termina con:
1. ✅ Tests pasando
2. ✅ `tsc --noEmit` limpio
3. ✅ `node --check` limpio
4. ✅ Commit chiquito con mensaje claro

**Filosofía:** primero red de seguridad (tests + observabilidad), luego refactors de arquitectura. Refactors de alto riesgo SIEMPRE protegidos por tests previos.

---

## 📅 Roadmap por fases (priorizado)

| # | Fase | Días | Riesgo | Bloquea a |
|---|------|------|--------|-----------|
| **0** | Preparación: limpieza + CI básico | 1 | 🟢 Bajo | Todas |
| **1** | Logger estructurado (pino) | 1 | 🟢 Bajo | F4, F9 |
| **2** | Headers de seguridad (helmet) + audit | 0.5 | 🟢 Bajo | — |
| **3** | Setup completo de testing | 2 | 🟢 Bajo | F4, F5, F6, F7, F8 |
| **4** | Tests de endpoints críticos | 3 | 🟢 Bajo | F5, F6, F7 |
| **5** | Unificar API client + contratos Zod compartidos | 3 | 🟠 Medio | F6, F7, F8 |
| **6** | Split `node.routes.js` | 2 | 🟠 Medio | — |
| **7** | Split `core.routes.js` | 2 | 🟠 Medio | — |
| **8** | Split `NetworkDevicesModule.tsx` | 3 | 🟠 Medio | F10 |
| **9** | Health check enriquecido + métricas Prometheus | 1 | 🟢 Bajo | — |
| **10** | Code-splitting frontend (lazy modules) | 1 | 🟢 Bajo | — |
| **11** | Performance MySQL (índices + prepared) | 1 | 🟠 Medio | — |
| **12** | Audit pass final + docs | 1 | 🟢 Bajo | — |

**Total estimado:** 21.5 días (~3 semanas). Buffer 30% → 28 días (~4 semanas).

---

## 📋 Detalle por fase

### **FASE 0 — Preparación (1 día)** 🟢

Objetivo: ambiente reproducible, CI mínimo, sin archivos basura en `src/`.

**Commits:**
1. `chore: eliminar VpnContext.backup.tsx de src/ (queda en git history)`
2. `chore: agregar .editorconfig (LF, UTF-8, 2 espacios)`
3. `chore: install husky + lint-staged`
4. `chore: pre-commit ejecuta eslint --fix + tsc --noEmit en cambios staged`
5. `chore: agregar .github/workflows/ci.yml con tsc + node --check + lint`
6. `docs: README sección "Contribuir" con setup local + comandos disponibles`

**Verificación al final:** `git commit` con cambio trivial dispara lint+typecheck. CI corre en push.

---

### **FASE 1 — Logger estructurado (1 día)** 🟢

Objetivo: reemplazar `console.*` por `pino` en backend, con request-id, niveles y formato consistente. **Excluye** el `console.log` de `[mailer:DEV]` y dev hints que el operador usa intencionalmente — esos se mantienen como `logger.info({ scope: 'mailer:dev' })`.

**Commits:**
1. `feat(server): install pino + pino-http + pino-pretty (dev)`
2. `feat(server): lib/logger.js exporta logger raíz con redact de password/token/secret`
3. `feat(server): middleware pino-http en index.js (genera reqId, log de req/res)`
4. `refactor(server): routeros.service.js console → logger`
5. `refactor(server): ap.routes.js console → logger`
6. `refactor(server): middleware/authJwt.js console → logger`
7. `refactor(server): ap.service.js console → logger`
8. `refactor(server): ubiquiti.service.js console → logger`
9. `refactor(server): lib/* (mailer, sessionBridge, routerCleanup, routerPeerState) console → logger`
10. `refactor(server): routes/* (todos) console → logger.{info,warn,error}`
11. `docs: HANDOFF.md sección "Logs" — niveles, archivo log/, comandos de filtrado`

**Verificación:** levantar `npm run dev`, hacer login, ver logs JSON con reqId. Probar `pino-pretty` en dev.

---

### **FASE 2 — Headers de seguridad (0.5 días)** 🟢

**Commits:**
1. `feat(server): install helmet`
2. `feat(server): app.use(helmet()) con CSP permisivo en dev y estricto en prod`
3. `feat(server): cookies con secure: NODE_ENV === 'production', sameSite: lax`
4. `chore(server): X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security`
5. `docs: HANDOFF.md sección "Seguridad" — headers aplicados`

**Verificación:** `curl -I http://localhost:3001/api/health` muestra los headers nuevos.

---

### **FASE 3 — Setup de testing (2 días)** 🟢

Objetivo: ambiente de tests funcional en backend y frontend. Sin tests todavía — solo infraestructura.

**Backend (vitest + supertest):**
1. `chore(server): install vitest, supertest, @testcontainers/mysql`
2. `feat(server): test/setup.js (testcontainers MySQL para integración)`
3. `feat(server): test/factories/ (createUser, createWorkspace, createNode)`
4. `feat(server): test/mocks/routeros.js (mock simple de connectToMikrotik + safeWrite)`
5. `feat(server): test/mocks/mailer.js (captura sendMail en memoria)`
6. `feat(server): vitest.config.js (alias @, coverage v8, threshold inicial 0)`
7. `feat(server): npm test, npm run test:watch, npm run test:coverage`
8. `feat(server): test/smoke.test.js — un test trivial para verificar setup`

**Frontend (vitest + Testing Library):**
9. `chore(vpn-manager): install vitest, @testing-library/react, @testing-library/user-event, jsdom`
10. `feat(vpn-manager): src/test/setup.ts (mocks MSW para fetch, jsdom)`
11. `feat(vpn-manager): src/test/render.tsx (wrapper con VpnProvider + WorkspaceSessionProvider)`
12. `feat(vpn-manager): vitest.config.ts (alias, jsdom, coverage)`
13. `feat(vpn-manager): src/test/smoke.test.tsx — render <App /> básico`

**E2E (Playwright):**
14. `chore(repo): install playwright en raíz`
15. `feat: playwright.config.ts con projects chromium`
16. `feat: e2e/auth.spec.ts smoke (abrir login y verificar render)`

**Verificación:** `npm test` (en server y vpn-manager) pasa con smoke tests. `npm run e2e` abre Chromium y pasa.

---

### **FASE 4 — Tests de endpoints críticos (3 días)** 🟢

Objetivo: suite mínima sobre las áreas de mayor riesgo de regresión, para habilitar refactors posteriores con seguridad.

**Backend (~25 tests):**
1. `test(auth): POST /api/auth/login válido devuelve token + role`
2. `test(auth): POST /api/auth/login con credenciales malas devuelve 401`
3. `test(auth): POST /api/auth/login con MySQL caído devuelve 503 DB_UNAVAILABLE`
4. `test(auth/reset): request siempre devuelve 200 (anti-enumeración)`
5. `test(auth/reset): confirm con token válido cambia password + invalida cache`
6. `test(auth/reset): confirm con token usado devuelve 401 INVALID_TOKEN`
7. `test(auth/reset): confirm con token expirado devuelve 401`
8. `test(rbac): requireSession rechaza request sin cookie con 401 NO_SESSION`
9. `test(rbac): requireSession devuelve 401 USER_DELETED si user fue borrado`
10. `test(rbac): requireRole bloquea MEMBER de endpoint OWNER-only`
11. `test(rbac): platform_admin atraviesa todos los requireRole`
12. `test(team): POST /invite crea invitación + email enviado (mock)`
13. `test(team): POST /accept con OTP correcto crea user + asigna rol`
14. `test(team): DELETE /member borra cascada (mgmt_peer_owners, member_wireguard, sessions)`
15. `test(team): PATCH /member disabled sincroniza peer + cierra sesión`
16. `test(admin): DELETE /moderators borra TODO (workspace, peers, mangles, users)`
17. `test(admin): PATCH /moderators disabled afecta a todos los users del ws`
18. `test(admin): POST /invite-moderator crea workspace placeholder + envía email`
19. `test(workspace): GET /export devuelve JSON con shape v1.0.0`
20. `test(workspace): POST /import dryRun devuelve plan sin persistir`
21. `test(workspace): POST /import apply persiste cambios en transacción`
22. `test(workspace): PATCH /name solo OWNER puede`
23. `test(account): PATCH /password con currentPassword incorrecta devuelve 401`
24. `test(account): PATCH /email/request envía OTP al nuevo correo`
25. `test(account): POST /email/confirm requiere OTP + currentPassword`

**Frontend (~10 tests):**
26. `test(Auth): RouterAccess detecta ?reset= y abre PasswordResetConfirm`
27. `test(Auth): RouterAccess detecta ?accept= y abre AcceptInvitationForm`
28. `test(Team/MembersTable): muestra badge "Deshabilitado" cuando member.disabled`
29. `test(Team/MembersTable): no muestra botón "Eliminar" sobre OWNER`
30. `test(Settings/Profile): cambio password valida que confirm coincida`
31. `test(Settings/Workspace): rename deshabilitado para CO_MODERATOR`
32. `test(Settings/Import): dryRun muestra plan agrupado por sección`
33. `test(Users/WgConfigModal): muestra .conf cuando endpoint devuelve conf`
34. `test(Users/WgConfigModal): muestra mensaje amber cuando conf es null`
35. `test(sessionClient): dispara 'auth_expired' en 401 USER_DELETED`

**E2E (3 tests):**
36. `e2e: login + logout flow`
37. `e2e: invitar miembro → aceptar invitación → ver .conf`
38. `e2e: recuperar contraseña end-to-end con captura de email`

**Verificación:** coverage backend ≥ 60% en `routes/` y `lib/`. Coverage frontend ≥ 40% en componentes y servicios. E2E pasa en CI.

---

### **FASE 5 — Unificar API client + contratos Zod compartidos (3 días)** 🟠

Objetivo: un solo cliente HTTP (`sessionClient`), un solo set de tipos derivados de Zod compartido entre back y front.

**Estrategia:** monorepo simple con paquete compartido `packages/contracts/` (sin transpilación, ESM). Frontend y backend lo importan.

**Commits:**
1. `chore: crear packages/contracts/ con package.json (type: module)`
2. `feat(contracts): zod schemas para Auth (Login, RegisterReq, AcceptReq, ...)`
3. `feat(contracts): zod schemas para Team (Member, Invitation, InviteReq, ...)`
4. `feat(contracts): zod schemas para Workspace (ExportPayload, ImportReq, ImportPlan)`
5. `feat(contracts): export TypeScript types via z.infer<typeof X>`
6. `chore(server): npm link ../packages/contracts (workspace deps)`
7. `refactor(server): account.routes.js usa schemas de contracts`
8. `refactor(server): team.routes.js usa schemas de contracts`
9. `refactor(server): admin.routes.js usa schemas de contracts`
10. `refactor(server): workspace.routes.js usa schemas de contracts`
11. `chore(vpn-manager): npm link ../packages/contracts`
12. `refactor(vpn-manager/types/account.ts): re-export desde contracts`
13. `refactor(vpn-manager/types/api.ts): re-export desde contracts (eliminar duplicados)`
14. `feat: estandarizar respuestas — todos los endpoints devuelven { success: true, ...data } o { success: false, code, message }`
15. `refactor(server): utils/apiResponse.js valida con Zod la respuesta antes de send`
16. `refactor(vpn-manager): eliminar utils/apiClient (Bearer legacy)`
17. `refactor(vpn-manager): migrar usos restantes a sessionClient (cookies)`
18. `refactor(server): eliminar Bearer support de middleware auth.middleware.js (solo cookies)`
19. `test: actualizar tests para usar contracts`
20. `docs: HANDOFF.md sección "Contratos API" — cómo añadir endpoint nuevo`

**Verificación:** cambiar un campo en un schema rompe ambos lados en `tsc`. Solo `sessionClient` queda. `grep "Bearer" --include="*.ts"` en vpn-manager devuelve 0.

---

### **FASE 6 — Split `node.routes.js` (2 días)** 🟠

Objetivo: separar las ~30 rutas dentro de `node.routes.js` en archivos por responsabilidad.

**Análisis previo:** abrir el archivo y mapear rutas a categorías.

**Estructura propuesta:**
```
server/routes/nodes/
  ├── index.js              — exporta router compuesto
  ├── provision.routes.js   — POST /node/provision, /deprovision
  ├── editing.routes.js     — POST /node/edit, /label, /tag
  ├── credentials.routes.js — POST /node/creds, /ssh-creds
  ├── history.routes.js     — GET/POST /node/history
  └── scan.routes.js        — GET /node/scan-stream
```

**Commits (uno por sub-router):**
1. `refactor(server): crear routes/nodes/ con index.js placeholder`
2. `refactor(server): extraer provision.routes.js (POST /provision, /deprovision)`
3. `refactor(server): extraer editing.routes.js (POST /edit, /label, /tag)`
4. `refactor(server): extraer credentials.routes.js (/creds, /ssh-creds)`
5. `refactor(server): extraer history.routes.js (GET/POST /history)`
6. `refactor(server): extraer scan.routes.js (/scan-stream)`
7. `refactor(server): nodes/index.js compone router con sub-routers`
8. `chore: actualizar index.js para usar nodes/index.js`
9. `chore: eliminar node.routes.js viejo`
10. `test: re-verificar tests de F4 (deben seguir pasando sin cambios)`

**Verificación:** tests de F4 que tocaban `/api/node/*` siguen verdes. Tamaño max por archivo nuevo < 300 LOC.

---

### **FASE 7 — Split `core.routes.js` (2 días)** 🟠

Estructura propuesta:
```
server/routes/core/
  ├── index.js
  ├── connection.routes.js  — POST /connect, /diagnose
  ├── ppp.routes.js         — POST /secrets, /active
  ├── tunnel.routes.js      — POST /tunnel/{activate,deactivate,keepalive,status}
  └── interface.routes.js   — POST /interface/{activate,deactivate}
```

**Commits:** mismo patrón que F6 (un commit por sub-router + integración + cleanup).

**Verificación:** mismo criterio.

---

### **FASE 8 — Split `NetworkDevicesModule.tsx` (3 días)** 🟠

Objetivo: descomponer el monolito de 1313 LOC en componentes y hooks granulares.

**Estructura propuesta:**
```
components/Devices/NetworkDevicesModule/
  ├── NetworkDevicesModule.tsx    — orquestación (< 200 LOC)
  ├── hooks/
  │   ├── useDeviceScan.ts        — escaneo de subred (extraer lógica de scan)
  │   ├── useDeviceList.ts        — lista filtrada + ordenada
  │   ├── useColumnPrefs.ts       — visibilidad/orden de columnas
  │   └── useDeviceSelection.ts   — selección múltiple
  ├── components/
  │   ├── DeviceTable.tsx         — tabla virtualizada (react-virtual)
  │   ├── DeviceTableRow.tsx      — fila memoizada
  │   ├── DeviceFilters.tsx       — chips de filtro
  │   ├── ScanProgress.tsx        — banner de progreso del scan
  │   ├── DeviceStatusPanel.tsx   — ya existe
  │   └── SshDataModal.tsx        — ya existe
  └── utils/columns.tsx           — ya existe
```

**Commits:**
1. `refactor(NetworkDevicesModule): extraer useDeviceScan hook`
2. `refactor(NetworkDevicesModule): extraer useDeviceList hook`
3. `refactor(NetworkDevicesModule): extraer useColumnPrefs hook`
4. `refactor(NetworkDevicesModule): extraer useDeviceSelection hook`
5. `refactor(NetworkDevicesModule): extraer DeviceFilters component`
6. `refactor(NetworkDevicesModule): extraer ScanProgress component`
7. `refactor(NetworkDevicesModule): extraer DeviceTable + DeviceTableRow memoizados`
8. `feat(NetworkDevicesModule): virtualizar tabla con @tanstack/react-virtual`
9. `refactor: orquestar todo en NetworkDevicesModule.tsx adelgazado`
10. `test: re-verificar test smoke + agregar tests del DeviceTable`

**Verificación:** scroll fluido con 500+ dispositivos. NetworkDevicesModule.tsx < 200 LOC. Profile con React DevTools muestra render solo de filas cambiadas.

---

### **FASE 9 — Health check + métricas Prometheus (1 día)** 🟢

**Commits:**
1. `chore(server): install prom-client`
2. `feat(server): lib/metrics.js — counters (http_requests, auth_fails, routeros_errors, mail_sent)`
3. `feat(server): middleware métrico antes de routes (mide latencia + status)`
4. `feat(server): GET /metrics formato Prometheus (sin auth — endpoint interno)`
5. `refactor(server): /api/health enriquecido — { mysql: ok, routeros: ok|stale|down, smtp: ok|skipped }`
6. `feat: GET /api/health hace ping MySQL + check timestamp últim safeWrite + transporter.verify SMTP`
7. `docs: HANDOFF.md sección "Observabilidad" — endpoints + scrape config`

**Verificación:** `curl /api/health` devuelve JSON detallado. `curl /metrics` muestra contadores reales tras tráfico de prueba.

---

### **FASE 10 — Code-splitting frontend (1 día)** 🟢

Objetivo: cada módulo se carga lazy. Bundle inicial pequeño.

**Commits:**
1. `feat(vpn-manager): lazy load AdminDashboard, ModeratorsModule en App.tsx`
2. `feat(vpn-manager): lazy load NodeAccessPanel, NetworkDevicesModule`
3. `feat(vpn-manager): lazy load TeamModule, UserManagementPanel, ApMonitorModule`
4. `feat(vpn-manager): lazy load Settings (ambos), Auth components`
5. `feat(vpn-manager): Suspense fallback con skeleton compartido`
6. `chore(vpn-manager): install rollup-plugin-visualizer`
7. `feat(vpn-manager): npm run analyze — bundle visual`
8. `refactor(vpn-manager): import individual de lucide-react en lugar de barrel (si aplica)`
9. `docs: HANDOFF.md sección "Performance frontend"`

**Verificación:** bundle inicial < 200KB gzipped (vs ~600KB típico monolítico). Pestañas de Network muestran chunks separados al navegar.

---

### **FASE 11 — Performance MySQL (1 día)** 🟠

Objetivo: detectar y arreglar queries lentas; pulir índices.

**Commits:**
1. `chore(server): habilitar slow query log de MySQL durante test/load`
2. `feat: script tools/analyze-queries.js — corre EXPLAIN en queries críticas`
3. `feat(server): index nuevo en tunnel_logs(workspace_id, created_at DESC) si EXPLAIN lo pide`
4. `feat(server): index nuevo en signal_history(cpe_id, timestamp DESC)`
5. `refactor(server): convertir queries restantes a prepared statements (eliminar concat en SQL)`
6. `refactor(server): pool.getConnection con timeout explícito (vs default)`
7. `docs: HANDOFF.md sección "MySQL — performance"`

**Verificación:** `EXPLAIN` de las top-5 queries lentas muestra `using index`. Latencia p95 GET /api/team/members baja 30%.

---

### **FASE 12 — Audit pass final + docs (1 día)** 🟢

**Commits:**
1. `chore: semgrep --config p/security-audit . — fix findings`
2. `chore: semgrep --config p/nodejs . — fix findings`
3. `chore: semgrep --config p/react . — fix findings`
4. `chore: npm audit fix en server y vpn-manager`
5. `docs: actualizar HANDOFF.md con estado post-refactor`
6. `docs: crear ARQUITECTURA.md con diagrama Mermaid de la nueva estructura`
7. `docs: actualizar CLAUDE.md con convenciones nuevas (logger, contracts, tests)`

**Verificación:** semgrep 0 issues. `npm audit` 0 high/critical.

---

## 📐 Decision Document

### Arquitectura
- **Monorepo simple** con `packages/contracts/` compartido (sin Lerna/Nx; npm workspaces nativos).
- **No** migrar a Next.js / Remix / Astro — Vite + React 19 sigue siendo correcto para SPA.
- **No** introducir GraphQL — REST + Zod ya cubre el caso.
- **Sí** estandarizar respuestas API a `{ success, ...data } | { success: false, code, message }` validadas con Zod.
- **Sí** eliminar el cliente Bearer legacy (`utils/apiClient`). Cookies HttpOnly + RBAC pasa a ser único.

### Logging
- **pino** (más rápido y JSON-first que winston). `pino-pretty` solo en dev.
- **Request ID** propagado por `pino-http`. Aparece en cada log de la request.
- **Redact** automático de campos sensibles: `password`, `token`, `secret`, `otp`, `private_key`.

### Testing
- **Vitest** (más rápido que Jest, esm-native). Mismo backend y frontend para consistencia.
- **Supertest** para HTTP de Express.
- **@testcontainers/mysql** para integración real con DB efímera (vs mock incompleto).
- **Testing Library** + **user-event** para componentes (no enzyme).
- **MSW** para mock de fetch en frontend.
- **Playwright** para E2E (Chromium, opcionalmente Firefox/WebKit).
- **Coverage v8** nativo de Vitest.

### Performance
- **react-virtual** (`@tanstack/react-virtual`) para tablas con muchos items (>50).
- **React.lazy** + `Suspense` por módulo. NO usar suspense boundaries finos por ahora.
- **rollup-plugin-visualizer** para análisis manual del bundle.
- **prom-client** para métricas (formato Prometheus). No Datadog/NewRelic en esta fase.

### Seguridad
- **helmet** con CSP en producción.
- **Cookies** `secure: true` en producción.
- **Semgrep** en CI con reglas `p/nodejs`, `p/react`, `p/security-audit`.

---

## 🧪 Testing Decisions

### Qué hace un buen test (filosofía del proyecto)
- **Solo behavior externo**, nunca internals. Si refactorizas el helper privado, los tests siguen verdes.
- **Setup mínimo, asserts contundentes.** Un test, una verdad.
- **Test names en español** (consistencia con el proyecto): `describe('POST /api/auth/login', () => it('devuelve 401 si la contraseña es incorrecta', ...))`.
- **Integración > unit** para endpoints HTTP. **Unit** para helpers puros (`wgkeys`, `crypto`, repos).

### Módulos a testear (priorizados)

**Backend (alto valor):**
- Auth flows (login, password reset)
- RBAC middleware (cache + USER_DELETED)
- Hard-delete cascada (admin moderator, team member)
- Habilitar/deshabilitar (sync MikroTik)
- Import / export workspace
- Anti-enumeración en password reset

**Frontend (alto valor):**
- `RouterAccess` — detectar query params (`?accept=`, `?reset=`)
- `MembersTable` — RBAC en acciones visibles
- `sessionClient` — disparo de `auth_expired` en 401
- `WgConfigModal` — estados con/sin conf
- `ImportExportTab` — flujo dry-run → apply

**E2E (smoke):**
- Login + logout
- Invitar miembro + aceptar
- Recuperar contraseña

### Prior art en el repo
- No hay tests previos. La FASE 3 establece el patrón. **Decisión:** seguir el estilo de Vitest oficial + ejemplos de la doc de Testing Library.

### Cobertura objetivo
- Backend: ≥ 60% en `routes/` y `lib/`.
- Frontend: ≥ 40% en `components/` y `services/`.
- E2E: 3-5 happy paths.

---

## 🚫 Out of Scope

Cosas que **NO** se tocan en este refactor:

- **Migrar a Next.js** — Vite + React 19 SPA es correcto para el caso.
- **Migrar de MySQL a Postgres** — MySQL funciona; ya hay capa de compatibilidad en `db.service.js`.
- **Migrar de SSTP a WireGuard nativo** — el modelo dual (SSTP para túnel, WG para gestión) es intencional.
- **Reescribir RouterOS service** — funciona y el parche `!empty` es estable.
- **Introducir Redis / BullMQ** — el volumen actual no lo justifica (existe la skill `project-refactor` para v2.0).
- **Tests de UI screenshot/visual regression** — no hay diseñador rotativo, riesgo de mantenimiento alto.
- **i18n** — el proyecto es es-only por ahora.
- **PWA / offline** — el cliente necesita conexión al backend siempre.
- **Cambiar de Tailwind** — el design system actual funciona.
- **Containerización (Docker)** — ya existe la skill `docker-compose`; se hace cuando se vaya a producción.

---

## 🔄 Cómo iterar con este plan

1. **Trabaja una fase a la vez.** No mezcles commits de F5 con F6.
2. **Al terminar una fase**, ticka `✅` en el roadmap arriba y haz `git commit -m "chore: completa FASE N"`.
3. **Si una fase se atasca**, abre un sub-issue en este mismo doc o crea `REFACTOR_PLAN_FN.md` con detalles.
4. **Si descubres deuda nueva durante el refactor**, NO la arregles en línea — anótala en una sección "Discovered work" abajo y trátala como fase aparte.
5. **Mantén el verde:** si los tests rompen, arregla antes de seguir. Nunca acumules tests rojos.

---

## 📌 Discovered work (se llena durante la ejecución)

> Cosas descubiertas durante el refactor que NO entran en las fases planificadas.
> Convertir cada item en su propia fase o backlog según prioridad.

- [ ] _(vacío al iniciar)_

---

## ✅ Quick reference — comandos por fase

```bash
# FASE 0
git rm vpn-manager/src/context/VpnContext.backup.tsx
npm install -D husky lint-staged
npx husky init

# FASE 1
cd server && npm install pino pino-http pino-pretty

# FASE 2
cd server && npm install helmet

# FASE 3
cd server && npm install -D vitest supertest @testcontainers/mysql
cd ../vpn-manager && npm install -D vitest @testing-library/react @testing-library/user-event jsdom msw

# FASE 5
mkdir packages/contracts && cd packages/contracts && npm init -y

# FASE 9
cd server && npm install prom-client

# FASE 10
cd vpn-manager && npm install -D rollup-plugin-visualizer @tanstack/react-virtual

# FASE 12
npm install -g semgrep
semgrep --config p/nodejs --config p/react --config p/security-audit .
```

---

## 📊 Métricas de éxito (al cerrar el plan)

| Métrica | Antes | Objetivo |
|---------|-------|----------|
| LOC del archivo más grande (server) | 1264 (`node.routes.js`) | < 300 |
| LOC del archivo más grande (vpn-manager) | 1313 (`NetworkDevicesModule.tsx`) | < 200 |
| Cobertura tests backend | 0% | ≥ 60% |
| Cobertura tests frontend | 0% | ≥ 40% |
| Tests E2E | 0 | ≥ 3 |
| `console.*` en backend | 18 | 0 (todo via logger) |
| API clients distintos | 2 (`apiClient` + `sessionClient`) | 1 |
| `: any` en TypeScript | 20 | ≤ 5 |
| Bundle inicial (gzipped) | ~600KB est. | < 200KB |
| Helmet activo | ❌ | ✅ |
| Métricas Prometheus | ❌ | ✅ |
| Health check enriquecido | parcial | completo (MySQL+RouterOS+SMTP) |
| Endpoints sin Zod | ~10 | 0 |
| Semgrep findings | sin medir | 0 high/critical |

---

> 💡 **Para retomar este plan en otra sesión:** lee este archivo + `HANDOFF.md` y mira los `✅` en el roadmap.
