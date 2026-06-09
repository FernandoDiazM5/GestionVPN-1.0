# 🔒 Informe de Auditoría — ProyectoVPN_3.0

> Fecha: 2026-06-07 · Alcance: cambios multi-usuario (Fases 1–4) + barrido global.
> Herramientas: **Semgrep** (estático, Docker) · **/security-review** · **/code-review (high)**.
> Estado del código: `tsc` ✓ · `node --check` ✓.

---

## 1) SEMGREP — Análisis estático

**Config:** `p/security-audit` + `p/owasp-top-ten` · 370 archivos · 99 reglas · **3 hallazgos**.

| # | Archivo:línea | Severidad | Veredicto |
|---|---------------|-----------|-----------|
| S1 | `server/Dockerfile:23` | ERROR | 🟡 **Real (menor)** — contenedor corre como `root` (falta `USER`). Hardening. |
| S2 | `server/db.service.js:195` | ERROR | ✅ **Falso positivo** — GCM "sin tag length", pero usa `setAuthTag()` en :196 (patrón correcto Node). |
| S3 | `server/db/rotateSecrets.js:27` | ERROR | ✅ **Falso positivo** — mismo caso, cifrado autenticado correcto. |

**Conclusión Semgrep:** sin vulnerabilidades reales de patrón. ✅ SQL parametrizado en todo el backend, ✅ AES-256-GCM correcto. (Semgrep no detecta fallos de lógica/autorización — ver secciones 2 y 3.)

**Remediación S1 (opcional):** agregar al `server/Dockerfile`:
```dockerfile
RUN addgroup -S app && adduser -S app -G app
USER app
```

---

## 2) SECURITY-REVIEW — Revisión de seguridad (código nuevo)

### V1 — Authorization: verificación de propiedad insuficiente en `register-my-ip`
- **Archivo:** `server/routes/core.routes.js` (`POST /tunnel/register-my-ip`)
- **Severidad:** MEDIA · **Confianza:** 8/10 · **Categoría:** `broken_access_control`
- **Descripción:** El endpoint solo valida que **exista** un peer con la IP indicada en `VPN-WG-MGMT`; NO valida que ese peer pertenezca al usuario autenticado. Cualquier usuario del workspace puede mapearse a una IP de gestión **sin dueño** (ej. `192.168.21.50` PC FiWis, `.51`, `.60`).
- **Escenario de explotación:** El miembro `qateam` llama `POST /tunnel/register-my-ip {"mgmtIp":"192.168.21.50"}`. Como `.50` no está en `user_mgmt_ips`, la validación pasa y `qateam` queda mapeado a `.50`. Al activar un túnel, el backend crea `mangle src=192.168.21.50 → VRF de qateam`, **redirigiendo el tráfico del dispositivo legítimo `.50`** hacia el VRF que qateam elija (manipulación de ruteo entre usuarios).
- **Recomendación:** Verificar propiedad antes del `upsert`:
  - Los peers de miembro se crean con `comment=member:<user_id>` → exigir que coincida con `req.account.sub`; **o**
  - que el moderador/OWNER asigne el mapeo (modelo `tunnel_assignments`); **o**
  - cruzar con `mgmt_peer_owners` y exigir que el peer pertenezca al usuario, no solo al workspace.

### V2 — `canUseTunnel` no valida existencia de nodo para `platform_admin`
- **Archivo:** `server/routes/core.routes.js` (`canUseTunnel`)
- **Severidad:** BAJA · **Confianza:** 6/10 (no se reporta como bloqueante)
- **Nota:** admin es de confianza y `vrfExists` valida contra el router; sin impacto explotable real. Solo se documenta.

**Lo verificado como SEGURO:**
- ✅ Anti-spoofing: el `src-address` de la mangle se toma de `user_mgmt_ips` (server-side), nunca del body.
- ✅ Permisos por workspace/asignación en activación (`canUseTunnel`).
- ✅ SSE por-usuario (`emitToUser`) — no se filtran eventos de otros.
- ✅ `active_by_other` solo se expone a admin; no-admin no ve sesiones ajenas.
- ✅ Sin inyección SQL (queries parametrizadas) ni inyección de comandos (node-routeros usa arrays, no shell).

---

## 3) CODE-REVIEW — Bugs de correctitud (high, recall-biased)

> Ordenados por severidad. El patrón común: las lecturas a RouterOS hacen
> `.catch(() => [])`, y al fallar el `print` el código asume "no hay regla".

### C1 🔴 — "Revocar" puede NO revocar el acceso (orphan mangle)
- **Archivo:** `server/routes/core.routes.js` — `POST /tunnel/deactivate`
- **Bug:** `findUserMangleIds` hace `.catch(() => [])`. Si el `print` falla transitoriamente (router lento/caído), devuelve `[]`, `removeMangleIds` no borra nada, **pero `closeSession` marca la sesión CLOSED en BD** y responde `success`. La mangle queda viva → **el usuario conserva acceso pese a "revocar"**.
- **Escenario:** router con latencia alta → usuario pulsa Revocar → UI dice "revocado" → su `mangle ACCESO-USER-*` sigue enrutando.
- **Fix:** solo cerrar la sesión si la eliminación se confirmó; si el `print`/remove falla, devolver error y mantener la sesión ACTIVE para reintento; o reconciliar en keepalive.

### C2 🔴 — Expiración (TTL) deja mangle huérfana → acceso tras vencimiento
- **Archivo:** `server/routes/core.routes.js` — `GET /tunnel/status` (rama de expiración perezosa)
- **Bug:** se hace `await sessionRepo.closeSession(...)` y **luego** se intenta limpiar la mangle dentro de un `try/catch` que traga el error. Si la limpieza falla, la sesión queda CLOSED en BD pero la mangle persiste, y **nada la reintenta** (keepalive requiere sesión ACTIVE). El TTL de 30 min se vuelve inefectivo.
- **Fix:** limpiar la mangle ANTES de cerrar en BD (cerrar solo si tuvo éxito), o agregar job de reconciliación que borre mangles `ACCESO-USER-*` sin sesión ACTIVE.

### C3 🟠 — Keepalive puede CREAR mangles duplicadas
- **Archivo:** `server/lib/tunnelProvisioner.js` (`hasUserMangle`) + `core.routes.js` keepalive
- **Bug:** `hasUserMangle` hace `.catch(() => [])`. Si el `print` falla, `.some()` → `false` → keepalive llama `addUserMangle` y crea OTRA regla con el mismo comment. RouterOS **permite mangles duplicadas** (no hay unicidad) y `writeIdempotent` solo ignora errores "already exists" del router, que aquí no se disparan. Con fallos repetidos se acumulan reglas idénticas.
- **Fix:** distinguir "print falló" de "no existe" (propagar el error en vez de `[]`); o `addUserMangle` que borre-por-comment antes de crear.

### C4 🟠 — `activate` deja orphan + duplica si falla el `print` previo
- **Archivo:** `server/routes/core.routes.js` — `POST /tunnel/activate` (Fase A)
- **Bug:** `oldIds = findUserMangleIds(...).catch(()=>[])`. Si el `print` falla, `oldIds=[]` → no se borra la mangle previa del usuario → `addUserMangle` agrega una nueva → **dos mangles del mismo usuario** (posiblemente a VRFs distintos = ruteo ambiguo).
- **Fix:** igual que C3 (no enmascarar fallo de lectura).

### C5 🟡 — Doble cierre de sesión redundante en `activate`
- **Archivo:** `server/routes/core.routes.js` — `POST /tunnel/activate`
- **Cleanup:** se hace `if (prev) await sessionRepo.closeSession(prev.id)` y además `createSession` cierra internamente cualquier ACTIVE del usuario en su transacción → 2 `UPDATE`. Inofensivo pero redundante. Quitar el `closeSession` externo.

### C6 🟡 — Opción inválida en pool MySQL
- **Archivo:** `server/db/mysql.js` (`getPool`)
- **Cleanup:** `connectionTimeZone: 'Z'` no es opción de `mysql2` (la válida `timezone: 'Z'` ya está presente) → se ignora silenciosamente. Eliminarla para evitar confusión.

### C7 🟡 — `startMonitor`: health checks solapados
- **Archivo:** `server/db/mysql.js` (`startMonitor`)
- **Cleanup/robustez:** `setInterval(healthCheck, 10000)` con función async: si un check tarda >10s (router/DB lento), pueden solaparse ejecuciones. Usar un flag "in-flight" o reprogramar con `setTimeout` encadenado.

---

## 4) Resumen ejecutivo y prioridad

| Prioridad | ID | Hallazgo | Acción |
|-----------|----|----------|--------|
| 🔴 1 | C1 | "Revocar" no revoca si falla el print | Cerrar sesión solo si remove confirmó |
| 🔴 2 | C2 | TTL deja mangle huérfana | Limpiar antes de cerrar / job reconciliación |
| 🔴 3 | V1 | `register-my-ip` permite reclamar IP ajena | Validar propiedad del peer (`member:<user_id>`) |
| 🟠 4 | C3/C4 | Mangles duplicadas al fallar print | No enmascarar fallo de lectura (`catch []`) |
| 🟡 5 | C5/C6/C7 | Limpiezas | Quitar doble close, opción inválida, solapamiento |
| 🟡 6 | S1 | Dockerfile root | `USER` no-root |

**Raíz común de C1–C4:** el patrón `safeWrite(...).catch(() => [])` mezcla "no hay datos" con "la lectura falló". Un helper que **distinga ambos casos** resuelve los cuatro de una vez (corrección de altitud).

**Veredicto general:** la arquitectura multi-usuario es sólida (aislamiento por ruteo, anti-spoofing, permisos). Los hallazgos críticos son de **manejo de fallos de RouterOS**, no de diseño: el acceso puede no revocarse o duplicarse cuando el router falla durante una operación.

---
*Generado por auditoría con Semgrep + security-review + code-review.*
