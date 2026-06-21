---
name: auditoria-completa
description: Ejecuta una auditoría integral del branch de GestionVPN-1.0 — seguridad, lógica/bugs, eficiencia, base de datos y validación de datos frontend↔backend — y consolida los hallazgos en un único informe por severidad. Úsala cuando el usuario pida "auditar", "audita el proyecto/branch", "revisión completa", "chequeo de seguridad y calidad", "está listo para producción/VPS", "audita antes de desplegar", o quiera un quality-gate antes de mergear a main / desplegar al VPS. Orquesta las skills y comandos ya instalados (code-review, security-review, semgrep, api-contract, diagnose, analyze:queries, verify) en un solo flujo reproducible, a nivel local y como checklist previa al VPS.
---

# Auditoría Completa — GestionVPN-1.0

Orquesta en **un solo flujo** las herramientas ya instaladas para auditar el branch en 5 dominios: **seguridad, lógica, eficiencia, base de datos y validación de datos**. No reinventa nada: encadena `/code-review`, `/security-review`, `semgrep`, `api-contract`, los scripts de diagnóstico de BD y `verify`, y consolida todo en un informe por severidad.

> **Principio:** read-only y no destructiva por defecto. Nunca corre migraciones, ni toca el router/VPS, ni hace SSH a antenas. Audita y reporta; los arreglos se proponen, no se aplican sin confirmación.

## Cuándo usarla
- "Audita el branch / el proyecto", "revisión completa", "chequeo de calidad y seguridad".
- "¿Está listo para mergear a `main` / desplegar al VPS?" (quality-gate previo).
- Antes de un merge `dev → main` o de aplicar un runbook de RED en el VPS.

## Alcance de cada dominio
| Dominio | Qué se revisa | Herramienta principal |
|---|---|---|
| 🔒 Seguridad | Secretos hardcodeados, CORS abierto, crypto rebajado, auth bypass, antispoofing server-side, input validation | `/security-review`, `npm run audit:semgrep`, skill `git-review`, `api-security-hardening` |
| 🧠 Lógica | Bugs de correctitud, `await` faltante, `.id` vs `['.id']` (RouterOS), `Promise.all` vs `allSettled` en cleanup | `/code-review` |
| ⚡ Eficiencia | Reuso/duplicación, queries N+1, índices, simplificaciones | `/code-review`, `npm run analyze:queries`, skill `performance` |
| 🗄️ Base de datos | Salud de cifrado MT_*, IPs de gestión/scan, sesiones, ruta de retorno scan-pool | `npm run diagnose`, `npm run check:scanroute`, `npm run analyze:queries` |
| ✅ Validación de datos | Drift de contratos `zod` front↔back, tipos desincronizados, validación de body en rutas | skill `api-contract`, `tsc`, compilación de `@gestionvpn/contracts` |

## Proceso (orden recomendado)

Ejecuta de barato→caro y de read-only→análisis. Anuncia cada paso; si uno falla, regístralo y continúa (no abortes la auditoría completa por un paso).

### 0) Contexto del branch
- `git log --oneline -1` y `git status` para fijar el tip y ver qué hay sin commitear.
- `git diff main...HEAD --stat` para acotar el alcance del cambio que se audita.

### 1) Salud base (gate rápido)
- Backend: `cd server && node --check index.js` y `npm test` (debe dar los tests verdes que indica §0 del HANDOFF).
- Frontend: `cd vpn-manager && npx tsc --noEmit` (debe ser **0 errores**).
- Contratos: que `@gestionvpn/contracts` compile.
- Diseño (si hay UI tocada): `npm run audit:design` **desde la raíz del repo** → debe quedar en **0 errores** (regla §4.7).

### 2) Seguridad
- Lanza `/security-review` sobre los cambios del branch.
- Corre `npm run audit:semgrep` (desde la raíz) para vulnerabilidades por patrón. Requiere **Docker** (la imagen `semgrep/semgrep` está fijada en `scripts/semgrep.js`; no hay binario nativo de Windows). Para CI: `npm run audit:semgrep:json`. Falla con exit≠0 si hay findings (gate).
- Aplica el checklist 🔴 de la skill `git-review` (secretos, CORS `origin:'*'`, crypto, auth).
- **Invariantes a verificar explícitamente (HANDOFF §4):**
  - §4.3/§4.5 — mangle y credenciales **server-side** desde la sesión, nunca del body.
  - §4.8 — no se versionan secretos (`.jwt_secret`, `.db_secret`, `database.sqlite*`).
  - §4.9 — `/settings/save` y config del router core solo `platform_admin`.
  - §4.10 — `.conf` de gestión **split-tunnel**, nunca `0.0.0.0/0`.

### 3) Lógica
- Lanza `/code-review high` (o `ultra` si el usuario quiere review multi-agente en la nube del branch).
- Presta atención a los patrones propios del proyecto: `item['.id']` en objetos RouterOS, `await` faltante en provisión/desactivación, `Promise.allSettled` en cleanup en cascada.

### 4) Eficiencia
- `cd server && npm run analyze:queries` para detectar queries problemáticas / faltta de índices.
- Revisa los hallazgos de eficiencia que ya trae `/code-review` (reuso/simplificación).
- Si hay frontend pesado tocado: criterios de `performance` / `vercel-react-best-practices`.

### 5) Base de datos (read-only)
- `cd server && npm run diagnose` — IPs de gestión/scan, sesiones, salud de cifrado MT_* (no imprime secretos).
- `cd server && npm run check:scanroute` — verifica la ruta de retorno del scan-pool en cada VRF (con `-- --apply` solo si el usuario lo pide y el router está accesible).
- Si hay drift de esquema, contrástalo contra `server/sql/*.sql` (fuente de verdad).

### 6) Validación de datos (front↔back)
- Usa la skill `api-contract`: verifica que los tipos de `@gestionvpn/contracts` no driftearon respecto a las rutas Express ni a los consumidores React.
- Confirma que las rutas que reciben body validan con `zod` (no confían en el cliente).

### 7) Verificación de flujos (opcional, si hay tiempo y dev levantado)
- Skill `verify` / `run` para confirmar que los flujos clave (login, alta de nodo, escaneo) siguen funcionando en **local** antes de tocar el **VPS**.
- **VPS:** esta skill **no** ejecuta acciones en el VPS. Para el plano remoto, produce una **checklist previa** apoyada en `DESPLIEGUE_VPS.md` y `MIGRACION_RED_GESTION.md` (qué validar a mano: handshake WG, ping de gestión, escaneo > 0, aislamiento mangle por-usuario con 2 moderadores).

## Informe consolidado (salida)

Entrega un único informe agrupado por severidad, no cinco informes sueltos:

```
# Auditoría — branch <rama> @ <tip>  (<fecha>)

## 🔴 Críticos (bloquean merge/despliegue)
- [dominio] <hallazgo> — <archivo:línea> — <por qué> — <fix propuesto>

## 🟡 Warnings (revisar)
- ...

## 🟢 Info / mejoras
- ...

## ✅ Verificado OK
- tsc 0 · tests N verdes · audit:design 0 · contratos compilan · sin secretos staged · ...

## Checklist VPS (acción del usuario)
- [ ] ...
```

Reglas del informe:
- Cada hallazgo lleva **archivo:línea** clicable y un **fix propuesto** concreto.
- Mapear cada crítico al invariante de HANDOFF §4 que viola, si aplica.
- **No aplicar arreglos automáticamente.** Listar y, al final, preguntar al usuario qué arreglar (críticos primero).
- Si todo pasa, decirlo claro y sin hedging: "branch limpio para mergear/desplegar".

## Notas
- Esta skill **no** corre migraciones ni `git commit`/`push` ni acciones de RED: solo audita. Si la auditoría motiva un cambio durable (regla/proceso), pásalo por la skill `handoff-keeper`.
- Respeta la **Política SSH** (§4.6): jamás polling SSH ni comandos destructivos contra antenas airOS como parte de la auditoría.
