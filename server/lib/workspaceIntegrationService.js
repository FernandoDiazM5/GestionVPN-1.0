const nodemailer = require('nodemailer');
const { query, withTransaction } = require('../db/mysql');
const { encryptPass, decryptPass } = require('../db.service');
const { AppError } = require('./apiResponse');

const PROVIDERS = new Set(['BREVO', 'GMAIL', 'TELEGRAM', 'GEMINI']);
const EMAIL_PROVIDERS = new Set(['BREVO', 'GMAIL']);
const TIMEOUT_MS = 10_000;

function clean(value, max = 512) { return String(value || '').trim().slice(0, max); }
function assertProvider(provider) {
  const normalized = clean(provider, 24).toUpperCase();
  if (!PROVIDERS.has(normalized)) throw new AppError('Integración no soportada', 404, 'INTEGRATION_NOT_SUPPORTED');
  return normalized;
}
function requireValue(value, label, max = 512) {
  const out = clean(value, max);
  if (!out || out === '********') throw new AppError(`${label} es obligatorio`, 422, 'INTEGRATION_FIELD_REQUIRED');
  return out;
}
function validEmail(value, label) {
  const email = requireValue(value, label, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(`${label} no es válido`, 422, 'INTEGRATION_FIELD_INVALID');
  return email;
}

function normalize(provider, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Configuración inválida', 422, 'INTEGRATION_CONFIG_INVALID');
  if (provider === 'BREVO') return {
    host: 'smtp-relay.brevo.com', port: 2525, secure: false,
    username: requireValue(input.username, 'Usuario SMTP', 254),
    password: requireValue(input.password, 'Clave SMTP', 512),
    fromEmail: validEmail(input.fromEmail, 'Correo remitente'),
    fromName: clean(input.fromName || 'Joinpoint NOC', 120),
  };
  if (provider === 'GMAIL') return {
    host: 'smtp.gmail.com', port: 587, secure: false,
    username: validEmail(input.email, 'Cuenta de Gmail'),
    password: requireValue(input.appPassword, 'Contraseña de aplicación', 128).replace(/\s+/g, ''),
    fromEmail: validEmail(input.email, 'Cuenta de Gmail'),
    fromName: clean(input.fromName || 'Joinpoint NOC', 120),
  };
  if (provider === 'TELEGRAM') {
    const token = requireValue(input.botToken, 'Bot Token', 256);
    if (!/^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new AppError('El Bot Token no tiene un formato válido', 422, 'INTEGRATION_FIELD_INVALID');
    return { botToken: token };
  }
  const apiKey = requireValue(input.apiKey, 'API Key de Gemini', 256);
  if (apiKey.length < 20) throw new AppError('La API Key de Gemini no tiene un formato válido', 422, 'INTEGRATION_FIELD_INVALID');
  return { apiKey, model: clean(input.model || 'gemini-3.1-flash-lite', 80) };
}

async function timed(promise) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Tiempo de espera agotado'), { code: 'TIMEOUT' })), TIMEOUT_MS))]);
}

async function validate(provider, config) {
  try {
    if (EMAIL_PROVIDERS.has(provider)) {
      const tx = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: { user: config.username, pass: config.password }, connectionTimeout: TIMEOUT_MS, greetingTimeout: TIMEOUT_MS, socketTimeout: TIMEOUT_MS });
      await timed(tx.verify());
      tx.close();
      return { label: config.fromEmail, metadata: { host: config.host, port: config.port, fromEmail: config.fromEmail, fromName: config.fromName } };
    }
    if (provider === 'TELEGRAM') {
      const response = await timed(fetch(`https://api.telegram.org/bot${config.botToken}/getMe`, { signal: AbortSignal.timeout(TIMEOUT_MS) }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok !== true || !body.result?.username) throw Object.assign(new Error('Telegram rechazó el Bot Token'), { code: 'TELEGRAM_TOKEN_REJECTED' });
      return { label: `@${body.result.username}`, metadata: { username: body.result.username, botId: String(body.result.id || '') } };
    }
    const response = await timed(fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(config.apiKey)}&pageSize=1`, { signal: AbortSignal.timeout(TIMEOUT_MS) }));
    if (!response.ok) throw Object.assign(new Error('Google rechazó la API Key de Gemini'), { code: 'GEMINI_KEY_REJECTED' });
    return { label: config.model, metadata: { model: config.model } };
  } catch (error) {
    const code = error?.code === 'EAUTH' ? 'CREDENTIALS_REJECTED' : error?.code || 'VALIDATION_FAILED';
    throw new AppError('No se pudo validar la integración. Revisa las credenciales y vuelve a intentarlo.', 422, code);
  }
}

function publicRow(row) {
  let metadata = {};
  try { metadata = JSON.parse(row.metadata_json || '{}'); } catch (_) { /* datos históricos */ }
  return { provider: row.provider, configured: true, active: Boolean(row.active) && row.status === 'ACTIVE', status: row.status, label: row.display_label || null, metadata, lastValidatedAt: Number(row.last_validated_at), updatedAt: Number(row.updated_at) };
}

async function list(workspaceId) {
  const rows = await query('SELECT provider,status,active,display_label,metadata_json,last_validated_at,updated_at FROM workspace_integrations WHERE workspace_id=? ORDER BY provider', [workspaceId]);
  const found = new Map(rows.map(row => [row.provider, publicRow(row)]));
  return [...PROVIDERS].map(provider => found.get(provider) || { provider, configured: false, active: false, status: 'NOT_CONFIGURED', label: null, metadata: {}, lastValidatedAt: null, updatedAt: null });
}

async function save({ workspaceId, userId, provider: rawProvider, config: input }) {
  const provider = assertProvider(rawProvider);
  const config = normalize(provider, input);
  const checked = await validate(provider, config);
  const now = Date.now();
  await withTransaction(async tx => {
    if (EMAIL_PROVIDERS.has(provider)) await tx.query("UPDATE workspace_integrations SET active=0,updated_at=? WHERE workspace_id=? AND provider IN ('BREVO','GMAIL')", [now, workspaceId]);
    await tx.query(`INSERT INTO workspace_integrations (workspace_id,provider,config_enc,status,active,display_label,metadata_json,last_validated_at,last_error_code,configured_by,created_at,updated_at)
      VALUES (?,?,?,?,1,?,?,?,NULL,?,?,?) ON DUPLICATE KEY UPDATE config_enc=VALUES(config_enc),status='ACTIVE',active=1,display_label=VALUES(display_label),metadata_json=VALUES(metadata_json),last_validated_at=VALUES(last_validated_at),last_error_code=NULL,configured_by=VALUES(configured_by),updated_at=VALUES(updated_at)`,
      [workspaceId, provider, encryptPass(JSON.stringify(config)), 'ACTIVE', checked.label, JSON.stringify(checked.metadata), now, userId, now, now]);
  });
  return (await list(workspaceId)).find(item => item.provider === provider);
}

async function remove(workspaceId, rawProvider) {
  const provider = assertProvider(rawProvider);
  await query('DELETE FROM workspace_integrations WHERE workspace_id=? AND provider=?', [workspaceId, provider]);
}

async function getSecret(workspaceId, rawProvider) {
  const provider = assertProvider(rawProvider);
  const rows = await query('SELECT config_enc,active,status FROM workspace_integrations WHERE workspace_id=? AND provider=? LIMIT 1', [workspaceId, provider]);
  const row = rows[0];
  if (!row || !row.active || row.status !== 'ACTIVE') return null;
  try { return JSON.parse(decryptPass(row.config_enc)); } catch (_) { return null; }
}

async function revalidate(workspaceId, rawProvider) {
  const provider = assertProvider(rawProvider);
  const stored = await query('SELECT config_enc FROM workspace_integrations WHERE workspace_id=? AND provider=? LIMIT 1', [workspaceId, provider]);
  let config = null;
  try { config = stored[0]?.config_enc ? JSON.parse(decryptPass(stored[0].config_enc)) : null; } catch (_) { /* credencial dañada */ }
  if (!config) throw new AppError('La integración no está configurada o activa', 404, 'INTEGRATION_NOT_CONFIGURED');
  let checked;
  try { checked = await validate(provider, config); }
  catch (error) {
    await query('UPDATE workspace_integrations SET status=?,last_error_code=?,updated_at=? WHERE workspace_id=? AND provider=?', ['INVALID', clean(error.code || 'VALIDATION_FAILED', 64), Date.now(), workspaceId, provider]);
    throw error;
  }
  const now = Date.now();
  await query('UPDATE workspace_integrations SET status=?,display_label=?,metadata_json=?,last_validated_at=?,last_error_code=NULL,updated_at=? WHERE workspace_id=? AND provider=?', ['ACTIVE', checked.label, JSON.stringify(checked.metadata), now, now, workspaceId, provider]);
  return (await list(workspaceId)).find(item => item.provider === provider);
}

module.exports = { PROVIDERS, EMAIL_PROVIDERS, list, save, remove, getSecret, revalidate, validate, normalize };
