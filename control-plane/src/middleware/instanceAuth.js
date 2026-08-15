'use strict';

const crypto = require('crypto');
const { MAX_CLOCK_SKEW_SECONDS, verifyInstanceRequest } = require('../domain/instanceRequests');

function authFailure() { const error = new Error('INSTANCE_AUTH_FAILED'); error.code = 'INSTANCE_AUTH_FAILED'; return error; }

function createInstanceAuth({ pool, now = () => new Date() }) {
  return async (req, _res, next) => {
    const instanceId = String(req.get('x-joinpoint-instance') || '');
    const timestamp = Number(req.get('x-joinpoint-timestamp'));
    const nonce = String(req.get('x-joinpoint-nonce') || '');
    const signature = String(req.get('x-joinpoint-signature') || '');
    const current = now();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(instanceId) || !Number.isInteger(timestamp)
      || Math.abs(Math.floor(current.getTime() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS
      || !/^[A-Za-z0-9_-]{22,86}$/.test(nonce) || !/^[A-Za-z0-9_-]{80,120}$/.test(signature)) return next(authFailure());
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT ii.public_key_pem,pi.status FROM instance_identities ii
          JOIN product_instances pi ON pi.id=ii.instance_id
         WHERE ii.instance_id=? AND ii.revoked_at IS NULL FOR UPDATE`, [instanceId],
      );
      const identity = rows[0];
      if (!identity || ['CANCELLED', 'TERMINATED'].includes(identity.status)
        || !verifyInstanceRequest({ method:req.method, path:req.path, instanceId, timestamp, nonce, body:req.body }, signature, identity.public_key_pem)) throw authFailure();
      await connection.query('DELETE FROM instance_request_nonces WHERE instance_id=? AND expires_at<=?', [instanceId, current]);
      await connection.query(
        'INSERT INTO instance_request_nonces (instance_id,nonce_digest,expires_at,created_at) VALUES (?,?,?,?)',
        [instanceId, crypto.createHash('sha256').update(nonce).digest('hex'), new Date(current.getTime() + 10 * 60000), current],
      );
      await connection.commit();
      req.instance = { id:instanceId, status:identity.status };
      return next();
    } catch (error) {
      await connection.rollback().catch(() => {});
      return next(error?.code === 'ER_DUP_ENTRY' ? authFailure() : error);
    } finally { connection.release(); }
  };
}

module.exports = { createInstanceAuth };
