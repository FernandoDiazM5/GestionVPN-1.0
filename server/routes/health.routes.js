// ============================================================
//  Rutas de salud / diagnóstico (Fase 1)
//  Permite verificar la conectividad con MySQL sin autenticación.
// ============================================================
const express = require('express');
const { ping } = require('../db/mysql');
const { sendOk, asyncHandler } = require('../lib/apiResponse');

const router = express.Router();

// GET /api/health/db  → verifica conexión MySQL
router.get('/db', asyncHandler(async (_req, res) => {
  await ping();
  return sendOk(res, { db: 'mysql', status: 'online' });
}));

module.exports = router;
