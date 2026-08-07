// ============================================================
//  settings.routes.js — settings de plataforma (router core)
//  Fase F5.A: shape uniforme (sendOk/AppError) + validación Zod.
// ============================================================
const express = require('express');
const { z } = require('zod');
const router = express.Router();

const { getDb, encryptPass, getAppSetting } = require('../db.service');
const { sendOk, AppError, asyncHandler } = require('../lib/apiResponse');
const { SaveSettingRequestSchema, CORE_ROUTER_KEYS } = require('@gestionvpn/contracts');
const { sendGeneric } = require('../lib/mailer');
const wgDetect = require('../lib/wgDetect');

const ERROR_REPORT_EMAIL_KEY = 'error_report_email';
const CORE_SERVER_SETTING_KEYS = [
  'core_wan_interface', 'core_vps_public_key', 'core_backup_enabled',
  'core_backup_time', 'core_backup_timezone', 'core_backup_password',
];
const PLATFORM_ONLY_SETTING_KEYS = [...CORE_ROUTER_KEYS, ERROR_REPORT_EMAIL_KEY, ...CORE_SERVER_SETTING_KEYS];
const errorReportEmailSchema = z.union([
  z.literal(''),
  z.string().trim().email('Correo de reportes no valido').max(254),
]);

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
    if (!isPlatformAdmin && PLATFORM_ONLY_SETTING_KEYS.includes(r.key)) return;
    if ((r.key === 'MT_PASS' || r.key === 'core_backup_password') && r.value) {
      settings[r.key] = '********';
    } else {
      settings[r.key] = r.value;
    }
  });
  return sendOk(res, { settings });
}));

// Solo el Administrador de PLATAFORMA puede escribir settings globales.
// ⚠️ Antes miraba el rol legacy `admin`, pero `mapRbacRole` se lo otorga también
// a OWNER → un moderador podía mutar settings GLOBALES del sistema
// (scan_mode, server_public_ip, local_scan_ip) por API, fuera de su tenant.
// Estos settings son plataforma-global: el gate correcto es `platform_admin`.
const requireAdmin = (req, _res, next) => {
  if (!req.account?.platform_admin) {
    return next(new AppError('Acceso denegado — solo el Administrador de plataforma.', 403, 'FORBIDDEN'));
  }
  next();
};

// Chequeo READ-ONLY (solo admin): ¿la local_scan_ip configurada está viva en
// este equipo? Solo relevante en modo 'local'. Alimenta la alerta de la UI sin
// modificar nada. `ok=true` cuando no aplica (modo VPS) o la IP sí está activa.
router.get('/settings/scan-local-check', requireAdmin, asyncHandler(async (req, res) => {
  const db = await getDb();
  const modeRow = await db.get("SELECT value FROM app_settings WHERE `key` = 'scan_mode'");
  const ipRow = await db.get("SELECT value FROM app_settings WHERE `key` = 'local_scan_ip'");
  const mode = modeRow?.value || 'vps';
  const configured = (ipRow?.value || '').trim();
  const candidates = wgDetect.listLocalMgmtIps();
  const ok = mode !== 'local' ? true : (!!configured && wgDetect.isLocalIpv4(configured));
  return sendOk(res, { mode, configured, ok, candidates });
}));

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
  } else if (key === 'core_backup_password') {
    if (finalValue === '********') return sendOk(res);
    const plain = String(finalValue || '');
    if (plain && plain.length < 12) {
      throw new AppError('La contraseña del respaldo debe tener al menos 12 caracteres.', 422, 'BACKUP_PASSWORD_WEAK');
    }
    finalValue = plain ? encryptPass(plain) : '';
  } else if (key === 'core_backup_enabled') {
    finalValue = String(finalValue) === 'true' ? 'true' : 'false';
  } else if (key === 'core_backup_time') {
    finalValue = String(finalValue || '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(finalValue)) {
      throw new AppError('La hora debe usar el formato HH:mm.', 422, 'BACKUP_TIME_INVALID');
    }
  } else if (key === 'core_backup_timezone') {
    finalValue = String(finalValue || '').trim();
    try { new Intl.DateTimeFormat('es', { timeZone: finalValue }).format(); }
    catch (_) { throw new AppError('La zona horaria no es válida.', 422, 'BACKUP_TIMEZONE_INVALID'); }
  } else if (key === 'core_vps_public_key') {
    finalValue = String(finalValue || '').trim();
    if (finalValue && !/^[A-Za-z0-9+/]{43}=$/.test(finalValue)) {
      throw new AppError('La clave pública WireGuard del VPS no es válida.', 422, 'VPS_PUBLIC_KEY_INVALID');
    }
  } else if (key === 'core_wan_interface') {
    finalValue = String(finalValue || '').trim();
    if (finalValue.length > 64 || /[\r\n]/.test(finalValue)) {
      throw new AppError('La interfaz WAN no es válida.', 422, 'WAN_INTERFACE_INVALID');
    }
  } else if (key === ERROR_REPORT_EMAIL_KEY) {
    finalValue = errorReportEmailSchema.parse(String(finalValue).trim().toLowerCase());
  }

  await db.run(
    'INSERT INTO app_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(`key`) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, finalValue, Date.now()]
  );
  return sendOk(res);
}));

router.post('/settings/test-error-email', requireAdmin, asyncHandler(async (_req, res) => {
  const savedEmail = String(await getAppSetting(ERROR_REPORT_EMAIL_KEY).catch(() => '') || '').trim();
  const recipient = savedEmail || process.env.ERROR_REPORT_EMAIL || process.env.SMTP_USER;
  if (!recipient) {
    throw new AppError('Configura un correo de reportes antes de enviar la prueba.', 400, 'ERROR_REPORT_EMAIL_REQUIRED');
  }

  const delivery = await sendGeneric({
    to: recipient,
    subject: '[Joinpoint NOC] Prueba de reportes técnicos',
    text: 'Joinpoint NOC\n\nLa entrega de reportes técnicos está configurada correctamente.\n\nOperación segura · Monitoreo centralizado',
    kind: 'error_report_test',
  });
  if (!delivery.delivered) {
    const message = delivery.dev
      ? 'SMTP no esta configurado en este entorno.'
      : 'No se pudo entregar el correo de prueba.';
    throw new AppError(message, 503, 'ERROR_REPORT_EMAIL_DELIVERY_FAILED');
  }
  return sendOk(res, { message: 'Correo de prueba enviado', recipient });
}));

module.exports = router;
