const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const mailer = require('../lib/mailer');
const { getAppSetting } = require('../db.service');
const logger = require('../lib/logger').child({ scope: 'frontend-error-reports' });

const REPORT_WINDOW_MS = 10 * 60_000;
const REPORT_LIMIT = 5;
const DEDUPE_MS = 10 * 60_000;

const reportSchema = z.strictObject({
  source: z.enum(['render', 'window-error', 'unhandled-rejection', 'async']),
  name: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(1_000),
  stack: z.string().max(4_000).optional(),
  componentStack: z.string().max(4_000).optional(),
  route: z.string().max(500),
  userAgent: z.string().max(500).optional(),
  occurredAt: z.number().int().positive(),
});

function redact(value = '') {
  return String(value)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED JWT]')
    .replace(/([?&](?:token|reset|otp|accept)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/\b(password|passwd|token|secret|otp|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function reportFingerprint(report) {
  return crypto.createHash('sha256')
    .update([report.source, report.name, report.message, report.route].join('|'))
    .digest('hex');
}

function createErrorReportsRouter(options = {}) {
  const router = express.Router();
  const sendGeneric = options.sendGeneric || mailer.sendGeneric;
  const log = options.logger || logger;
  const resolveErrorReportEmail = options.resolveErrorReportEmail || (async () => {
    if (options.errorReportEmail !== undefined) return options.errorReportEmail;
    const saved = String(await getAppSetting('error_report_email').catch(() => '') || '').trim();
    return saved || process.env.ERROR_REPORT_EMAIL || process.env.SMTP_USER;
  });
  const rateByIp = new Map();
  const recentFingerprints = new Map();

  router.post('/', async (req, res) => {
    const fetchSite = req.get('sec-fetch-site');
    if (fetchSite && !['same-origin', 'same-site'].includes(fetchSite)) {
      return res.status(403).json({ success: false, code: 'CROSS_SITE_REPORT' });
    }

    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ success: false, code: 'INVALID_ERROR_REPORT' });
    }

    const now = Date.now();
    if (rateByIp.size > 5_000) rateByIp.clear();
    if (recentFingerprints.size > 1_000) {
      for (const [key, timestamp] of recentFingerprints) {
        if (now - timestamp >= DEDUPE_MS) recentFingerprints.delete(key);
      }
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const activeHits = (rateByIp.get(ip) || []).filter(timestamp => now - timestamp < REPORT_WINDOW_MS);
    if (activeHits.length >= REPORT_LIMIT) {
      rateByIp.set(ip, activeHits);
      log.warn({ ip }, 'Reporte frontend suprimido por limite');
      return res.status(202).json({ success: true, accepted: true });
    }
    activeHits.push(now);
    rateByIp.set(ip, activeHits);

    const report = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [key, typeof value === 'string' ? redact(value) : value]),
    );
    const fingerprint = reportFingerprint(report);
    const lastSeen = recentFingerprints.get(fingerprint) || 0;
    if (now - lastSeen < DEDUPE_MS) {
      return res.status(202).json({ success: true, accepted: true });
    }
    recentFingerprints.set(fingerprint, now);

    const errorReportEmail = await resolveErrorReportEmail();
    if (!errorReportEmail) {
      log.warn({ fingerprint }, 'Reporte aceptado sin ERROR_REPORT_EMAIL configurado');
      return res.status(202).json({ success: true, accepted: true });
    }

    const occurredAt = new Date(report.occurredAt).toISOString();
    const text = [
      'Joinpoint NOC · Error de frontend detectado',
      `Origen: ${report.source}`,
      `Tipo: ${report.name}`,
      `Mensaje: ${report.message}`,
      `Ruta: ${report.route}`,
      `Fecha: ${occurredAt}`,
      `Navegador: ${report.userAgent || 'No disponible'}`,
      report.stack ? `Stack:\n${report.stack}` : '',
      report.componentStack ? `Component stack:\n${report.componentStack}` : '',
    ].filter(Boolean).join('\n\n');

    let delivery;
    try {
      delivery = await sendGeneric({
        to: errorReportEmail,
        subject: `[Joinpoint NOC] Error frontend: ${report.name}`,
        text,
        kind: 'error_report',
      });
    } catch (error) {
      log.warn({ err: error, fingerprint }, 'Fallo inesperado al enviar reporte frontend');
      return res.status(202).json({ success: true, accepted: true });
    }
    if (delivery.delivered) log.info({ fingerprint }, 'Reporte frontend enviado');
    else log.warn({ fingerprint, dev: delivery.dev, error: delivery.error }, 'Reporte frontend no entregado');

    return res.status(202).json({ success: true, accepted: true });
  });

  return router;
}

module.exports = createErrorReportsRouter();
module.exports.createErrorReportsRouter = createErrorReportsRouter;
module.exports.redact = redact;
