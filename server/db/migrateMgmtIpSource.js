// ============================================================
//  db/migrateMgmtIpSource.js — arregla el ENUM `source` de user_mgmt_ips
//  y rellena los mapeos user→IP que faltan.
//
//  CAUSA RAÍZ que corrige: el auto-mapeo (team.routes.js) hacía
//  `mgmtIpRepo.upsert({ source: 'auto-provision' })`, pero el enum era
//  ('member_wg','mgmt_peer','manual') — NO incluía 'auto-provision'. En
//  modo estricto, MariaDB lanza "Data truncated for column 'source'"; el
//  try/catch del upsert se lo tragaba (solo warn) → la fila NUNCA se
//  escribía. Resultado: usuarios con peer en `member_wireguard` pero sin
//  `user_mgmt_ips` → 409 NO_MGMT_IP al activar el túnel.
//
//  Esta migración, sobre una BD existente:
//    1) Ensancha el enum a ('member_wg','mgmt_peer','manual',
//       'auto-provision','auto-heal') para que los upserts del runtime
//       persistan de verdad.
//    2) Backfill: crea el mapeo faltante de cada peer de member_wireguard
//       (source='member_wg'), saltando IPs ya reclamadas (uq_umi_ip).
//
//  Idempotente: re-ejecutable sin efecto (el ALTER deja el enum igual; el
//  INSERT no toca a quien ya tiene mapeo).
//
//  Uso:  cd server && npm run migrate:mgmtipsource
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const mysql = require('mysql2/promise');

async function main() {
  const cfg = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'vpn_manager',
  };

  console.log(`[migrate:mgmtipsource] Conectando a ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} ...`);
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: false });

  try {
    // 1) Ensanchar el enum (idempotente: si ya está ancho, queda igual).
    await conn.query(
      "ALTER TABLE user_mgmt_ips MODIFY source " +
      "ENUM('member_wg','mgmt_peer','manual','auto-provision','auto-heal') " +
      "NOT NULL DEFAULT 'manual'"
    );
    console.log('[migrate:mgmtipsource] Enum `source` ensanchado (+auto-provision, +auto-heal).');

    // 2) Backfill de mapeos faltantes desde member_wireguard. La IP del peer
    //    es la fuente de verdad del src-address de la mangle; sin el mapeo el
    //    usuario no puede activar túnel. Saltamos:
    //      • IPs ya reclamadas por otro (uq_umi_ip),
    //      • peers cuyo workspace/usuario ya no existe (FK fk_umi_ws/fk_umi_user
    //        → member_wireguard huérfano de un workspace borrado).
    //    Esos casos quedan fuera (se revisan a mano) en vez de abortar el boot.
    const [res] = await conn.query(
      "INSERT INTO user_mgmt_ips " +
      "(id, workspace_id, user_id, mgmt_ip, public_key, source, created_at, updated_at) " +
      "SELECT UUID(), mw.workspace_id, mw.user_id, mw.allowed_ip, mw.public_key, 'member_wg', " +
      "       UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000 " +
      "FROM member_wireguard mw " +
      "LEFT JOIN user_mgmt_ips umi " +
      "  ON umi.user_id = mw.user_id AND umi.workspace_id = mw.workspace_id " +
      "WHERE umi.user_id IS NULL " +
      "  AND mw.allowed_ip IS NOT NULL AND mw.allowed_ip <> '' " +
      "  AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id = mw.workspace_id) " +
      "  AND EXISTS (SELECT 1 FROM users u WHERE u.id = mw.user_id) " +
      "  AND NOT EXISTS (SELECT 1 FROM user_mgmt_ips x WHERE x.mgmt_ip = mw.allowed_ip)"
    );
    console.log(`[migrate:mgmtipsource] Backfill: ${res.affectedRows} mapeo(s) creado(s) desde member_wireguard.`);
    process.exit(0);
  } finally {
    await conn.end();
  }
}

main().catch((err) => { console.error('[migrate:mgmtipsource] Error:', err.message); process.exit(1); });
