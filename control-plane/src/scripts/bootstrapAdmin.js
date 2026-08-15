'use strict';

const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { hashPassword, generateTotpSecret, encryptSecret, generateRecoveryCodes, recoveryCodeDigest } = require('../domain/adminSecurity');

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
  const sessionPepper = required('CONTROL_ADMIN_SESSION_PEPPER', 32);
  const pool = mysql.createPool({ host: required('CONTROL_DB_HOST'), port: Number(process.env.CONTROL_DB_PORT || 3306),
    user: required('CONTROL_DB_USER'), password: required('CONTROL_DB_PASSWORD'), database: required('CONTROL_DB_NAME'), connectionLimit: 1 });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM control_plane_admins FOR UPDATE');
    if (Number(count.total) !== 0) throw new Error('ADMIN_BOOTSTRAP_ALREADY_COMPLETED');
    const secret = generateTotpSecret();
    const adminId = crypto.randomUUID();
    const recoveryCodes = generateRecoveryCodes();
    await connection.query(
      `INSERT INTO control_plane_admins (id,email,display_name,password_hash,totp_secret_encrypted)
       VALUES (?,?,?,?,?)`, [adminId, email, displayName, await hashPassword(password), encryptSecret(secret, encryptionKey)],
    );
    for (const code of recoveryCodes) await connection.query(
      'INSERT INTO control_plane_admin_recovery_codes (id,admin_id,code_digest,created_at) VALUES (?,?,?,NOW(3))',
      [crypto.randomUUID(), adminId, recoveryCodeDigest(code, sessionPepper)],
    );
    await connection.commit();
    const uri = `otpauth://totp/${encodeURIComponent(`Joinpoint:${email}`)}?secret=${secret}&issuer=Joinpoint&algorithm=SHA1&digits=6&period=30`;
    process.stdout.write(`Administrador creado. Registre esta URI TOTP y guarde los códigos de recuperación; no volverán a mostrarse:\n${uri}\n${recoveryCodes.join('\n')}\n`);
  } catch (error) { await connection.rollback().catch(() => {}); throw error; }
  finally { connection.release(); await pool.end(); }
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
