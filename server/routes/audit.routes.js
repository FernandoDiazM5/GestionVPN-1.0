// ============================================================
//  Rutas de auditoría (Fase 3) — base /api/audit
//  Timeline de acciones sobre túneles, aislada por workspace.
// ============================================================
const express = require('express');
const { z } = require('zod');
const { asyncHandler, sendOk, AppError } = require('../lib/apiResponse');
const { requireSession } = require('../middleware/authJwt');
const { recordTunnelLog } = require('../lib/audit');
const { clientIp } = require('../lib/rateLimit');
const auditRepo = require('../db/repos/auditRepo');
const { AuditExportRequestSchema } = require('@gestionvpn/contracts');
const { rowToCsv } = require('../lib/csv');
const log = require('../lib/logger').child({ scope: 'audit-export' });

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

// ── POST /export — descarga CSV o JSON con filtros (Q4) ──────
// Rate limit dedicado en memoria: 1 export cada 5s por usuario para evitar
// que un dashboard mal hecho dispare scans constantes (cada export puede
// devolver hasta 10k filas; sobre tablas con millones impacta el pool).
const _exportHits = new Map(); // userId → epoch ms del último export
const EXPORT_WINDOW_MS = 5_000;

router.post('/export', requireSession, asyncHandler(async (req, res) => {
  const userId = req.account.sub;
  const last = _exportHits.get(userId) || 0;
  if (Date.now() - last < EXPORT_WINDOW_MS) {
    throw new AppError('Espera unos segundos antes de exportar de nuevo.', 429, 'EXPORT_RATE_LIMITED');
  }
  _exportHits.set(userId, Date.now());

  const parsed = AuditExportRequestSchema.parse(req.body || {});
  const now = Date.now();
  const from = parsed.from ?? (now - 30 * 24 * 60 * 60 * 1000);   // 30 días
  const to   = parsed.to   ?? now;
  if (to < from) throw new AppError('Rango inválido: to < from', 422, 'BAD_RANGE');

  const rows = await auditRepo.listForExport(req.account.workspace_id, {
    from, to, tunnelId: parsed.tunnelId, action: parsed.action,
  });

  log.info({ userId, count: rows.length, format: parsed.format, from, to }, 'audit/export');

  const fnBase = `audit-${new Date(from).toISOString().slice(0, 10)}_${new Date(to).toISOString().slice(0, 10)}`;

  if (parsed.format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fnBase}.json"`);
    return res.end(JSON.stringify({
      success: true,
      rows,
      meta: {
        from, to,
        tunnelId: parsed.tunnelId || null,
        action: parsed.action || null,
        count: rows.length,
      },
    }));
  }

  // CSV: stream línea por línea — no acumulamos todo en RAM si son muchas filas.
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fnBase}.csv"`);
  // BOM UTF-8 — Excel detecta encoding correctamente al doble-clickear el archivo.
  res.write('﻿');
  res.write(rowToCsv([
    'id', 'created_at_iso', 'tunnel_id', 'action',
    'user_email', 'user_name', 'ip_address', 'detail',
  ]) + '\r\n');
  for (const r of rows) {
    res.write(rowToCsv([
      r.id,
      new Date(Number(r.created_at)).toISOString(),
      r.tunnel_id,
      r.action,
      r.user_email,
      r.user_name,
      r.ip_address,
      r.detail,
    ]) + '\r\n');
  }
  return res.end();
}));

module.exports = router;
