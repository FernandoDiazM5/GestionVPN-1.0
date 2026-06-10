-- ============================================================
--  Schema PERF — índices compuestos para el hot path (FASE 11)
--
--  Aditivo. Idempotente — cada índice se chequea con information_schema
--  antes de CREATE (script en db/migratePerf.js). NO modifica datos.
--
--  Cada índice listado abajo está justificado por una query real del
--  proyecto. La columna ORDER BY va al final del compuesto y MySQL
--  puede recorrer el árbol B+ en orden inverso (no necesita filesort).
-- ============================================================

-- ── 1. tunnel_logs — timeline auditoría del workspace ─────────
--  Query: WHERE workspace_id = ? ORDER BY created_at DESC LIMIT N
--  Antes: usa idx_tl_ws (workspace_id) + filesort por created_at.
--  Después: cobertura total — escanea el rango del ws y emite N en orden.
CREATE INDEX idx_tl_ws_created ON tunnel_logs (workspace_id, created_at);

-- ── 2. tunnel_logs — timeline de UN túnel del workspace ───────
--  Query: WHERE workspace_id = ? AND tunnel_id = ? ORDER BY created_at DESC
--  Antes: usa idx_tl_tunnel pero filtra workspace_id en RAM + filesort.
--  Después: prefijo (ws, tunnel) y orden por created_at sin filesort.
CREATE INDEX idx_tl_ws_tunnel_created ON tunnel_logs (workspace_id, tunnel_id, created_at);

-- ── 3. tunnel_user_sessions — listado ACTIVE de un workspace ───
--  Query: WHERE workspace_id = ? AND status = 'ACTIVE'
--         ORDER BY activated_at DESC
--  Antes: idx_tus_ws_status (ws, status) cubre WHERE pero no el ORDER BY.
--  Después: cubre WHERE + ORDER BY (recorrido inverso del índice).
CREATE INDEX idx_tus_ws_status_activated ON tunnel_user_sessions (workspace_id, status, activated_at);

-- ── 4. tunnel_user_sessions — sesión actual de un usuario ─────
--  Query: WHERE workspace_id = ? AND user_id = ? AND status = 'ACTIVE'
--         ORDER BY activated_at DESC LIMIT 1
--  Antes: idx_tus_user (user_id) → escaneo de filas del usuario.
--  Después: prefijo exacto + LIMIT 1 con orden de índice.
CREATE INDEX idx_tus_ws_user_status_activated ON tunnel_user_sessions (workspace_id, user_id, status, activated_at);

-- ── 5. tunnel_user_sessions — sesiones expiradas (job perezoso) ─
--  Query: WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < ?
--  Antes: idx_tus_status (status) — todas las ACTIVE, luego filtro en RAM.
--  Después: rango directo sobre el árbol.
CREATE INDEX idx_tus_status_expires ON tunnel_user_sessions (status, expires_at);

-- ── 6. tunnel_session_logs — timeline auditoría sesiones por ws ─
--  Query: WHERE workspace_id = ? ORDER BY created_at DESC LIMIT N
--  Antes: NO había ningún índice por workspace_id en esta tabla.
--         Full table scan en cada lectura.
CREATE INDEX idx_tsl_ws_created ON tunnel_session_logs (workspace_id, created_at);

-- ── 7. invitations — anti-enumeración por email del invitado ──
--  Query: WHERE email = ? AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1
--  Antes: idx_inv_email (email) — múltiples filas históricas del mismo email.
--  Después: prefijo (email, status) y orden por created_at.
CREATE INDEX idx_inv_email_status_created ON invitations (email, status, created_at);

-- ── 8. password_resets — lookup por user_id activo ────────────
--  Query: WHERE user_id = ? AND used_at IS NULL AND expires_at > ?
--  Antes: idx_pr_user (user_id) — re-filtra used_at/expires_at en RAM.
--  Después: prefijo + rango.
CREATE INDEX idx_pr_user_active ON password_resets (user_id, used_at, expires_at);
