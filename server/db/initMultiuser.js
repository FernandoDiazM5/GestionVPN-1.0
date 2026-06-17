// ============================================================
//  Inicializador del esquema Multi-usuario (aditivo, idempotente)
//  Crea: user_mgmt_ips, tunnel_user_sessions, tunnel_session_logs
//  Backfill: copia member_wireguard.allowed_ip → user_mgmt_ips
//
//  NO borra tablas existentes. Seguro de re-ejecutar.
//  Uso:  cd server && npm run init:multiuser
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

/** Divide un script SQL en sentencias (DDL plano, sin procedures). */
function splitStatements(sql) {
  return sql
    .split('\n')
    // Quita comentarios -- (de línea e inline) para que un ';' dentro de un
    // comentario no parta la sentencia (ER_PARSE_ERROR). Ver initRbac.js.
    .map(line => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

async function main() {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT) || 3306;
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'vpn_manager';

  const schemaPath = path.join(__dirname, '..', 'sql', 'schema_multiuser.sql');
  const statements = splitStatements(fs.readFileSync(schemaPath, 'utf8'));

  console.log(`[init:multiuser] Conectando a MySQL ${user}@${host}:${port}/${database} ...`);
  const conn = await mysql.createConnection({ host, port, user, password, database });

  try {
    // 1) Aplicar DDL (CREATE TABLE IF NOT EXISTS → idempotente)
    let applied = 0;
    for (const stmt of statements) {
      try {
        await conn.query(stmt);
        applied++;
      } catch (e) {
        console.error(`\n[init:multiuser] Falló sentencia #${applied + 1}:`);
        console.error('  ', stmt.slice(0, 120).replace(/\s+/g, ' '), '...');
        throw e;
      }
    }
    console.log(`[init:multiuser] ${applied} sentencias DDL aplicadas ✓`);

    // 2) Backfill: member_wireguard (user_id ↔ allowed_ip) → user_mgmt_ips
    //    Solo inserta los que faltan. allowed_ip viene como "192.168.21.x/32".
    const [members] = await conn.query(
      `SELECT mw.workspace_id, mw.user_id, mw.allowed_ip, mw.public_key
         FROM member_wireguard mw
        WHERE mw.allowed_ip IS NOT NULL AND mw.allowed_ip <> ''`
    );
    let backfilled = 0, skipped = 0;
    for (const m of members) {
      const ip = String(m.allowed_ip).split('/')[0].trim();
      if (!ip) { skipped++; continue; }
      try {
        const [r] = await conn.query(
          `INSERT IGNORE INTO user_mgmt_ips
             (id, workspace_id, user_id, mgmt_ip, public_key, source, created_at, updated_at)
           VALUES (?,?,?,?,?, 'member_wg', ?, ?)`,
          [crypto.randomUUID(), m.workspace_id, m.user_id, ip, m.public_key || null, Date.now(), Date.now()]
        );
        if (r.affectedRows > 0) backfilled++; else skipped++;
      } catch (e) {
        // p.ej. uq_umi_ip si la IP ya está tomada por otro usuario
        console.warn(`[init:multiuser] backfill omitido user=${m.user_id} ip=${ip}: ${e.code || e.message}`);
        skipped++;
      }
    }
    console.log(`[init:multiuser] Backfill member_wg → user_mgmt_ips: ${backfilled} insertados, ${skipped} omitidos.`);

    const [tables] = await conn.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = ? AND table_name IN
          ('user_mgmt_ips','tunnel_user_sessions','tunnel_session_logs')`,
      [database]
    );
    console.log('[init:multiuser] Tablas presentes:', tables.map(t => Object.values(t)[0]).join(', '));
    console.log('\n[init:multiuser] ⚠️  Verifica el mapeo usuario↔IP:');
    console.log('     SELECT u.email, umi.mgmt_ip, umi.source FROM user_mgmt_ips umi JOIN users u ON u.id=umi.user_id;');
    console.log('     Los OWNER/CO_MOD sin peer registrado deben mapearse manual (ver §2.2 del plan).');
  } finally {
    await conn.end();
  }
}

main()
  .then(() => { console.log('[init:multiuser] Completado.'); process.exit(0); })
  .catch((err) => {
    console.error('[init:multiuser] ERROR:', err.code || '', err.message);
    console.error('  → Verifica XAMPP/MySQL y que init:rbac ya se haya corrido (necesita users/workspaces).');
    process.exit(1);
  });
