#!/bin/sh
# ── Arranque del backend en producción ──────────────────────────────────────
#  Corre las migraciones EN ORDEN antes de iniciar el server.
#  set -e: si una migración falla de verdad, aborta el arranque (mejor fallar
#  visible que servir con un esquema incompleto). Las migraciones deben ser
#  idempotentes (re-ejecutables sin efecto si ya se aplicaron).
set -e

echo "🔧 [entrypoint] Migraciones de BD..."
node db/initRbac.js            # esquema RBAC base (users, workspaces, roles)
node db/initMultiuser.js       # tablas multi-usuario (sessions, mgmt_ips, ...)
# Esquema operativo (nodes, aps, cpes, app_settings...) vía db.service.initDb().
# DEBE ir antes de migrate:apnode, que altera 'aps'. Antes lo disparaba seedRoles.
node -e "require('./db.service').initDb().then(()=>{console.log('[init:ops] schema_ops aplicado'); process.exit(0)}).catch(e=>{console.error('[init:ops] ERROR:', e.message); process.exit(1)})"
node db/migratePerf.js         # índices compuestos (F11)
node db/migrateNotifications.js
node db/migrateMonitoring.js
node db/migrateApNode.js        # FK aps.node_id
node db/migrateScanIp.js        # tabla workspace_scan_ip (Opción C)

# Siembra de usuarios demo (admin/admin + moderador fernando) SOLO si se pide.
# En producción se deja apagada → BD sin usuarios → el panel muestra el
# "Setup Inicial" para que el operador cree el Administrador con su propia clave.
if [ "$SEED_DEMO_USERS" = "true" ]; then
  echo "🌱 [entrypoint] SEED_DEMO_USERS=true → sembrando usuarios demo..."
  node db/seedRoles.js
fi

echo "✅ [entrypoint] Migraciones OK. Iniciando servidor..."
exec node index.js
