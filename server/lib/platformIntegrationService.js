const nodemailer = require('nodemailer');
const { cert, deleteApp, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { query, withTransaction } = require('../db/mysql');
const { encryptPass, decryptPass } = require('../db.service');
const { AppError } = require('./apiResponse');

const PROVIDERS = ['BREVO', 'GMAIL', 'TELEGRAM', 'GEMINI', 'FIREBASE'];
const EMAIL = new Set(['BREVO', 'GMAIL']);
const TIMEOUT = 10_000;
const clean = (v, max = 512) => String(v || '').trim().slice(0, max);
let runtimeFirebase = null;
const baseFirebaseEnv = Object.freeze({
  enabled: process.env.FEDERATED_AUTH_ENABLED,
  provider: process.env.FEDERATED_AUTH_PROVIDER,
  projectId: process.env.FIREBASE_PROJECT_ID,
  tenantId: process.env.FIREBASE_TENANT_ID,
});
function restoreEnv(name, value) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
function applyFirebaseRuntime(config) {
  if (!config) return;
  runtimeFirebase = config;
  process.env.FEDERATED_AUTH_ENABLED = 'true';
  process.env.FEDERATED_AUTH_PROVIDER = 'firebase';
  process.env.FIREBASE_PROJECT_ID = config.projectId;
  if (config.tenantId) process.env.FIREBASE_TENANT_ID = config.tenantId; else delete process.env.FIREBASE_TENANT_ID;
  try { require('./firebaseIdentityProvider').resetForTests(); } catch (_) { /* carga inicial */ }
}
function clearFirebaseRuntime() {
  runtimeFirebase = null;
  restoreEnv('FEDERATED_AUTH_ENABLED', baseFirebaseEnv.enabled);
  restoreEnv('FEDERATED_AUTH_PROVIDER', baseFirebaseEnv.provider);
  restoreEnv('FIREBASE_PROJECT_ID', baseFirebaseEnv.projectId);
  restoreEnv('FIREBASE_TENANT_ID', baseFirebaseEnv.tenantId);
  try { require('./firebaseIdentityProvider').resetForTests(); } catch (_) { /* carga inicial */ }
}
function provider(value) { const p = clean(value, 24).toUpperCase(); if (!PROVIDERS.includes(p)) throw new AppError('Integración no soportada', 404, 'INTEGRATION_NOT_SUPPORTED'); return p; }
function required(value, label, max = 10000) { const v = clean(value, max); if (!v || v === '********') throw new AppError(`${label} es obligatorio`, 422, 'INTEGRATION_FIELD_REQUIRED'); return v; }
function email(value, label) { const v = required(value, label, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new AppError(`${label} no es válido`, 422, 'INTEGRATION_FIELD_INVALID'); return v; }

function normalize(p, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('Configuración inválida', 422, 'INTEGRATION_CONFIG_INVALID');
  if (p === 'BREVO') return { host: 'smtp-relay.brevo.com', port: 2525, secure: false, username: required(body.username, 'Usuario SMTP'), password: required(body.password, 'Clave SMTP'), fromEmail: email(body.fromEmail, 'Correo remitente'), fromName: clean(body.fromName || 'Joinpoint NOC', 120) };
  if (p === 'GMAIL') return { host: 'smtp.gmail.com', port: 587, secure: false, username: email(body.email, 'Cuenta Gmail'), password: required(body.appPassword, 'Contraseña de aplicación', 128).replace(/\s+/g, ''), fromEmail: email(body.email, 'Cuenta Gmail'), fromName: clean(body.fromName || 'Joinpoint NOC', 120) };
  if (p === 'TELEGRAM') { const botToken = required(body.botToken, 'Bot Token', 256); if (!/^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(botToken)) throw new AppError('Bot Token inválido', 422, 'INTEGRATION_FIELD_INVALID'); return { botToken }; }
  if (p === 'GEMINI') { const apiKey = required(body.apiKey, 'API Key de Gemini', 256); if (apiKey.length < 20) throw new AppError('API Key de Gemini inválida', 422, 'INTEGRATION_FIELD_INVALID'); return { apiKey, model: clean(body.model || 'gemini-3.1-flash-lite', 80) }; }
  const projectId = required(body.projectId, 'Project ID', 128);
  const apiKey = required(body.apiKey, 'Web API Key', 256);
  const authDomain = required(body.authDomain, 'Auth Domain', 255);
  const appId = required(body.appId, 'App ID', 255);
  const tenantId = clean(body.tenantId, 128) || null;
  let serviceAccount;
  try { serviceAccount = JSON.parse(required(body.serviceAccountJson, 'Service Account JSON', 20000)); } catch (_) { throw new AppError('Service Account JSON no es válido', 422, 'INTEGRATION_FIELD_INVALID'); }
  if (serviceAccount.project_id !== projectId || !serviceAccount.client_email || !serviceAccount.private_key) throw new AppError('La credencial de servicio no corresponde al Project ID', 422, 'FIREBASE_PROJECT_MISMATCH');
  return { apiKey, authDomain, projectId, appId, tenantId, serviceAccount };
}

async function validate(p, config) {
  try {
    if (EMAIL.has(p)) { const tx = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: { user: config.username, pass: config.password }, connectionTimeout: TIMEOUT, greetingTimeout: TIMEOUT, socketTimeout: TIMEOUT }); await tx.verify(); tx.close(); return { label: config.fromEmail, metadata: { host: config.host, port: config.port, fromEmail: config.fromEmail, fromName: config.fromName } }; }
    if (p === 'TELEGRAM') { const response = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`, { signal: AbortSignal.timeout(TIMEOUT) }); const data = await response.json().catch(() => ({})); if (!response.ok || data.ok !== true) throw new Error('TOKEN_REJECTED'); return { label: `@${data.result.username}`, metadata: { username: data.result.username, botId: String(data.result.id) } }; }
    if (p === 'GEMINI') { const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(config.apiKey)}&pageSize=1`, { signal: AbortSignal.timeout(TIMEOUT) }); if (!response.ok) throw new Error('GEMINI_KEY_REJECTED'); return { label: config.model, metadata: { model: config.model } }; }
    const name = `gestionvpn-validate-${Date.now()}`;
    const app = initializeApp({ credential: cert(config.serviceAccount), projectId: config.projectId }, name);
    try { await getAuth(app).listUsers(1); } finally { await deleteApp(app).catch(() => {}); }
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(config.apiKey)}`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!response.ok) throw new Error('WEB_KEY_REJECTED');
    return { label: config.projectId, metadata: { projectId: config.projectId, authDomain: config.authDomain, appId: config.appId, tenantId: config.tenantId, apiKey: config.apiKey } };
  } catch (error) { throw new AppError('No se pudo validar la integración. Revisa las credenciales y permisos.', 422, error?.code || 'VALIDATION_FAILED'); }
}

function publicRow(row) { let metadata = {}; try { metadata = JSON.parse(row.metadata_json || '{}'); } catch (_) {} if (row.provider === 'FIREBASE') delete metadata.apiKey; return { provider: row.provider, configured: true, active: Boolean(row.active) && row.status === 'ACTIVE', status: row.status, label: row.display_label, metadata, lastValidatedAt: Number(row.last_validated_at), updatedAt: Number(row.updated_at) }; }
async function list() { const rows = await query('SELECT provider,status,active,display_label,metadata_json,last_validated_at,updated_at FROM platform_integrations ORDER BY provider'); const map = new Map(rows.map(r => [r.provider, publicRow(r)])); return PROVIDERS.map(p => map.get(p) || { provider: p, configured: false, active: false, status: 'NOT_CONFIGURED', label: null, metadata: {}, lastValidatedAt: null, updatedAt: null }); }
async function save({ userId, provider: raw, config: body }) { const p = provider(raw); const config = normalize(p, body); const checked = await validate(p, config); const now = Date.now(); await withTransaction(async tx => { if (EMAIL.has(p)) await tx.query("UPDATE platform_integrations SET active=0,updated_at=? WHERE provider IN ('BREVO','GMAIL')", [now]); await tx.query(`INSERT INTO platform_integrations (provider,config_enc,status,active,display_label,metadata_json,last_validated_at,last_error_code,configured_by,created_at,updated_at) VALUES (?,?,'ACTIVE',1,?,?,?,NULL,?,?,?) ON DUPLICATE KEY UPDATE config_enc=VALUES(config_enc),status='ACTIVE',active=1,display_label=VALUES(display_label),metadata_json=VALUES(metadata_json),last_validated_at=VALUES(last_validated_at),last_error_code=NULL,configured_by=VALUES(configured_by),updated_at=VALUES(updated_at)`, [p, encryptPass(JSON.stringify(config)), checked.label, JSON.stringify(checked.metadata), now, userId, now, now]); }); if (p === 'FIREBASE') applyFirebaseRuntime(config); return (await list()).find(x => x.provider === p); }
async function getSecret(raw) { const p = provider(raw); const rows = await query("SELECT config_enc FROM platform_integrations WHERE provider=? AND active=1 AND status='ACTIVE' LIMIT 1", [p]); try { const config = rows[0] ? JSON.parse(decryptPass(rows[0].config_enc)) : null; if (p === 'FIREBASE' && config) applyFirebaseRuntime(config); return config; } catch (_) { return null; } }
async function remove(raw) { const p = provider(raw); await query('DELETE FROM platform_integrations WHERE provider=?', [p]); if (p === 'FIREBASE') clearFirebaseRuntime(); }
async function revalidate(raw) { const p = provider(raw); const rows = await query('SELECT config_enc FROM platform_integrations WHERE provider=? LIMIT 1', [p]); let config; try { config = rows[0] ? JSON.parse(decryptPass(rows[0].config_enc)) : null; } catch (_) {} if (!config) throw new AppError('Integración no configurada', 404, 'INTEGRATION_NOT_CONFIGURED'); try { const checked = await validate(p, config); const now = Date.now(); await query("UPDATE platform_integrations SET status='ACTIVE',active=1,display_label=?,metadata_json=?,last_validated_at=?,last_error_code=NULL,updated_at=? WHERE provider=?", [checked.label, JSON.stringify(checked.metadata), now, now, p]); if (p === 'FIREBASE') applyFirebaseRuntime(config); return (await list()).find(x => x.provider === p); } catch (error) { await query("UPDATE platform_integrations SET status='INVALID',last_error_code=?,updated_at=? WHERE provider=?", [clean(error.code || 'VALIDATION_FAILED', 64), Date.now(), p]); throw error; } }
async function publicFirebaseConfig() { const rows = await query("SELECT metadata_json FROM platform_integrations WHERE provider='FIREBASE' AND active=1 AND status='ACTIVE' LIMIT 1"); try { return rows[0] ? JSON.parse(rows[0].metadata_json) : null; } catch (_) { return null; } }

module.exports = { PROVIDERS, list, save, remove, revalidate, getSecret, publicFirebaseConfig, normalize, validate, applyFirebaseRuntime, clearFirebaseRuntime, getRuntimeFirebase: () => runtimeFirebase };
