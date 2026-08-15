'use strict';

const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { hashPassword, generateTotpSecret, encryptSecret } = require('../domain/adminSecurity');

function required(name, min = 1) {
  const value = String(process.env[name] || '').trim();
  if (value.length < min) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function main() {
  const email = required('CONTROL_ADMIN_BOOTSTRAP_EMAIL').toLowerCase();
  const displayName = required('CONTROL_ADMIN_BOOTSTRAP_NAME', 2);
  const password = required('CONTROL_ADMIN_BOOTSTRAP_PASSWORD', 12);
  const encryptionKey = required('CONTROL_ADMIN_MFA_ENCRYPTION_KEY', 44);
  const pool = mysql.createPool({ host: required('CONTROL_DB_HOST'), port: Number(process.env.CONTROL_DB_PORT || 3306),
    user: required('CONTROL_DB_USER'), password: required('CONTROL_DB_PASSWORD'), database: required('CONTROL_DB_NAME'), connectionLimit: 1 });
  try {
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM control_plane_admins');
    if (Number(count.total) !== 0) throw new Error('ADMIN_BOOTSTRAP_ALREADY_COMPLETED');
    const secret = generateTotpSecret();
    await pool.query(
      `INSERT INTO control_plane_admins (id,email,display_name,password_hash,totp_secret_encrypted)
       VALUES (?,?,?,?,?)`, [crypto.randomUUID(), email, displayName, await hashPassword(password), encryptSecret(secret, encryptionKey)],
    );
    const uri = `otpauth://totp/${encodeURIComponent(`Joinpoint:${email}`)}?secret=${secret}&issuer=Joinpoint&algorithm=SHA1&digits=6&period=30`;
    process.stdout.write(`Administrador creado. Registre esta URI TOTP ahora; no volverá a mostrarse:\n${uri}\n`);
  } finally { await pool.end(); }
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
