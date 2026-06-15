// ============================================================
//  routes/nodes/credentials.routes.js — gestión de credenciales
//
//   POST /node/creds/save       → guarda PPP password cifrada (AES-256-GCM)
//   POST /node/creds/get        → descifra (requireOperator)
//   POST /node/ssh-creds/save   → reemplaza credenciales SSH del nodo
//   POST /node/ssh-creds/get    → descifra (requireOperator)
//
//  Fase F5.A: shape uniforme (sendOk/AppError) + Zod.
// ============================================================

const express = require('express');
const router = express.Router();

const { getDb, encryptPass, decryptPass, getNodeId } = require('../../db.service');
const { nodeBelongsToRequester, requireOperator } = require('./_shared');
const { sendOk, AppError, asyncHandler } = require('../../lib/apiResponse');

router.post('/node/creds/save', requireOperator, asyncHandler(async (req, res) => {
  const { pppUser, pppPassword } = req.body;
  if (!pppUser || !pppPassword) {
    throw new AppError('pppUser y pppPassword requeridos', 400, 'VALIDATION_ERROR');
  }
  if (!(await nodeBelongsToRequester(req, pppUser))) {
    throw new AppError('Nodo no encontrado en tu workspace', 404, 'NOT_FOUND');
  }
  const db = await getDb();
  const encrypted = encryptPass(pppPassword);
  await db.run('UPDATE nodes SET ppp_password_enc = ? WHERE ppp_user = ?', [encrypted, pppUser]);
  return sendOk(res);
}));

router.post('/node/creds/get', requireOperator, asyncHandler(async (req, res) => {
  const { pppUser } = req.body;
  if (!pppUser) throw new AppError('pppUser requerido', 400, 'VALIDATION_ERROR');
  const db = await getDb();
  const row = await db.get('SELECT ppp_password_enc FROM nodes WHERE ppp_user = ?', [pppUser]);
  if (!row || !row.ppp_password_enc) {
    // No es error — el flag `hasCredentials: false` lo señala explícitamente.
    return sendOk(res, { hasCredentials: false, message: 'Sin credenciales guardadas' });
  }
  return sendOk(res, { hasCredentials: true, pppPassword: decryptPass(row.ppp_password_enc) });
}));

router.post('/node/ssh-creds/save', requireOperator, asyncHandler(async (req, res) => {
  const { pppUser, creds } = req.body;
  if (!pppUser || !Array.isArray(creds)) {
    throw new AppError('pppUser y creds[] requeridos', 400, 'VALIDATION_ERROR');
  }
  if (!(await nodeBelongsToRequester(req, pppUser))) {
    throw new AppError('Nodo no encontrado en tu workspace', 404, 'NOT_FOUND');
  }
  const db = await getDb();
  const nodeId = await getNodeId(pppUser);
  if (!nodeId) throw new AppError(`Nodo no encontrado: ${pppUser}`, 404, 'NOT_FOUND');

  // Reemplazar todas las credenciales SSH del nodo
  await db.run('DELETE FROM node_ssh_creds WHERE node_id = ?', [nodeId]);
  for (let i = 0; i < creds.length; i++) {
    const c = creds[i];
    await db.run(
      'INSERT INTO node_ssh_creds (node_id, ssh_user, ssh_pass_enc, ssh_port, priority) VALUES (?, ?, ?, ?, ?)',
      [nodeId, c.user || 'ubnt', encryptPass(c.pass || ''), c.port || 22, i]
    );
  }
  return sendOk(res);
}));

router.post('/node/ssh-creds/get', requireOperator, asyncHandler(async (req, res) => {
  const { pppUser } = req.body;
  if (!pppUser) throw new AppError('pppUser requerido', 400, 'VALIDATION_ERROR');
  const db = await getDb();
  const nodeId = await getNodeId(pppUser);
  if (!nodeId) return sendOk(res, { creds: [] });
  const rows = await db.all(
    'SELECT ssh_user, ssh_pass_enc, ssh_port, priority FROM node_ssh_creds WHERE node_id = ? ORDER BY priority',
    [nodeId]
  );
  const creds = rows.map(r => ({ user: r.ssh_user, pass: decryptPass(r.ssh_pass_enc), port: r.ssh_port }));
  return sendOk(res, { creds });
}));

module.exports = router;
