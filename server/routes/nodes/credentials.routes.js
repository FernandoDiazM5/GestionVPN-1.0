// ============================================================
//  routes/nodes/credentials.routes.js — gestión de credenciales
//
//   POST /node/creds/save       → guarda PPP password cifrada (AES-256-GCM)
//   POST /node/creds/get        → descifra (requireOperator)
//   POST /node/ssh-creds/save   → reemplaza credenciales SSH del nodo
//   POST /node/ssh-creds/get    → descifra (requireOperator)
// ============================================================

const express = require('express');
const router = express.Router();

const { getDb, encryptPass, decryptPass, getNodeId } = require('../../db.service');
const { nodeBelongsToRequester, requireOperator } = require('./_shared');

router.post('/node/creds/save', async (req, res) => {
  const { pppUser, pppPassword } = req.body;
  if (!pppUser || !pppPassword) return res.status(400).json({ success: false, message: 'pppUser y pppPassword requeridos' });
  if (!(await nodeBelongsToRequester(req, pppUser))) return res.status(404).json({ success: false, message: 'Nodo no encontrado en tu workspace' });
  try {
    const db = await getDb();
    const encrypted = encryptPass(pppPassword);
    await db.run('UPDATE nodes SET ppp_password_enc = ? WHERE ppp_user = ?', [encrypted, pppUser]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/node/creds/get', requireOperator, async (req, res) => {
  const { pppUser } = req.body;
  if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
  try {
    const db = await getDb();
    const row = await db.get('SELECT ppp_password_enc FROM nodes WHERE ppp_user = ?', [pppUser]);
    if (!row || !row.ppp_password_enc) return res.json({ success: false, message: 'Sin credenciales guardadas' });
    res.json({ success: true, pppPassword: decryptPass(row.ppp_password_enc) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/node/ssh-creds/save', async (req, res) => {
  const { pppUser, creds } = req.body;
  if (!pppUser || !Array.isArray(creds)) return res.status(400).json({ success: false, message: 'pppUser y creds[] requeridos' });
  if (!(await nodeBelongsToRequester(req, pppUser))) return res.status(404).json({ success: false, message: 'Nodo no encontrado en tu workspace' });
  try {
    const db = await getDb();
    const nodeId = await getNodeId(pppUser);
    if (!nodeId) return res.status(404).json({ success: false, message: `Nodo no encontrado: ${pppUser}` });

    // Reemplazar todas las credenciales SSH del nodo
    await db.run('DELETE FROM node_ssh_creds WHERE node_id = ?', [nodeId]);
    for (let i = 0; i < creds.length; i++) {
      const c = creds[i];
      await db.run(
        'INSERT INTO node_ssh_creds (node_id, ssh_user, ssh_pass_enc, ssh_port, priority) VALUES (?, ?, ?, ?, ?)',
        [nodeId, c.user || 'ubnt', encryptPass(c.pass || ''), c.port || 22, i]
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/node/ssh-creds/get', requireOperator, async (req, res) => {
  const { pppUser } = req.body;
  if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
  try {
    const db = await getDb();
    const nodeId = await getNodeId(pppUser);
    if (!nodeId) return res.json({ success: true, creds: [] });
    const rows = await db.all(
      'SELECT ssh_user, ssh_pass_enc, ssh_port, priority FROM node_ssh_creds WHERE node_id = ? ORDER BY priority',
      [nodeId]
    );
    const creds = rows.map(r => ({ user: r.ssh_user, pass: decryptPass(r.ssh_pass_enc), port: r.ssh_port }));
    res.json({ success: true, creds });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
