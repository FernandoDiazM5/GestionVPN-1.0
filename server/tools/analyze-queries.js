// ============================================================
//  tools/analyze-queries.js — EXPLAIN sobre el hot path
//
//  Corre EXPLAIN ANALYZE (o EXPLAIN clásico si la versión de MySQL/MariaDB
//  no lo soporta) sobre las queries más calientes del proyecto para
//  detectar índices faltantes o filesort innecesarios.
//
//  Uso:
//     cd server && node tools/analyze-queries.js
//     cd server && node tools/analyze-queries.js --json   # output máquina
//
//  Sale 0 si todas las queries usan índices (sin "Using filesort"
//  ni "type=ALL"); sale 1 si alguna requiere optimización.
//
//  NO modifica datos. Usa placeholders neutros (workspace_id = '' etc.)
//  que devuelven 0 filas pero igual provocan el plan de ejecución real.
// ============================================================
const { query, closePool } = require('../db/mysql');

// IDs de ejemplo — el query plan no depende de su valor, solo del shape.
const SAMPLE_WS = '00000000-0000-0000-0000-000000000000';
const SAMPLE_USER = '11111111-1111-1111-1111-111111111111';
const SAMPLE_TUNNEL = 'sample-tunnel';
const SAMPLE_CPE = 0;
const SAMPLE_AP = 0;
const NOW = Date.now();

/**
 * Catálogo de queries críticas del hot path.
 * Cada entrada describe: dónde se usa, la query, los parámetros y un
 * umbral de filas estimadas a partir del cual marcamos warning.
 */
const QUERIES = [
  {
    name: 'sessionRepo.currentForUser',
    where: 'core/tunnel.routes.js — /tunnel/status, /tunnel/activate',
    sql: `SELECT * FROM tunnel_user_sessions
            WHERE workspace_id = ? AND user_id = ? AND status = 'ACTIVE'
            ORDER BY activated_at DESC LIMIT 1`,
    params: [SAMPLE_WS, SAMPLE_USER],
  },
  {
    name: 'sessionRepo.listActiveByWorkspace',
    where: 'core/tunnel.routes.js — listado para SSE multi-tenant',
    sql: `SELECT s.*, u.name AS user_name, u.email AS user_email
            FROM tunnel_user_sessions s JOIN users u ON u.id = s.user_id
           WHERE s.workspace_id = ? AND s.status = 'ACTIVE'
           ORDER BY s.activated_at DESC`,
    params: [SAMPLE_WS],
  },
  {
    name: 'sessionRepo.findExpired',
    where: 'job de expiración lazy (en /tunnel/status)',
    sql: `SELECT * FROM tunnel_user_sessions
            WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < ?`,
    params: [NOW],
  },
  {
    name: 'auditRepo.list',
    where: 'team.routes.js — GET /api/team/logs (timeline auditoría)',
    sql: `SELECT tl.id, tl.tunnel_id, tl.action, tl.ip_address, tl.detail, tl.created_at,
                 tl.user_id, u.email AS user_email, u.name AS user_name
            FROM tunnel_logs tl LEFT JOIN users u ON u.id = tl.user_id
           WHERE tl.workspace_id = ?
           ORDER BY tl.created_at DESC LIMIT ?`,
    params: [SAMPLE_WS, 100],
  },
  {
    name: 'auditRepo.list (por túnel)',
    where: 'team.routes.js — GET /api/team/logs?tunnelId=...',
    sql: `SELECT tl.id, tl.tunnel_id, tl.action, tl.ip_address, tl.detail, tl.created_at,
                 tl.user_id, u.email AS user_email, u.name AS user_name
            FROM tunnel_logs tl LEFT JOIN users u ON u.id = tl.user_id
           WHERE tl.workspace_id = ? AND tl.tunnel_id = ?
           ORDER BY tl.created_at DESC LIMIT ?`,
    params: [SAMPLE_WS, SAMPLE_TUNNEL, 100],
  },
  {
    name: 'memberRepo.findMembership',
    where: 'authJwt — cada request autenticada',
    sql: `SELECT * FROM workspace_members
            WHERE workspace_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
    params: [SAMPLE_WS, SAMPLE_USER],
  },
  {
    name: 'memberRepo.listMembers',
    where: 'team.routes.js — GET /api/team/members',
    sql: `SELECT u.id AS user_id, u.email, u.name, u.disabled_at, wm.role, wm.created_at AS joined_at
            FROM workspace_members wm JOIN users u ON u.id = wm.user_id
           WHERE wm.workspace_id = ? AND wm.deleted_at IS NULL AND u.deleted_at IS NULL`,
    params: [SAMPLE_WS],
  },
  {
    name: 'mgmtIpRepo.getMgmtIpForUser',
    where: 'core/tunnel.routes.js — activate (eje anti-spoofing)',
    sql: `SELECT mgmt_ip FROM user_mgmt_ips
            WHERE workspace_id = ? AND user_id = ? LIMIT 1`,
    params: [SAMPLE_WS, SAMPLE_USER],
  },
  {
    name: 'mgmt_peer_owners (listado por ws)',
    where: 'wireguard.routes.js — GET /api/wireguard/peers',
    sql: `SELECT public_key, workspace_id FROM mgmt_peer_owners
            WHERE workspace_id = ?`,
    params: [SAMPLE_WS],
  },
  {
    name: 'auth_attempts — rate limit',
    where: 'auth.routes.js — login, OTP, password-reset',
    sql: `SELECT COUNT(*) AS c FROM auth_attempts
            WHERE ip_address = ? AND kind = 'LOGIN' AND success = 0 AND created_at > ?`,
    params: ['127.0.0.1', NOW - 900_000],
  },
  {
    name: 'signal_history — última muestra de un CPE',
    where: 'ap-monitor — timeline CPE',
    sql: `SELECT * FROM signal_history
            WHERE cpe_id = ? ORDER BY timestamp DESC LIMIT 50`,
    params: [SAMPLE_CPE],
  },
  {
    name: 'signal_history — agregados 24h de un AP (v_ap_performance_24h)',
    where: 'ap-monitor dashboard',
    sql: `SELECT a.id AS ap_id, COUNT(sh.id) AS total_samples
            FROM aps a LEFT JOIN signal_history sh
              ON sh.ap_id = a.id AND sh.timestamp > ?
           WHERE a.id = ? GROUP BY a.id`,
    params: [NOW - 86_400_000, SAMPLE_AP],
  },
  {
    name: 'nodes — listado por workspace (filterNodesForRole)',
    where: 'nodes/listing.routes.js — todo /api/nodes',
    sql: `SELECT ppp_user, nombre_vrf FROM nodes WHERE workspace_id = ?`,
    params: [SAMPLE_WS],
  },
];

function rowsBad(row) {
  // Heurística simple: type 'ALL' = scan completo; "Using filesort"
  // sobre tablas grandes es sospechoso; "Using temporary" idem.
  const issues = [];
  if (row.type === 'ALL') issues.push('full scan (type=ALL)');
  if ((row.Extra || '').includes('Using filesort')) issues.push('Using filesort');
  if ((row.Extra || '').includes('Using temporary')) issues.push('Using temporary');
  if (row.key === null) issues.push('no usa ningún índice');
  return issues;
}

function fmt(s, w) {
  s = String(s ?? '');
  return s.length > w ? s.slice(0, w - 1) + '…' : s.padEnd(w);
}

async function main() {
  const wantJson = process.argv.includes('--json');
  const results = [];
  let warnings = 0;

  for (const q of QUERIES) {
    try {
      const plan = await query(`EXPLAIN ${q.sql}`, q.params);
      const issues = plan.flatMap(rowsBad);
      if (issues.length) warnings++;
      results.push({ name: q.name, where: q.where, plan, issues });
    } catch (err) {
      results.push({ name: q.name, where: q.where, error: err.message });
      warnings++;
    }
  }

  if (wantJson) {
    process.stdout.write(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      console.log('\n━━ ' + r.name);
      console.log('   ' + r.where);
      if (r.error) { console.log('   ERROR: ' + r.error); continue; }
      console.log('   ' + ['table', 'type', 'key', 'rows', 'Extra'].map(h => fmt(h, h === 'Extra' ? 40 : 12)).join(' '));
      for (const row of r.plan) {
        console.log('   ' + [row.table, row.type, row.key, row.rows, row.Extra]
          .map((c, i) => fmt(c, i === 4 ? 40 : 12)).join(' '));
      }
      if (r.issues.length) {
        console.log('   ⚠ ' + r.issues.join(', '));
      } else {
        console.log('   ✓ usa índice — sin filesort/temporary');
      }
    }
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total: ${QUERIES.length} queries · ${warnings} con warnings`);
  }

  await closePool();
  process.exit(warnings > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fallo analyze-queries:', err);
  closePool().catch(() => {});
  process.exit(2);
});
