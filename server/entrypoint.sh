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
node db/migratePerf.js         # índices compuestos (F11)
node db/migrateNotifications.js
node db/migrateMonitoring.js
node db/migrateApNode.js        # FK aps.node_id
node db/migrateScanIp.js        # tabla workspace_scan_ip (Opción C)
node db/seedRoles.js           # seed idempotente de roles

echo "✅ [entrypoint] Migraciones OK. Iniciando servidor..."
exec node index.js
