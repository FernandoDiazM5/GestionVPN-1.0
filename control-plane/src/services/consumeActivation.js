'use strict';

const crypto = require('crypto');
const { digestActivationCode } = require('../domain/activationCodes');

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizePublicIp(value) {
  const ip = String(value || '').trim();
  if (!ip || ip.length > 45 || !/^[0-9a-f:.]+$/i.test(ip)) throw codedError('SOURCE_IP_INVALID');
  return ip;
}

function normalizeInstancePublicKey(publicKeyPem) {
  try {
    const key = crypto.createPublicKey(String(publicKeyPem || ''));
    if (key.asymmetricKeyType !== 'ed25519') throw codedError('INSTANCE_KEY_TYPE_INVALID');
    const der = key.export({ type: 'spki', format: 'der' });
    return {
      pem: key.export({ type: 'spki', format: 'pem' }).toString(),
      fingerprint: crypto.createHash('sha256').update(der).digest('hex'),
    };
  } catch (error) {
    if (error?.code === 'INSTANCE_KEY_TYPE_INVALID') throw error;
    throw codedError('INSTANCE_PUBLIC_KEY_INVALID');
  }
}

async function consumeActivation({ pool, code, pepper, instancePublicKeyPem, sourceIp, now = new Date() }) {
  if (!pool?.getConnection) throw new TypeError('POOL_REQUIRED');
  const digest = digestActivationCode(code, pepper);
  const identity = normalizeInstancePublicKey(instancePublicKeyPem);
  const ip = normalizePublicIp(sourceIp);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT ac.id, ac.instance_id, ac.status, ac.expires_at, pi.status AS instance_status
         FROM activation_codes ac
         JOIN product_instances pi ON pi.id = ac.instance_id
        WHERE ac.code_digest = ?
        LIMIT 1 FOR UPDATE`,
      [digest],
    );
    const record = rows[0];
    if (!record || record.status !== 'ISSUED') throw codedError('ACTIVATION_CODE_INVALID');
    if (new Date(record.expires_at).getTime() <= now.getTime()) throw codedError('ACTIVATION_CODE_EXPIRED');
    if (record.instance_status !== 'PENDING_ACTIVATION') throw codedError('INSTANCE_ALREADY_ACTIVATED');

    await connection.query(
      `INSERT INTO instance_identities
        (instance_id, public_key_pem, public_key_fingerprint, issued_at)
       VALUES (?, ?, ?, ?)`,
      [record.instance_id, identity.pem, identity.fingerprint, now],
    );
    const [consumed] = await connection.query(
      `UPDATE activation_codes
          SET status='CONSUMED', consumed_at=?, consumed_ip=?
        WHERE id=? AND status='ISSUED'`,
      [now, ip, record.id],
    );
    if (consumed.affectedRows !== 1) throw codedError('ACTIVATION_CODE_INVALID');

    await connection.query(
      `UPDATE product_instances
          SET status='ACTIVE', activated_at=?, last_seen_at=?
        WHERE id=? AND status='PENDING_ACTIVATION'`,
      [now, now, record.instance_id],
    );
    await connection.query(
      `INSERT INTO control_plane_audit_events
        (id, customer_id, instance_id, event_type, outcome, detail_json, source_ip)
       SELECT ?, customer_id, id, 'INSTANCE_ACTIVATED', 'SUCCESS', ?, ?
         FROM product_instances WHERE id=?`,
      [crypto.randomUUID(), JSON.stringify({ keyFingerprint: identity.fingerprint }), ip, record.instance_id],
    );
    await connection.commit();
    return { instanceId: record.instance_id, fingerprint: identity.fingerprint, status: 'ACTIVE' };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { normalizePublicIp, normalizeInstancePublicKey, consumeActivation };
