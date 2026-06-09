// ============================================================
//  Mock del mailer: captura envíos en memoria.
//
//  Uso:
//
//    import { vi } from 'vitest';
//    vi.mock('../lib/mailer', () => require('./mocks/mailer'));
//    // ... ejercer endpoint que envía email ...
//    expect(__mailer.sent).toHaveLength(1);
//    expect(__mailer.sent[0].purpose).toBe('invitación');
// ============================================================
const sent = [];

async function sendOtp(email, code, purpose) {
  sent.push({ kind: 'otp', email, code, purpose });
  return { delivered: true, dev: false };
}

async function sendInvitation({ email, code, inviterName, workspaceName, tunnelId, role }) {
  sent.push({ kind: 'invitation', email, code, inviterName, workspaceName, tunnelId, role });
  return { delivered: true, dev: false };
}

async function sendPasswordReset({ email, token, name }) {
  sent.push({ kind: 'password-reset', email, token, name });
  return { delivered: true, dev: false };
}

function reset() { sent.length = 0; }

module.exports = {
  sendOtp,
  sendInvitation,
  sendPasswordReset,
  __mailer: { sent, reset },
};
