const crypto = require('crypto');

describe('securityAgentClient', () => {
  beforeEach(() => {
    vi.resetModules();
    delete require.cache[require.resolve('../../lib/securityAgentClient')];
    process.env.SECURITY_AGENT_SECRET = 's'.repeat(32);
    process.env.SECURITY_AGENT_URL = 'http://127.0.0.1:8788';
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.SECURITY_AGENT_TIMEOUT_MS;
    delete process.env.SECURITY_AGENT_STATUS_CACHE_MS;
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

  it('comparte la consulta de estado simultánea y reutiliza el resultado breve', async () => {
    let resolveFetch;
    global.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const { getSecurityAgentStatus } = require('../../lib/securityAgentClient');
    const first = getSecurityAgentStatus();
    const second = getSecurityAgentStatus();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveFetch({ ok: true, json: async () => ({ ok: true, result: { jails: [{ name: 'sshd' }] } }) });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { jails: [{ name: 'sshd' }] }, { jails: [{ name: 'sshd' }] },
    ]);
    await getSecurityAgentStatus();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('invalida el estado después de una mutación', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { version: 1 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { version: 2 } }) });
    const { getSecurityAgentStatus, invalidateSecurityAgentStatus } = require('../../lib/securityAgentClient');
    await expect(getSecurityAgentStatus()).resolves.toEqual({ version: 1 });
    invalidateSecurityAgentStatus();
    await expect(getSecurityAgentStatus()).resolves.toEqual({ version: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('no vuelve a guardar una respuesta iniciada antes de invalidar', async () => {
    let resolveFirst;
    global.fetch
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { version: 2 } }) });
    const { getSecurityAgentStatus, invalidateSecurityAgentStatus } = require('../../lib/securityAgentClient');
    const stale = getSecurityAgentStatus();
    invalidateSecurityAgentStatus();
    const fresh = getSecurityAgentStatus();
    resolveFirst({ ok: true, json: async () => ({ ok: true, result: { version: 1 } }) });
    await expect(stale).resolves.toEqual({ version: 1 });
    await expect(fresh).resolves.toEqual({ version: 2 });
    await expect(getSecurityAgentStatus()).resolves.toEqual({ version: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('traduce el aborto por timeout a un error controlado', async () => {
    vi.useFakeTimers();
    process.env.SECURITY_AGENT_TIMEOUT_MS = '5';
    global.fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    const { callSecurityAgent } = require('../../lib/securityAgentClient');
    const expectation = expect(callSecurityAgent('status')).rejects.toMatchObject({
      code: 'SECURITY_AGENT_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(6);
    await expectation;
  });
});
