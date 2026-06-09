// ============================================================
//  mapUserMgmtIp.js — Asocia un usuario de la app a su IP de gestión.
//  Uso:
//     node db/mapUserMgmtIp.js <email|nombre> <mgmt_ip> [publicKey]
//  Ej:
//     node db/mapUserMgmtIp.js fernando 192.168.21.20
//
//  Busca el usuario por email exacto o por nombre (LIKE), resuelve su
//  workspace (OWNER preferente) y hace upsert en user_mgmt_ips.
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const mysql = require('mysql2/promise');
const crypto = require('crypto');

async function main() {
  const [identifier, mgmtIpRaw, publicKey] = process.argv.slice(2);
  if (!identifier || !mgmtIpRaw) {
    console.error('Uso: node db/mapUserMgmtIp.js <email|nombre> <mgmt_ip> [publicKey]');
    process.exit(1);
  }
  const mgmtIp = String(mgmtIpRaw).split('/')[0].trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(mgmtIp)) {
    console.error(`IP inválida: "${mgmtIp}"`);
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'vpn_manager',
  });

  try {
    // 1) Buscar usuario por email exacto o nombre (LIKE)
    const [users] = await conn.query(
      `SELECT id, email, name FROM users
        WHERE email = ? OR name LIKE ? OR email LIKE ?
        ORDER BY (email = ?) DESC LIMIT 5`,
      [identifier, `%${identifier}%`, `%${identifier}%`, identifier]
    );
    if (users.length === 0) { console.error(`No se encontró usuario "${identifier}".`); process.exit(2); }
    if (users.length > 1) {
      console.log('Coincidencias múltiples:');
      users.forEach(u => console.log(`  - ${u.email} (${u.name}) [${u.id}]`));
      console.log('Afina el identificador (usa el email exacto).');
      process.exit(3);
    }
    const userRow = users[0];

    // 2) Resolver workspace (preferir donde es OWNER)
    const [members] = await conn.query(
      `SELECT workspace_id, role FROM workspace_members
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY (role='OWNER') DESC, (role='CO_MODERATOR') DESC LIMIT 1`,
      [userRow.id]
    );
    if (members.length === 0) { console.error(`El usuario ${userRow.email} no pertenece a ningún workspace.`); process.exit(4); }
    const workspaceId = members[0].workspace_id;

    // 3) Upsert en user_mgmt_ips
    await conn.query(
      `INSERT INTO user_mgmt_ips
         (id, workspace_id, user_id, mgmt_ip, public_key, source, created_at, updated_at)
       VALUES (?,?,?,?,?, 'manual', ?, ?)
       ON DUPLICATE KEY UPDATE
         mgmt_ip = VALUES(mgmt_ip), public_key = VALUES(public_key),
         source = VALUES(source), updated_at = VALUES(updated_at)`,
      [crypto.randomUUID(), workspaceId, userRow.id, mgmtIp, publicKey || null, Date.now(), Date.now()]
    );

    console.log(`✓ Mapeado: ${userRow.email} (${userRow.name}) → ${mgmtIp}`);
    console.log(`  workspace=${workspaceId} role=${members[0].role}`);

    const [check] = await conn.query(
      `SELECT u.email, umi.mgmt_ip, umi.source
         FROM user_mgmt_ips umi JOIN users u ON u.id = umi.user_id
        WHERE umi.workspace_id = ? ORDER BY umi.mgmt_ip`,
      [workspaceId]
    );
    console.log('\nMapeos en el workspace:');
    check.forEach(c => console.log(`  ${c.mgmt_ip}  ${c.email}  (${c.source})`));
  } finally {
    await conn.end();
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('ERROR:', e.code || '', e.message); process.exit(1); });
