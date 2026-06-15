// ============================================================
//  routes/nodes/history.routes.js — bitácora por nodo
//
//   POST /node/history/add   → append-only de evento del operador
//   POST /node/history/get   → últimos 200 eventos (más reciente primero)
// ============================================================

const express = require('express');
const router = express.Router();

const { getDb, getNodeId } = require('../../db.service');
const { nodeBelongsToRequester, requireOperator } = require('./_shared');

router.post('/node/history/add', requireOperator, async (req, res) => {
  const { pppUser, event } = req.body;
  if (!pppUser || !event) return res.status(400).json({ success: false, message: 'pppUser y event requeridos' });
  if (!(await nodeBelongsToRequester(req, pppUser))) return res.status(404).json({ success: false, message: 'Nodo no encontrado en tu workspace' });
  try {
    const db = await getDb();
    const nodeId = await getNodeId(pppUser);
    if (!nodeId) return res.status(404).json({ success: false, message: `Nodo no encontrado: ${pppUser}` });
    await db.run('INSERT INTO node_history (node_id, event, timestamp) VALUES (?, ?, ?)',
      [nodeId, event, Date.now()]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/node/history/get', async (req, res) => {
  const { pppUser } = req.body;
  if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
  try {
    const db = await getDb();
    const nodeId = await getNodeId(pppUser);
    if (!nodeId) return res.json({ success: true, history: [] });
    const rows = await db.all(
      'SELECT event, timestamp FROM node_history WHERE node_id = ? ORDER BY timestamp DESC LIMIT 200',
      [nodeId]);
    res.json({ success: true, history: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
