const crypto = require('crypto');

const baseUrl = process.env.SECURITY_AGENT_URL || 'http://127.0.0.1:8788';
const timeoutMs = Number(process.env.SECURITY_AGENT_TIMEOUT_MS || 5000);

async function callSecurityAgent(operation, params = {}) {
  const secret = process.env.SECURITY_AGENT_SECRET;
  if (!secret || secret.length < 32) throw new Error('SECURITY_AGENT_SECRET no configurado');
  const body = JSON.stringify({ operation, params });
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signature = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${body}`).digest('hex');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/v1/action`, {
      method: 'POST', signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-security-timestamp': timestamp,
        'x-security-nonce': nonce,
        'x-security-signature': signature,
      },
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      const error = new Error(data.error || `Agente HTTP ${response.status}`);
      error.code = data.code || 'SECURITY_AGENT_ERROR';
      throw error;
    }
    return data.result;
  } finally { clearTimeout(timer); }
}

module.exports = { callSecurityAgent };
