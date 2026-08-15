'use strict';

const crypto = require('crypto');
const { publicKeyFingerprint, signLicense, stableJson } = require('../domain/licenses');

function coded(code) { const error = new Error(code); error.code = code; return error; }
function seconds(date) { return Math.floor(date.getTime() / 1000); }

async function issueLicense({ pool, instanceId, keyId, privateKey, now = new Date(), leaseDays = 7, offlineGraceHours = 72 }) {
  let configuredPublicFingerprint;
  try {
    const configuredPublicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
    configuredPublicFingerprint = publicKeyFingerprint(configuredPublicKey);
  } catch (_) { throw coded('SIGNING_PRIVATE_KEY_INVALID'); }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT pi.id AS instance_id, pi.customer_id, pi.status AS instance_status,
              ii.public_key_fingerprint AS instance_fingerprint,
              s.id AS subscription_id, s.status AS subscription_status, s.ends_at,
              sp.code AS plan_code, lsk.public_key_pem, lsk.public_key_fingerprint
         FROM product_instances pi
         JOIN instance_identities ii ON ii.instance_id=pi.id AND ii.revoked_at IS NULL
         JOIN subscriptions s ON s.instance_id=pi.id
         JOIN subscription_plans sp ON sp.id=s.plan_id AND sp.is_active=TRUE
         JOIN license_signing_keys lsk ON lsk.key_id=? AND lsk.status='ACTIVE'
        WHERE pi.id=? AND pi.status IN ('ACTIVE','PAST_DUE','GRACE_PERIOD')
        ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE`,
      [keyId, instanceId],
    );
    const record = rows[0];
    if (!record) throw coded('LICENSE_CONTEXT_NOT_FOUND');
    if (!['TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD'].includes(record.subscription_status)) throw coded('SUBSCRIPTION_NOT_LICENSABLE');
    if (publicKeyFingerprint(record.public_key_pem) !== record.public_key_fingerprint) throw coded('SIGNING_KEY_FINGERPRINT_MISMATCH');
    if (configuredPublicFingerprint !== record.public_key_fingerprint) throw coded('SIGNING_PRIVATE_KEY_MISMATCH');

    const [features] = await connection.query(
      `SELECT pe.feature_key, pe.enabled, pe.numeric_limit
         FROM plan_entitlements pe JOIN subscriptions s ON s.plan_id=pe.plan_id
        WHERE s.id=? ORDER BY pe.feature_key`, [record.subscription_id],
    );
    const entitlements = Object.fromEntries(features.map(item => [item.feature_key, item.numeric_limit == null ? Boolean(item.enabled) : Number(item.numeric_limit)]));
    const hardEnd = new Date(record.ends_at);
    const requestedEnd = new Date(now.getTime() + leaseDays * 86400000);
    const expiresAt = hardEnd < requestedEnd ? hardEnd : requestedEnd;
    if (expiresAt <= now) throw coded('SUBSCRIPTION_EXPIRED');
    const graceUntil = new Date(expiresAt.getTime() + offlineGraceHours * 3600000);
    const id = crypto.randomUUID();
    const payload = {
      iss: 'joinpoint-control', aud: 'joinpoint-instance', jti: id,
      instanceId, customerId: record.customer_id, instanceFingerprint: record.instance_fingerprint,
      subscriptionId: record.subscription_id, plan: record.plan_code, entitlements,
      iat: seconds(now), nbf: seconds(now), exp: seconds(expiresAt), graceUntil: seconds(graceUntil),
    };
    const token = signLicense(payload, { keyId, privateKey });
    const payloadHash = crypto.createHash('sha256').update(stableJson(payload)).digest('hex');
    await connection.query("UPDATE instance_licenses SET status='SUPERSEDED' WHERE instance_id=? AND status='ISSUED'", [instanceId]);
    await connection.query(
      `INSERT INTO instance_licenses
        (id,instance_id,subscription_id,key_id,payload_sha256,not_before,expires_at,grace_until,issued_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, instanceId, record.subscription_id, keyId, payloadHash, now, expiresAt, graceUntil, now],
    );
    await connection.commit();
    return { id, token, expiresAt, graceUntil, plan: record.plan_code, entitlements };
  } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
}

module.exports = { issueLicense };
