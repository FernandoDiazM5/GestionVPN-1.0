// ============================================================
//  Rutas de auditoría (Fase 3) — base /api/audit
//  Timeline de acciones sobre túneles, aislada por workspace.
// ============================================================
const express = require('express');
const { z } = require('zod');
const { asyncHandler, sendOk } = require('../lib/apiResponse');
const { requireSession } = require('../middleware/authJwt');
const { recordTunnelLog } = require('../lib/audit');
const { clientIp } = require('../lib/rateLimit');
const auditRepo = require('../db/repos/auditRepo');

const router = express.Router();

const logSchema = z.object({
  tunnelId: z.string().max(160).optional(),
  action: z.string().min(1).max(40),
  detail: z.string().max(2000).optional(),
});

// ── GET /logs  — timeline del workspace ──────────────────────
router.get('/logs', requireSession, asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const tunnelId = req.query.tunnelId ? String(req.query.tunnelId) : null;
  const logs = await auditRepo.list(req.account.workspace_id, { limit, tunnelId });
  return sendOk(res, { logs });
}));

// ── POST /log  — registrar una acción (interino hasta Fase 4) ─
router.post('/log', requireSession, asyncHandler(async (req, res) => {
  const { tunnelId, action, detail } = logSchema.parse(req.body);
  await recordTunnelLog(req.account, { tunnelId, action, detail, ip: clientIp(req) });
  return sendOk(res, { message: 'Registrado' }, 201);
}));

module.exports = router;
