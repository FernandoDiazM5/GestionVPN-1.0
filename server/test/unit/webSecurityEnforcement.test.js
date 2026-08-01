const { stubModule } = require('../helpers/moduleMock');

const observation = { observation: vi.fn() };
const repo = {
  touchAdminIp: vi.fn(), listActiveAdminIps: vi.fn(), purgeAdminIps: vi.fn(),
  claim: vi.fn(), complete: vi.fn(),
};
const agent = { callSecurityAgent: vi.fn() };
stubModule(__dirname, '../../lib/webSecurityObservation', observation);
stubModule(__dirname, '../../db/repos/webSecurityEnforcementRepo', repo);
stubModule(__dirname, '../../lib/securityAgentClient', agent);

const enforcement = require('../../lib/webSecurityEnforcement');
const originalMode = process.env.WEB_SECURITY_MODE;
const originalConfirm = process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM;

describe('aplicación temporal de protección web', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WEB_SECURITY_MODE;
    delete process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM;
    observation.observation.mockResolvedValue({ truncated: false, sources: [] });
    repo.listActiveAdminIps.mockResolvedValue([]);
    repo.purgeAdminIps.mockResolvedValue(0);
    repo.claim.mockResolvedValue('action-1');
    repo.complete.mockResolvedValue(undefined);
    agent.callSecurityAgent.mockResolvedValue({ ok: true });
  });

  afterAll(() => {
    if (originalMode === undefined) delete process.env.WEB_SECURITY_MODE;
    else process.env.WEB_SECURITY_MODE = originalMode;
    if (originalConfirm === undefined) delete process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM;
    else process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = originalConfirm;
  });

  it('permanece pasivo por defecto y también con una sola confirmación', async () => {
    expect((await enforcement.runOnce()).status).toBe('OBSERVE_ONLY');
    process.env.WEB_SECURITY_MODE = 'enforce_temp';
    expect((await enforcement.runOnce()).active).toBe(false);
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });

  it('aplica una hora sólo con la doble confirmación y protege administradores activos', async () => {
    process.env.WEB_SECURITY_MODE = 'enforce_temp';
    process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = enforcement.CONFIRMATION;
    observation.observation.mockResolvedValue({ truncated: false, sources: [
      { sourceIp: '198.51.100.7', recommendations: ['TEMP_1H_SENSITIVE_SCAN'] },
      { sourceIp: '203.0.113.44', recommendations: ['TEMP_1H_RATE_LIMIT'] },
    ] });
    repo.listActiveAdminIps.mockResolvedValue(['203.0.113.44']);
    const result = await enforcement.runOnce({ now: 20_000_000 });
    expect(result).toEqual(expect.objectContaining({ applied: 1, failed: 0 }));
    expect(agent.callSecurityAgent).toHaveBeenCalledWith('web_ban', {
      target: '198.51.100.7', jail: 'gestionvpn-web-1h', protectedIps: ['203.0.113.44'],
    });
    expect(repo.complete).toHaveBeenCalledWith(expect.objectContaining({
      id: 'action-1', status: 'APPLIED', expiresAt: 23_600_000,
    }));
  });

  it('no actúa con una muestra truncada ni repite una clave ya reclamada', async () => {
    process.env.WEB_SECURITY_MODE = 'enforce_temp';
    process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = enforcement.CONFIRMATION;
    observation.observation.mockResolvedValue({ truncated: true, sources: [
      { sourceIp: '198.51.100.7', recommendations: ['TEMP_1H_ROUTE_SCAN'] },
    ] });
    expect(await enforcement.runOnce()).toEqual(expect.objectContaining({
      skipped: true, reason: 'TRUNCATED_OBSERVATION',
    }));
    observation.observation.mockResolvedValue({ truncated: false, sources: [
      { sourceIp: '198.51.100.7', recommendations: ['TEMP_1H_ROUTE_SCAN'] },
    ] });
    repo.claim.mockResolvedValue(null);
    await enforcement.runOnce();
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });
});
