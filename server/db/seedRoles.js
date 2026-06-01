// ============================================================
//  Seed de roles (Roles v2) — consolidación de usuarios
//  - SQLite: solo 'admin' (bootstrap, clave 'admin'); elimina legacy.
//  - MySQL : admin@local.app (Administrador/platform_admin)
//            fernando@local.app (Moderador, clave 48523451) — dueño de
//            su workspace; al ser OWNER ve TODOS los túneles del router.
//
//  Ejecutar: cd server && npm run seed:roles   (con MySQL/XAMPP activo)
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, withTransaction, closePool } = require('./mysql');
const userRepo = require('./repos/userRepo');
const workspaceRepo = require('./repos/workspaceRepo');
const { getDb, initDb } = require('../db.service');

async function ensureMysqlUser({ email, name, password, platformAdmin }) {
  const hash = await bcrypt.hash(password, 10);
  let user = await userRepo.findByEmail(email);
  if (!user) {
    const id = crypto.randomUUID();
    const now = Date.now();
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO users (id, email, password_hash, name, is_platform_admin, email_verified, created_at, updated_at)
         VALUES (?,?,?,?,?,1,?,?)`,
        [id, email, hash, name, platformAdmin ? 1 : 0, now, now]
      );
      await workspaceRepo.createForOwner(tx, { ownerId: id, name: `Espacio de ${name}` });
    });
    console.log(`  ✓ creado ${email} (${platformAdmin ? 'Administrador' : 'Moderador'})`);
  } else {
    await query(
      'UPDATE users SET password_hash = ?, is_platform_admin = ?, name = ?, updated_at = ? WHERE id = ?',
      [hash, platformAdmin ? 1 : 0, name || user.name, Date.now(), user.id]
    );
    const m = await workspaceRepo.findMembershipByUser(user.id);
    if (!m) {
      await withTransaction(async (tx) => {
        await workspaceRepo.createForOwner(tx, { ownerId: user.id, name: `Espacio de ${name}` });
      });
    }
    console.log(`  ✓ actualizado ${email} (${platformAdmin ? 'Administrador' : 'Moderador'})`);
  }
}

async function main() {
  // 1) vpn_users (MySQL) — bootstrap legacy: solo 'admin' con clave 'admin'
  await initDb();
  const db = await getDb();
  const adminHash = await bcrypt.hash('admin', 10);
  const existing = await db.get('SELECT id FROM vpn_users WHERE username = ?', 'admin');
  if (existing) {
    await db.run('UPDATE vpn_users SET password_hash = ?, role = ? WHERE username = ?', adminHash, 'admin', 'admin');
  } else {
    await db.run('INSERT INTO vpn_users (username, password_hash, role, created_at) VALUES (?,?,?,?)',
      'admin', adminHash, 'admin', Date.now());
  }
  const del = await db.run("DELETE FROM vpn_users WHERE username <> 'admin'");
  console.log(`[seed] vpn_users: admin asegurado (admin/admin); ${del.changes || 0} usuario(s) legacy eliminados.`);

  // 2) MySQL — Administrador + Moderador fernando
  await ensureMysqlUser({ email: 'admin@local.app', name: 'admin', password: 'admin', platformAdmin: true });
  await ensureMysqlUser({ email: 'fernando@local.app', name: 'fernando', password: '48523451', platformAdmin: false });

  await closePool();
  console.log('[seed] Completado. Login: admin/admin (Administrador) · fernando/48523451 (Moderador).');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('[seed] ERROR:', e.message);
  process.exit(1);
});
