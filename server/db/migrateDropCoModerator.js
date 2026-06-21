// ============================================================
//  db/migrateDropCoModerator.js — Retiro del rol CO_MODERATOR.
//
//  Cada workspace tiene UN solo moderador (OWNER) + miembros (MEMBER).
//  Esta migración, sobre una BD existente:
//    1) Degrada a MEMBER cualquier fila que aún sea CO_MODERATOR
//       (en workspace_members y en invitations PENDING).
//    2) Reduce el ENUM de ambas columnas a ('OWNER','MEMBER').
//
//  Idempotente: si ya no hay CO_MODERATOR, el UPDATE afecta 0 filas y el
//  ALTER deja el enum igual. Re-ejecutable sin efecto.
//
//  Uso:  cd server && npm run migrate:dropcomod
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

  console.log(`[migrate:dropcomod] Conectando a ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} ...`);
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: false });

  try {
    // 1) Degradar datos existentes ANTES de estrechar el enum (si no, el ALTER
    //    truncaría esos valores). El moderador único es el OWNER; un co-mod
    //    pasa a MEMBER (no se promueve, eso crearía dos OWNER).
    const [mRes] = await conn.query(
      "UPDATE workspace_members SET role = 'MEMBER' WHERE role = 'CO_MODERATOR'"
    );
    const [iRes] = await conn.query(
      "UPDATE invitations SET role = 'MEMBER' WHERE role = 'CO_MODERATOR'"
    );
    console.log(`[migrate:dropcomod] Degradados: ${mRes.affectedRows} miembro(s), ${iRes.affectedRows} invitación(es).`);

    // 2) Reducir el enum (idempotente: si ya está reducido, queda igual).
    await conn.query(
      "ALTER TABLE workspace_members MODIFY role ENUM('OWNER','MEMBER') NOT NULL DEFAULT 'MEMBER'"
    );
    await conn.query(
      "ALTER TABLE invitations MODIFY role ENUM('OWNER','MEMBER') NOT NULL DEFAULT 'MEMBER'"
    );
    console.log('[migrate:dropcomod] Listo. Enum de roles reducido a (OWNER, MEMBER).');
    process.exit(0);
  } finally {
    await conn.end();
  }
}

main().catch((err) => { console.error('[migrate:dropcomod] Error:', err.message); process.exit(1); });
