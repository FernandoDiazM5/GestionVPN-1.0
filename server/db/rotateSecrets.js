// ============================================================
//  Rotación de la clave .db_secret (O2 — el secreto quedó expuesto en git/GitHub)
//
//  Re-cifra TODAS las credenciales almacenadas (decrypt con la clave VIEJA,
//  encrypt con una clave NUEVA) para que la clave filtrada deje de servir para
//  los datos actuales. No se pierde ninguna credencial.
//
//  Seguridad: respalda la clave vieja, persiste la nueva en .db_secret.new,
//  re-cifra en UNA transacción y solo entonces promueve la clave nueva.
//
//  Ejecutar:  cd server && node db/rotateSecrets.js   (con MySQL activo)
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getPool, withTransaction, closePool } = require('./mysql');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const SECRET_FILE = path.join(DATA_DIR, '.db_secret');

// AES-256-GCM con clave explícita (mismo formato que db.service: JSON {iv,data,tag} hex)
function dec(stored, key) {
  if (!stored) return null;
  const { iv, data, tag } = JSON.parse(stored);
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  d.setAuthTag(Buffer.from(tag, 'hex'));
  return d.update(data, 'hex', 'utf8') + d.final('utf8');
}
function enc(plain, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  let e = c.update(plain, 'utf8', 'hex'); e += c.final('hex');
  return JSON.stringify({ iv: iv.toString('hex'), data: e, tag: c.getAuthTag().toString('hex') });
}

// Columnas cifradas (tabla, columna-id, columna-cifrada)
const TARGETS = [
  ['app_settings', '`key`', 'value', "AND `key` = 'MT_PASS'"],
  ['nodes', 'id', 'ppp_password_enc', ''],
  ['node_ssh_creds', 'id', 'ssh_pass_enc', ''],
  ['aps', 'id', 'clave_ssh_enc', ''],
  ['aps', 'id', 'wifi_password_enc', ''],
  ['cpes', 'id', 'clave_ssh_enc', ''],
  ['member_wireguard', 'id', 'config_enc', ''],
];

async function main() {
  if (!fs.existsSync(SECRET_FILE)) { console.error('[rotate] No existe', SECRET_FILE); process.exit(1); }
  const oldKey = Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8').trim(), 'hex');
  if (oldKey.length !== 32) { console.error('[rotate] Clave vieja inválida'); process.exit(1); }
  const newKey = crypto.randomBytes(32);

  // Respaldo de la clave vieja + persistencia de la nueva (antes del commit)
  const bak = `${SECRET_FILE}.bak-${Date.now()}`;
  fs.copyFileSync(SECRET_FILE, bak);
  fs.writeFileSync(`${SECRET_FILE}.new`, newKey.toString('hex'), { mode: 0o600 });

  let total = 0, failed = 0;
  await withTransaction(async (tx) => {
    for (const [table, idCol, col, extra] of TARGETS) {
      let rows;
      try { rows = await tx.query(`SELECT ${idCol} AS _id, ${col} AS _val FROM ${table} WHERE ${col} IS NOT NULL AND ${col} <> '' ${extra}`); }
      catch (e) { console.warn(`  · ${table}.${col}: omitida (${e.message.slice(0, 60)})`); continue; }
      let n = 0;
      for (const r of rows) {
        try {
          const plain = dec(r._val, oldKey);
          if (plain == null) continue;
          const reenc = enc(plain, newKey);
          await tx.query(`UPDATE ${table} SET ${col} = ? WHERE ${idCol} = ?`, [reenc, r._id]);
          n++; total++;
        } catch (e) { failed++; console.warn(`  ! ${table}.${col} id=${r._id}: no se pudo re-cifrar (${e.message.slice(0, 50)})`); }
      }
      if (rows.length) console.log(`  ✓ ${table}.${col}: ${n}/${rows.length} re-cifrados`);
    }
  });

  if (failed > 0) {
    console.error(`[rotate] ABORTADO: ${failed} valores no se pudieron re-cifrar. La transacción hizo ROLLBACK; la clave NO se rotó.`);
    fs.unlinkSync(`${SECRET_FILE}.new`);
    await closePool(); process.exit(1);
  }

  // Promueve la clave nueva (la transacción ya comiteó)
  fs.renameSync(`${SECRET_FILE}.new`, SECRET_FILE);
  console.log(`[rotate] Completado: ${total} credenciales re-cifradas con clave NUEVA.`);
  console.log(`         Respaldo de la clave vieja: ${path.basename(bak)} (bórralo cuando confirmes que todo funciona).`);
  await closePool();
}

main().then(() => process.exit(0)).catch(e => { console.error('[rotate] ERROR:', e.message); process.exit(1); });
