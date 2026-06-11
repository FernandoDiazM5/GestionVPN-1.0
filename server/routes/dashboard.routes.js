// ============================================================
//  routes/dashboard.routes.js — vista JSON del registry para UI (Q2)
//
//  Solo para platform_admin: el panel del admin lee este endpoint y
//  pinta sparklines + cards. Los moderadores no ven métricas globales.
//
//  GET /api/dashboard/metrics  → DashboardMetricsResponse
// ============================================================
const express = require('express');
const router = express.Router();

const { asyncHandler, sendOk, AppError } = require('../lib/apiResponse');
const { requireSession } = require('../middleware/authJwt');
const dashboardMetrics = require('../lib/dashboardMetrics');

router.get('/dashboard/metrics', requireSession, asyncHandler(async (req, res) => {
  if (!req.account?.platform_admin) {
    throw new AppError('Solo el administrador de plataforma puede ver las métricas globales.', 403, 'NOT_PLATFORM_ADMIN');
  }
  const current = await dashboardMetrics.snapshot();
  const history = dashboardMetrics.history();
  return sendOk(res, { current, history });
}));

module.exports = router;
