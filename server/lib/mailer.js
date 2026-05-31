// ============================================================
//  Envío de correos / OTP (Fase 2)
//  - Si hay SMTP_* configurado → envía vía nodemailer.
//  - Si NO → modo DEV: imprime el OTP en consola (no requiere SMTP).
// ============================================================
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) { /* opcional */ }

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
  });
  return transporter;
}

/**
 * Envía un código OTP al email. Devuelve { delivered, dev }.
 * En dev (sin SMTP) imprime el código en consola y lo marca como dev.
 */
async function sendOtp(email, code, purpose = 'verificación') {
  const tx = getTransporter();
  if (!tx) {
    console.log(`\n[mailer:DEV] OTP para ${email} (${purpose}): ${code}\n`);
    return { delivered: false, dev: true };
  }
  await tx.sendMail({
    from: process.env.SMTP_FROM || 'MikroTik VPN <no-reply@vpn.local>',
    to: email,
    subject: `Tu código de ${purpose}: ${code}`,
    text: `Tu código de ${purpose} es: ${code}\nExpira en 10 minutos.`,
    html: `<p>Tu código de <b>${purpose}</b> es:</p><h2 style="letter-spacing:4px">${code}</h2><p>Expira en 10 minutos.</p>`,
  });
  return { delivered: true, dev: false };
}

module.exports = { sendOtp };
