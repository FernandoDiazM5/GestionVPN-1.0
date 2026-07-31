const crypto = require('crypto');

describe('securityAgentClient', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SECURITY_AGENT_SECRET = 's'.repeat(32);
    process.env.SECURITY_AGENT_URL = 'http://127.0.0.1:8788';
    global.fetch = vi.fn();
  });

  it('firma exactamente timestamp, nonce y cuerpo', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { jails: [] } }) });
    const { callSecurityAgent } = require('../../lib/securityAgentClient');
    await expect(callSecurityAgent('status')).resolves.toEqual({ jails: [] });
    const [, options] = global.fetch.mock.calls[0];
    const expected = crypto.createHmac('sha256', process.env.SECURITY_AGENT_SECRET)
      .update(`${options.headers['x-security-timestamp']}.${options.headers['x-security-nonce']}.${options.body}`)
      .digest('hex');
    expect(options.headers['x-security-signature']).toBe(expected);
  });

  it('no llama al agente sin un secreto robusto', async () => {
    process.env.SECURITY_AGENT_SECRET = 'corto';
    const { callSecurityAgent } = require('../../lib/securityAgentClient');
    await expect(callSecurityAgent('status')).rejects.toThrow('SECURITY_AGENT_SECRET');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
