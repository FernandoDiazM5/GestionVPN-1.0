// ============================================================
//  Stream de eventos en tiempo real (Fase 4) — base /api/events
//  SSE autenticado por sesión; cada cliente se une al room de su
//  workspace. EventSource del navegador debe usar withCredentials.
// ============================================================
const express = require('express');
const sse = require('../lib/sse');
const { requireSession } = require('../middleware/authJwt');

const router = express.Router();

// GET /api/events/stream
router.get('/stream', requireSession, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',        // evita buffering en proxies/nginx
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  res.write(`event: ready\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  const unsubscribe = sse.subscribe(req.account.workspace_id, res);

  // Heartbeat cada 25s para mantener viva la conexión (proxies, etc.)
  const heartbeat = setInterval(() => {
    try { res.write(': hb\n\n'); } catch (_) { /* noop */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

module.exports = router;
