#!/usr/bin/env node
const fs = require('fs');
const { query } = require('../db/mysql');
const service = require('../lib/platformIntegrationService');

function fromAddress(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^\s*([^<]*)<([^>]+)>\s*$/);
  return { email: (match?.[2] || raw).trim(), name: (match?.[1] || 'Joinpoint NOC').trim().replace(/^['"]|['"]$/g, '') || 'Joinpoint NOC' };
}

async function candidates() {
  const result = [];
  const sender = fromAddress(process.env.SMTP_FROM);
  if (/brevo/i.test(process.env.SMTP_HOST || '') && process.env.SMTP_USER && process.env.SMTP_PASS && sender.email) result.push(['BREVO', { username: process.env.SMTP_USER, password: process.env.SMTP_PASS, fromEmail: sender.email, fromName: sender.name }]);
  else if (/gmail/i.test(process.env.SMTP_HOST || '') && process.env.SMTP_USER && process.env.SMTP_PASS) result.push(['GMAIL', { email: process.env.SMTP_USER, appPassword: process.env.SMTP_PASS, fromName: sender.name }]);
  if (process.env.TELEGRAM_BOT_TOKEN) result.push(['TELEGRAM', { botToken: process.env.TELEGRAM_BOT_TOKEN }]);
  if (process.env.GEMINI_API_KEY) result.push(['GEMINI', { apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite' }]);
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (process.env.VITE_FIREBASE_API_KEY && process.env.VITE_FIREBASE_AUTH_DOMAIN && process.env.VITE_FIREBASE_PROJECT_ID && process.env.VITE_FIREBASE_APP_ID && credentialPath) {
    result.push(['FIREBASE', { projectId: process.env.VITE_FIREBASE_PROJECT_ID, apiKey: process.env.VITE_FIREBASE_API_KEY, authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN, appId: process.env.VITE_FIREBASE_APP_ID, tenantId: process.env.VITE_FIREBASE_TENANT_ID || '', serviceAccountJson: fs.readFileSync(credentialPath, 'utf8') }]);
  }
  return result;
}

async function main() {
  const admins = await query('SELECT id FROM users WHERE is_platform_admin=1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1');
  if (!admins[0]) throw new Error('No existe un administrador de plataforma activo');
  const existing = new Set((await service.list()).filter(item => item.configured).map(item => item.provider));
  const found = await candidates();
  const imported = [];
  const skipped = [];
  for (const [provider, config] of found) {
    if (existing.has(provider)) { skipped.push(provider); continue; }
    await service.save({ userId: admins[0].id, provider, config });
    imported.push(provider);
  }
  console.log(JSON.stringify({ detected: found.map(([provider]) => provider), imported, skipped }));
}

main().then(() => process.exit(0)).catch(error => { console.error(JSON.stringify({ error: error.code || error.message || 'IMPORT_FAILED' })); process.exit(1); });
