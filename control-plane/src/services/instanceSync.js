'use strict';

const { issueLicense } = require('./issueLicense');
const crypto = require('crypto');
const { publicKeyFingerprint } = require('../domain/licenses');
const { signTrustBundle } = require('../domain/instanceRequests');

function coded(code) { const error = new Error(code); error.code = code; return error; }
function iso(value) { return value ? new Date(value).toISOString() : null; }

async function syncInstance({ pool, instanceId, softwareVersion, requestLicense, licenseReason,
  signingKeyId, signingPrivateKey, now = new Date() }) {
  await pool.query(
    'UPDATE product_instances SET last_seen_at=?,software_version=COALESCE(?,software_version) WHERE id=?',
    [now, softwareVersion || null, instanceId],
  );
  const [keys] = await pool.query(
    `SELECT key_id,algorithm,public_key_pem,public_key_fingerprint,status,activated_at,retired_at
       FROM license_signing_keys ORDER BY activated_at DESC,key_id`,
  );
  const [revoked] = await pool.query(
    `SELECT id,revoked_at,revoke_reason FROM instance_licenses
      WHERE instance_id=? AND status='REVOKED' ORDER BY revoked_at DESC`, [instanceId],
  );
  const activeKey = keys.find(key => key.key_id === signingKeyId && key.status === 'ACTIVE');
  let configuredFingerprint;
  try {
    configuredFingerprint = publicKeyFingerprint(crypto.createPublicKey(signingPrivateKey).export({ type:'spki', format:'pem' }));
  } catch (_) { throw coded('SIGNING_PRIVATE_KEY_INVALID'); }
  if (!activeKey || activeKey.public_key_fingerprint !== configuredFingerprint) throw coded('SIGNING_PRIVATE_KEY_MISMATCH');
  const trustPayload = { generatedAt:Math.floor(now.getTime() / 1000),
    keys:keys.map(key => ({ keyId:key.key_id, algorithm:key.algorithm, publicKeyPem:key.public_key_pem,
      fingerprint:key.public_key_fingerprint, status:key.status, activatedAt:iso(key.activated_at), retiredAt:iso(key.retired_at) })),
    revokedLicenses:revoked.map(item => ({ id:item.id, revokedAt:iso(item.revoked_at), reason:item.revoke_reason })) };
  const license = requestLicense ? await issueLicense({ pool, instanceId, keyId:signingKeyId,
    privateKey:signingPrivateKey, now, reason:licenseReason }) : null;
  const [currentRows] = await pool.query(
    `SELECT id,key_id,not_before,expires_at,grace_until,status,issued_at
       FROM instance_licenses WHERE instance_id=? ORDER BY issued_at DESC LIMIT 1`, [instanceId],
  );
  return {
    serverTime:now,
    trustBundle:signTrustBundle(trustPayload, { keyId:signingKeyId, privateKey:signingPrivateKey }),
    currentLicense:currentRows[0] || null,
    ...(license ? { license } : {}),
  };
}

module.exports = { syncInstance };
