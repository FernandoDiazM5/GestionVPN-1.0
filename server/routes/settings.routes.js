// ============================================================
//  settings.routes.js — settings de plataforma (router core)
//  Fase F5.A: shape uniforme (sendOk/AppError) + validación Zod.
// ============================================================
const express = require('express');
const router = express.Router();

const { getDb, encryptPass } = require('../db.service');
const { sendOk, AppError, asyncHandler } = require('../lib/apiResponse');
const { SaveSettingRequestSchema, CORE_ROUTER_KEYS } = require('@gestionvpn/contracts');

// CORE_ROUTER_KEYS: las claves del router core (MT_IP, MT_USER, MT_PASS) viven
// en @gestionvpn/contracts. Son infraestructura de plataforma: solo el
// Administrador (platform_admin) puede verlas/editarlas. El resto de claves
// (server_public_ip, wg_endpoint_ip, etc.) son operativas para moderadores.

router.get('/settings/get', asyncHandler(async (req, res) => {
  const db = await getDb();
  const isPlatformAdmin = !!req.account?.platform_admin;
  const rows = await db.all('SELECT `key`, value FROM app_settings');
  const settings = {};
  rows.forEach(r => {
    if (!isPlatformAdmin && CORE_ROUTER_KEYS.includes(r.key)) return;
    if (r.key === 'MT_PASS' && r.value) {
      settings[r.key] = '********';
    } else {
      settings[r.key] = r.value;
    }
  });
  return sendOk(res, { settings });
}));

// Solo el Administrador de PLATAFORMA puede escribir settings globales.
// ⚠️ Antes miraba el rol legacy `admin`, pero `mapRbacRole` se lo otorga también
// a OWNER/CO_MODERATOR → un moderador podía mutar settings GLOBALES del sistema
// (scan_mode, server_public_ip, local_scan_ip) por API, fuera de su tenant.
// Estos settings son plataforma-global: el gate correcto es `platform_admin`.
const requireAdmin = (req, _res, next) => {
  if (!req.account?.platform_admin) {
    return next(new AppError('Acceso denegado — solo el Administrador de plataforma.', 403, 'FORBIDDEN'));
  }
  next();
};

router.post('/settings/save', requireAdmin, asyncHandler(async (req, res) => {
  const { key, value } = SaveSettingRequestSchema.parse(req.body);

  if (CORE_ROUTER_KEYS.includes(key) && !req.account?.platform_admin) {
    throw new AppError('Solo el Administrador puede modificar la configuración del router core.', 403, 'FORBIDDEN');
  }

  const db = await getDb();
  let finalValue = value ?? '';

  if (key === 'MT_PASS') {
    if (finalValue === '********') return sendOk(res);
    if (finalValue) finalValue = encryptPass(String(finalValue));
  }

  await db.run(
    'INSERT INTO app_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(`key`) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, finalValue, Date.now()]
  );
  return sendOk(res);
}));

module.exports = router;
