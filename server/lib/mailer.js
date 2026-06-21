// ============================================================
//  Envío de correos / OTP (Fase 2)
//  - Si hay SMTP_* configurado → envía vía nodemailer.
//  - Si NO → modo DEV: imprime el OTP en consola (no requiere SMTP).
// ============================================================
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) { /* opcional */ }
const log = require('./logger').child({ scope: 'mailer' });
const metrics = require('./metrics');

// Wrapper de tx.sendMail que cuenta la métrica mail_sent_total{kind,status}.
// 'dev' = sin SMTP, 'ok' = enviado, 'error' = falló (excepción se re-lanza).
async function sendAndCount(tx, kind, payload) {
    try {
        await tx.sendMail(payload);
        metrics.mailSentTotal.inc({ kind, status: 'ok' });
    } catch (err) {
        metrics.mailSentTotal.inc({ kind, status: 'error' });
        throw err;
    }
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!nodemailer || !process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    // Timeouts agresivos para no colgar el endpoint si el SMTP no responde
    connectionTimeout: 10000, // 10s para abrir conexión
    greetingTimeout: 10000,   // 10s para el saludo del servidor
    socketTimeout: 15000,     // 15s para enviar el mensaje
  });
  return transporter;
}

const FROM_DEFAULT = 'MikroTik VPN <no-reply@vpn.local>';

/**
 * Envía un código OTP al email. Devuelve { delivered, dev }.
 * En dev (sin SMTP) imprime el código en consola y lo marca como dev.
 */
async function sendOtp(email, code, purpose = 'verificación') {
  const tx = getTransporter();
  if (!tx) {
    // En modo DEV el OTP NO se considera secreto (no hay correo saliente);
    // se muestra al operador para facilitar pruebas locales.
    log.info({ email, purpose, code }, 'OTP (modo DEV — sin SMTP configurado)');
    metrics.mailSentTotal.inc({ kind: 'otp', status: 'dev' });
    return { delivered: false, dev: true };
  }
  await sendAndCount(tx, 'otp', {
    from: process.env.SMTP_FROM || FROM_DEFAULT,
    to: email,
    subject: `Tu código de ${purpose}: ${code}`,
    text: `Tu código de ${purpose} es: ${code}\nExpira en 10 minutos.`,
    html: `<p>Tu código de <b>${purpose}</b> es:</p><h2 style="letter-spacing:4px">${code}</h2><p>Expira en 10 minutos.</p>`,
  });
  return { delivered: true, dev: false };
}

/**
 * Envía una invitación al workspace con link de registro + OTP.
 * Plantilla HTML responsive, branding y CTA prominente.
 *
 * @param {object} opts
 * @param {string} opts.email      Destinatario
 * @param {string} opts.code       OTP de 6 dígitos
 * @param {string} opts.inviterName Nombre o email de quien invita
 * @param {string} opts.workspaceName Nombre del workspace al que se le invita
 * @param {string} [opts.tunnelId] Túnel pre-asignado (opcional)
 * @param {string} [opts.role]     'OWNER' (moderador) | 'MEMBER'
 */
async function sendInvitation({ email, code, inviterName, workspaceName, tunnelId, role }) {
  const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173/GestionVPN-1.0/').replace(/\/+$/, '/');
  const acceptUrl = `${baseUrl}?accept=1&email=${encodeURIComponent(email)}&otp=${encodeURIComponent(code)}`;
  const roleLabel = role === 'OWNER' ? 'Moderador' : 'Miembro';

  const tx = getTransporter();
  if (!tx) {
    log.info({
      email, inviterName, workspaceName, roleLabel, tunnelId, code, acceptUrl,
    }, 'Invitación generada (modo DEV — sin SMTP)');
    metrics.mailSentTotal.inc({ kind: 'invitation', status: 'dev' });
    return { delivered: false, dev: true };
  }

  const subject = `${inviterName} te invitó a ${workspaceName} — MikroTik VPN`;

  const text =
    `Hola,\n\n` +
    `${inviterName} te invitó a unirte al workspace "${workspaceName}" como ${roleLabel}.\n` +
    (tunnelId ? `Se te asignará el túnel: ${tunnelId}\n` : '') +
    `\nTu código de invitación es: ${code}\n\n` +
    `Para registrarte y configurar tu acceso, abre este enlace (válido por 24 horas):\n${acceptUrl}\n\n` +
    `Si no esperabas este correo, simplemente ignóralo.\n` +
    `— MikroTik VPN Manager`;

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);padding:32px 32px 28px;color:#fff;">
          <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;margin-bottom:8px;">MikroTik VPN Manager</div>
          <div style="font-size:24px;font-weight:700;line-height:1.3;">Te invitaron a un workspace</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hola,</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
            <strong>${escapeHtml(inviterName)}</strong> te invitó a unirte al workspace
            <strong>"${escapeHtml(workspaceName)}"</strong> como <strong>${roleLabel}</strong>.
            ${tunnelId ? `<br>Te asignarán el túnel <code style="background:#eef2ff;color:#4338ca;padding:2px 6px;border-radius:6px;font-family:'JetBrains Mono',Consolas,monospace;font-size:13px;">${escapeHtml(tunnelId)}</code>.` : ''}
          </p>

          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:24px 0;text-align:center;">
            <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Tu código de invitación</div>
            <div style="font-family:'JetBrains Mono',Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#4f46e5;">${code}</div>
          </div>

          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
            Haz clic en el botón para crear tu cuenta y configurar tu acceso WireGuard:
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td>
            <a href="${acceptUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px;">
              Aceptar invitación
            </a>
          </td></tr></table>

          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
            O copia este enlace en tu navegador:<br>
            <a href="${acceptUrl}" style="color:#4f46e5;word-break:break-all;">${acceptUrl}</a>
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 20px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
            Este enlace expira en 24 horas. Si no esperabas este correo, puedes ignorarlo con seguridad.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
          MikroTik VPN Manager · Gestión de túneles SSTP/WireGuard
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await sendAndCount(tx, 'invitation', {
    from: process.env.SMTP_FROM || FROM_DEFAULT,
    to: email,
    subject,
    text,
    html,
  });
  return { delivered: true, dev: false, acceptUrl };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Envía email para recuperar contraseña con link al frontend.
 * El link incluye el token en query param: ?reset=<token>
 * El token vive 15 min y es single-use.
 *
 * @param {object} opts
 * @param {string} opts.email
 * @param {string} opts.token       token en claro (NO el hash)
 * @param {string} [opts.name]      nombre del usuario para personalizar
 */
async function sendPasswordReset({ email, token, name }) {
  const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173/GestionVPN-1.0/').replace(/\/+$/, '/');
  const resetUrl = `${baseUrl}?reset=${encodeURIComponent(token)}`;

  const tx = getTransporter();
  if (!tx) {
    // El token NO se expone como campo separado (redactado por logger). El
    // operador lo lee del query param `?reset=<token>` dentro de resetUrl.
    log.info({ email, resetUrl, ttlMin: 15 }, 'Token de reset generado (modo DEV — sin SMTP)');
    metrics.mailSentTotal.inc({ kind: 'password_reset', status: 'dev' });
    return { delivered: false, dev: true };
  }

  const subject = 'Restablece tu contraseña — MikroTik VPN Manager';
  const greeting = name ? `Hola ${name}` : 'Hola';

  const text =
    `${greeting},\n\n` +
    `Recibimos una solicitud para restablecer tu contraseña.\n` +
    `Abre el siguiente enlace en tu navegador (válido por 15 minutos):\n\n` +
    `${resetUrl}\n\n` +
    `Si no solicitaste este cambio, puedes ignorar este correo — tu contraseña actual sigue siendo válida.\n` +
    `— MikroTik VPN Manager`;

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);padding:32px 32px 28px;color:#fff;">
          <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;margin-bottom:8px;">MikroTik VPN Manager</div>
          <div style="font-size:24px;font-weight:700;line-height:1.3;">Restablecer contraseña</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(greeting)},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
            Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para elegir una nueva.
            El enlace es válido por <strong>15 minutos</strong> y solo puede usarse una vez.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td>
            <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px;">
              Restablecer contraseña
            </a>
          </td></tr></table>
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
            O copia este enlace en tu navegador:<br>
            <a href="${resetUrl}" style="color:#4f46e5;word-break:break-all;">${resetUrl}</a>
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 20px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
            ⚠️ Si no solicitaste este cambio, ignora este correo. Tu contraseña actual seguirá siendo válida.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
          MikroTik VPN Manager · Gestión de túneles SSTP/WireGuard
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await sendAndCount(tx, 'password_reset', {
    from: process.env.SMTP_FROM || FROM_DEFAULT,
    to: email,
    subject,
    text,
    html,
  });
  return { delivered: true, dev: false, resetUrl };
}

// ── verifySmtp — usado por /api/health (FASE 9) ──────────────────────────────
//  Llama a transporter.verify() con timeout corto y cachea el resultado por
//  VERIFY_TTL_MS (45s por defecto). Sin cache, cada hit a /api/health
//  abriría una conexión SMTP — y monitoring lo golpea cada pocos segundos.
//
//  Devuelve { status: 'ok' | 'error' | 'skipped', configured, latency_ms?, error? }
//    skipped → no hay SMTP_HOST en env (modo DEV).
const VERIFY_TTL_MS = Number(process.env.SMTP_VERIFY_TTL_MS || 45_000);
const VERIFY_TIMEOUT_MS = Number(process.env.SMTP_VERIFY_TIMEOUT_MS || 4_000);
let _verifyCache = null; // { result, expiresAt }

async function verifySmtp() {
  const now = Date.now();
  if (_verifyCache && _verifyCache.expiresAt > now) return _verifyCache.result;

  const tx = getTransporter();
  if (!tx) {
    const result = { status: 'skipped', configured: false };
    _verifyCache = { result, expiresAt: now + VERIFY_TTL_MS };
    return result;
  }

  const start = process.hrtime.bigint();
  let result;
  try {
    await Promise.race([
      tx.verify(),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('verify timeout')), VERIFY_TIMEOUT_MS,
      )),
    ]);
    const latency_ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    result = { status: 'ok', configured: true, latency_ms };
  } catch (err) {
    const latency_ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    result = { status: 'error', configured: true, latency_ms, error: err?.message || 'unknown' };
  }
  _verifyCache = { result, expiresAt: now + VERIFY_TTL_MS };
  return result;
}

/**
 * Envío genérico para notificaciones (Q1). Devuelve { delivered, dev, error }.
 * En dev (sin SMTP) imprime resumen y marca dev=true sin throwear — el caller
 * (lib/notifier.js) registra el resultado en notification_log.
 */
async function sendGeneric({ to, subject, html, text }) {
  if (!to || !subject) return { delivered: false, error: 'to y subject requeridos' };
  const tx = getTransporter();
  if (!tx) {
    log.debug({ to, subject }, 'sendGeneric en modo DEV (sin SMTP)');
    return { delivered: false, dev: true };
  }
  try {
    await sendAndCount(tx, 'notification', {
      from: process.env.SMTP_FROM || FROM_DEFAULT,
      to, subject, html, text: text || subject,
    });
    return { delivered: true };
  } catch (err) {
    log.warn({ err: err.message, to }, 'sendGeneric falló');
    return { delivered: false, error: err.message };
  }
}

module.exports = { sendOtp, sendInvitation, sendPasswordReset, sendGeneric, verifySmtp };
