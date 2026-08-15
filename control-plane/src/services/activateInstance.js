'use strict';

const crypto = require('crypto');
const { digestActivationCode } = require('../domain/activationCodes');
const { signLicense, publicKeyFingerprint, stableJson } = require('../domain/licenses');
const { deriveFqdn } = require('../domain/subdomains');
const { normalizeInstancePublicKey, normalizePublicIp } = require('./consumeActivation');
const { recordActivationAttempt } = require('./activationRateLimit');

function coded(code) { const error = new Error(code); error.code = code; return error; }
function unix(date) { return Math.floor(date.getTime() / 1000); }

async function activateInstance({ pool, code, activationPepper, rateLimitPepper, instancePublicKeyPem, sourceIp, signingKeyId, signingPrivateKey, now = new Date() }) {
  const ip = normalizePublicIp(sourceIp);
  await recordActivationAttempt({ pool, sourceIp: ip, pepper: rateLimitPepper, now });
  const digest = digestActivationCode(code, activationPepper);
  const identity = normalizeInstancePublicKey(instancePublicKeyPem);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT ac.id AS activation_id, ac.status AS activation_status, ac.expires_at AS activation_expires,
              pi.id AS instance_id, pi.customer_id, pi.status AS instance_status, pi.subdomain_label,
              s.id AS subscription_id, s.status AS subscription_status, s.ends_at,
              sp.code AS plan_code, na.management_cidr, rd.setting_value AS root_domain,
              lsk.public_key_pem, lsk.public_key_fingerprint
         FROM activation_codes ac JOIN product_instances pi ON pi.id=ac.instance_id
         JOIN subscriptions s ON s.instance_id=pi.id
         JOIN subscription_plans sp ON sp.id=s.plan_id AND sp.is_active=TRUE
         JOIN network_allocations na ON na.instance_id=pi.id
         JOIN platform_settings rd ON rd.setting_key='root_domain'
         JOIN license_signing_keys lsk ON lsk.key_id=? AND lsk.status='ACTIVE'
        WHERE ac.code_digest=? ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE`, [signingKeyId, digest],
    );
    const record = rows[0];
    if (!record || record.activation_status !== 'ISSUED') throw coded('ACTIVATION_CODE_INVALID');
    if (new Date(record.activation_expires) <= now) throw coded('ACTIVATION_CODE_EXPIRED');
    if (record.instance_status !== 'PENDING_ACTIVATION') throw coded('INSTANCE_ALREADY_ACTIVATED');
    if (!['TRIAL', 'ACTIVE'].includes(record.subscription_status) || new Date(record.ends_at) <= now) throw coded('SUBSCRIPTION_NOT_ACTIVE');
    if (publicKeyFingerprint(record.public_key_pem) !== record.public_key_fingerprint) throw coded('SIGNING_KEY_FINGERPRINT_MISMATCH');
    let configuredFingerprint;
    try {
      const configuredPublicKey = crypto.createPublicKey(signingPrivateKey).export({ type: 'spki', format: 'pem' });
      configuredFingerprint = publicKeyFingerprint(configuredPublicKey);
    } catch (_) { throw coded('SIGNING_PRIVATE_KEY_INVALID'); }
    if (configuredFingerprint !== record.public_key_fingerprint) throw coded('SIGNING_PRIVATE_KEY_MISMATCH');
    const [features] = await connection.query('SELECT feature_key,enabled,numeric_limit FROM plan_entitlements WHERE plan_id=(SELECT plan_id FROM subscriptions WHERE id=?) ORDER BY feature_key', [record.subscription_id]);
    const entitlements = Object.fromEntries(features.map(item => [item.feature_key, item.numeric_limit == null ? Boolean(item.enabled) : Number(item.numeric_limit)]));
    const expiresAt = new Date(Math.min(new Date(record.ends_at).getTime(), now.getTime() + 7 * 86400000));
    const graceUntil = new Date(expiresAt.getTime() + 72 * 3600000);
    const licenseId = crypto.randomUUID();
    const payload = { iss: 'joinpoint-control', aud: 'joinpoint-instance', jti: licenseId, instanceId: record.instance_id, customerId: record.customer_id, instanceFingerprint: identity.fingerprint, subscriptionId: record.subscription_id, plan: record.plan_code, entitlements, iat: unix(now), nbf: unix(now), exp: unix(expiresAt), graceUntil: unix(graceUntil) };
    const token = signLicense(payload, { keyId: signingKeyId, privateKey: signingPrivateKey });
    await connection.query('INSERT INTO instance_identities (instance_id,public_key_pem,public_key_fingerprint,issued_at) VALUES (?,?,?,?)', [record.instance_id, identity.pem, identity.fingerprint, now]);
    const [used] = await connection.query("UPDATE activation_codes SET status='CONSUMED',consumed_at=?,consumed_ip=? WHERE id=? AND status='ISSUED'", [now, ip, record.activation_id]);
    if (used.affectedRows !== 1) throw coded('ACTIVATION_CODE_INVALID');
    await connection.query("UPDATE product_instances SET status='ACTIVE',activated_at=?,last_seen_at=? WHERE id=? AND status='PENDING_ACTIVATION'", [now, now, record.instance_id]);
    await connection.query('INSERT INTO instance_licenses (id,instance_id,subscription_id,key_id,payload_sha256,not_before,expires_at,grace_until,issued_at) VALUES (?,?,?,?,?,?,?,?,?)', [licenseId, record.instance_id, record.subscription_id, signingKeyId, crypto.createHash('sha256').update(stableJson(payload)).digest('hex'), now, expiresAt, graceUntil, now]);
    await connection.commit();
    return { instanceId: record.instance_id, fqdn: deriveFqdn(record.root_domain, record.subdomain_label), managementCidr: record.management_cidr, license: token, licensePublicKey: record.public_key_pem, expiresAt, graceUntil };
  } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
}

module.exports = { activateInstance };
