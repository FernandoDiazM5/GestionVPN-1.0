'use strict';

const { publicKeyFingerprint } = require('../domain/licenses');

function coded(code) { const error = new Error(code); error.code = code; return error; }

function createLicenseLifecycleService({ pool, now = () => new Date() }) {
  async function listSigningKeys() {
    const [rows] = await pool.query(
      `SELECT key_id, algorithm, public_key_fingerprint, status, activated_at, retired_at
         FROM license_signing_keys ORDER BY activated_at DESC, key_id`,
    );
    return rows;
  }

  async function registerSigningKey({ keyId, publicKeyPem, activate = false }) {
    const fingerprint = publicKeyFingerprint(publicKeyPem);
    const timestamp = now();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (activate) {
        await connection.query(
          "UPDATE license_signing_keys SET status='VERIFY_ONLY', retired_at=? WHERE status='ACTIVE'",
          [timestamp],
        );
      }
      await connection.query(
        `INSERT INTO license_signing_keys
          (key_id, algorithm, public_key_pem, public_key_fingerprint, status, activated_at, retired_at)
         VALUES (?, 'Ed25519', ?, ?, ?, ?, NULL)`,
        [keyId, publicKeyPem, fingerprint, activate ? 'ACTIVE' : 'VERIFY_ONLY', timestamp],
      );
      await connection.commit();
      return { keyId, algorithm: 'Ed25519', publicKeyFingerprint: fingerprint,
        status: activate ? 'ACTIVE' : 'VERIFY_ONLY', activatedAt: timestamp };
    } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  }

  async function activateSigningKey(keyId) {
    const timestamp = now();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        'SELECT key_id, status FROM license_signing_keys WHERE key_id=? FOR UPDATE', [keyId],
      );
      if (!rows[0]) throw coded('SIGNING_KEY_NOT_FOUND');
      if (rows[0].status === 'REVOKED') throw coded('SIGNING_KEY_NOT_ACTIVATABLE');
      await connection.query(
        "UPDATE license_signing_keys SET status='VERIFY_ONLY', retired_at=? WHERE status='ACTIVE' AND key_id<>?",
        [timestamp, keyId],
      );
      await connection.query(
        "UPDATE license_signing_keys SET status='ACTIVE', activated_at=?, retired_at=NULL WHERE key_id=?",
        [timestamp, keyId],
      );
      await connection.commit();
      return { keyId, status: 'ACTIVE', activatedAt: timestamp };
    } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  }

  async function revokeSigningKey(keyId) {
    const timestamp = now();
    const [result] = await pool.query(
      `UPDATE license_signing_keys SET status='REVOKED', retired_at=?
        WHERE key_id=? AND status<>'REVOKED'`, [timestamp, keyId],
    );
    if (!result.affectedRows) throw coded('SIGNING_KEY_NOT_REVOCABLE');
    return { keyId, status: 'REVOKED', revokedAt: timestamp };
  }

  async function listLicenses(instanceId) {
    const [rows] = await pool.query(
      `SELECT id, instance_id, subscription_id, key_id, not_before, expires_at, grace_until,
              status, issued_at, revoked_at, revoke_reason
         FROM instance_licenses WHERE instance_id=? ORDER BY issued_at DESC`, [instanceId],
    );
    return rows;
  }

  async function revokeLicense(id, reason) {
    const timestamp = now();
    const [result] = await pool.query(
      `UPDATE instance_licenses SET status='REVOKED', revoked_at=?, revoke_reason=?
        WHERE id=? AND status='ISSUED'`, [timestamp, reason, id],
    );
    if (!result.affectedRows) throw coded('LICENSE_NOT_REVOCABLE');
    return { id, status: 'REVOKED', revokedAt: timestamp, reason };
  }

  return { listSigningKeys, registerSigningKey, activateSigningKey, revokeSigningKey, listLicenses, revokeLicense };
}

module.exports = { createLicenseLifecycleService };
