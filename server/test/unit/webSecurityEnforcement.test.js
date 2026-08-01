const { stubModule } = require('../helpers/moduleMock');

const observation = { observation: vi.fn() };
const repo = {
  touchAdminIp: vi.fn(), listActiveAdminIps: vi.fn(), purgeAdminIps: vi.fn(),
  claim: vi.fn(), complete: vi.fn(), countAppliedSince: vi.fn(), hasActiveTemporary: vi.fn(),
  countAppliedTemporarySince: vi.fn(), countAppliedRecommendationsSince: vi.fn(),
  hasActiveTemporaryIn: vi.fn(),
};
const agent = { callSecurityAgent: vi.fn() };
const notifier = { notifyAutomaticAction: vi.fn() };
const eventRepo = { markDecision: vi.fn() };
const platformSecurityRepo = { trustList: vi.fn() };
stubModule(__dirname, '../../lib/webSecurityObservation', observation);
stubModule(__dirname, '../../db/repos/webSecurityEnforcementRepo', repo);
stubModule(__dirname, '../../lib/securityAgentClient', agent);
stubModule(__dirname, '../../lib/webSecurityNotifier', notifier);
stubModule(__dirname, '../../db/repos/webSecurityEventRepo', eventRepo);
stubModule(__dirname, '../../db/repos/platformSecurityRepo', platformSecurityRepo);

const enforcement = require('../../lib/webSecurityEnforcement');
const originalMode = process.env.WEB_SECURITY_MODE;
const originalConfirm = process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM;
const originalIndefiniteConfirm = process.env.WEB_SECURITY_INDEFINITE_CONFIRM;
const originalRollout = process.env.WEB_SECURITY_ROLLOUT_PERCENT;

describe('aplicación temporal de protección web', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WEB_SECURITY_MODE;
    delete process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM;
    delete process.env.WEB_SECURITY_INDEFINITE_CONFIRM;
    delete process.env.WEB_SECURITY_ROLLOUT_PERCENT;
    observation.observation.mockResolvedValue({ truncated: false, sources: [] });
    repo.listActiveAdminIps.mockResolvedValue([]);
    repo.purgeAdminIps.mockResolvedValue(0);
    repo.claim.mockResolvedValue('action-1');
    repo.complete.mockResolvedValue(undefined);
    repo.countAppliedSince.mockResolvedValue(0);
    repo.hasActiveTemporary.mockResolvedValue(false);
    repo.hasActiveTemporaryIn.mockResolvedValue(false);
    repo.countAppliedTemporarySince.mockResolvedValue(0);
    repo.countAppliedRecommendationsSince.mockResolvedValue(0);
    agent.callSecurityAgent.mockResolvedValue({ ok: true });
    notifier.notifyAutomaticAction.mockResolvedValue({ recipients: 1, sent: 1 });
    eventRepo.markDecision.mockResolvedValue(3);
    platformSecurityRepo.trustList.mockResolvedValue([]);
  });

  afterAll(() => {
    if (originalMode === undefined) delete process.env.WEB_SECURITY_MODE;
    else process.env.WEB_SECURITY_MODE = originalMode;
    if (originalConfirm === undefined) delete process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM;
    else process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = originalConfirm;
    if (originalIndefiniteConfirm === undefined) delete process.env.WEB_SECURITY_INDEFINITE_CONFIRM;
    else process.env.WEB_SECURITY_INDEFINITE_CONFIRM = originalIndefiniteConfirm;
    if (originalRollout === undefined) delete process.env.WEB_SECURITY_ROLLOUT_PERCENT;
    else process.env.WEB_SECURITY_ROLLOUT_PERCENT = originalRollout;
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
    process.env.WEB_SECURITY_ROLLOUT_PERCENT = '100';
    observation.observation.mockResolvedValue({ truncated: false, sources: [
      { sourceIp: '198.51.100.7', recommendations: ['TEMP_1H_SENSITIVE_SCAN'] },
      { sourceIp: '203.0.113.44', recommendations: ['TEMP_1H_RATE_LIMIT'] },
    ] });
    repo.listActiveAdminIps.mockResolvedValue(['203.0.113.44']);
    const result = await enforcement.runOnce({ now: 20_000_000 });
    expect(result).toEqual(expect.objectContaining({ applied: 1, failed: 0 }));
    expect(agent.callSecurityAgent).toHaveBeenCalledWith('web_ban', {
      target: '198.51.100.7', jail: 'gestionvpn-web-1h', sourceJail: 'gestionvpn-web-1h',
      protectedIps: ['203.0.113.44'],
    });
    expect(repo.complete).toHaveBeenCalledWith(expect.objectContaining({
      id: 'action-1', status: 'APPLIED', expiresAt: 23_600_000,
    }));
    expect(notifier.notifyAutomaticAction).toHaveBeenCalledWith(expect.objectContaining({
      status: 'APPLIED', sourceIp: '198.51.100.7', jail: 'gestionvpn-web-1h',
    }));
    expect(eventRepo.markDecision).toHaveBeenCalledWith(expect.objectContaining({
      sourceIp: '198.51.100.7', eventType: 'SENSITIVE_ENDPOINT',
      decision: 'TEMPORARY_BAN_APPLIED', actionId: 'action-1',
    }));
  });

  it('excluye direcciones y redes confiables antes de reclamar una acción', async () => {
    process.env.WEB_SECURITY_MODE = 'enforce_temp';
    process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = enforcement.CONFIRMATION;
    process.env.WEB_SECURITY_ROLLOUT_PERCENT = '100';
    observation.observation.mockResolvedValue({ truncated: false, sources: [
      { sourceIp: '198.51.100.7', recommendations: ['TEMP_1H_RATE_LIMIT'] },
    ] });
    platformSecurityRepo.trustList.mockResolvedValue([{ target: '198.51.100.0/24' }]);
    await enforcement.runOnce({ now: 25_000_000 });
    expect(repo.claim).not.toHaveBeenCalled();
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });

  it('mantiene temporal un abuso grave si falta la tercera confirmación', async () => {
    process.env.WEB_SECURITY_MODE = 'enforce_temp';
    process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = enforcement.CONFIRMATION;
    process.env.WEB_SECURITY_ROLLOUT_PERCENT = '100';
    observation.observation.mockResolvedValue({ truncated: false, sources: [
      { sourceIp: '198.51.100.8', recommendations: ['INDEFINITE_AUTH_ABUSE'] },
    ] });
    await enforcement.runOnce({ now: 30_000_000 });
    expect(agent.callSecurityAgent).toHaveBeenCalledWith('web_ban', expect.objectContaining({
      target: '198.51.100.8', jail: 'gestionvpn-web-1h',
    }));
  });

  it('bloquea indefinidamente abuso distribuido o la tercera reincidencia en siete días', async () => {
    process.env.WEB_SECURITY_MODE = 'enforce_temp';
    process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = enforcement.CONFIRMATION;
    process.env.WEB_SECURITY_ROLLOUT_PERCENT = '100';
    process.env.WEB_SECURITY_INDEFINITE_CONFIRM = enforcement.INDEFINITE_CONFIRMATION;
    observation.observation.mockResolvedValue({ truncated: false, sources: [
      { sourceIp: '198.51.100.9', recommendations: ['INDEFINITE_AUTH_ABUSE'] },
      { sourceIp: '198.51.100.10', recommendations: ['TEMP_1H_RATE_LIMIT'] },
    ] });
    repo.countAppliedTemporarySince.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    repo.claim.mockResolvedValueOnce('direct').mockResolvedValueOnce('recidive');
    await enforcement.runOnce({ now: 40_000_000 });
    expect(agent.callSecurityAgent).toHaveBeenNthCalledWith(1, 'web_ban_indefinite', {
      target: '198.51.100.9', jail: 'gestionvpn-indefinite', sourceJail: 'gestionvpn-web-1h',
      protectedIps: [],
    });
    expect(agent.callSecurityAgent).toHaveBeenNthCalledWith(2, 'web_ban_indefinite', {
      target: '198.51.100.10', jail: 'gestionvpn-indefinite', sourceJail: 'gestionvpn-web-1h',
      protectedIps: [],
    });
    expect(repo.claim).toHaveBeenNthCalledWith(2, expect.objectContaining({
      recommendation: 'INDEFINITE_WEB_RECIDIVISM', jail: 'gestionvpn-indefinite',
    }));
    expect(repo.complete).toHaveBeenNthCalledWith(1, expect.objectContaining({ expiresAt: null }));
  });

  it('no actúa con una muestra truncada ni repite una clave ya reclamada', async () => {
    process.env.WEB_SECURITY_MODE = 'enforce_temp';
    process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = enforcement.CONFIRMATION;
    process.env.WEB_SECURITY_ROLLOUT_PERCENT = '100';
    observation.observation.mockResolvedValue({ truncated: true, sources: [
      { sourceIp: '198.51.100.7', recommendations: ['ROUTE_SCAN_DETECTED'] },
    ] });
    expect(await enforcement.runOnce()).toEqual(expect.objectContaining({
      skipped: true, reason: 'TRUNCATED_OBSERVATION',
    }));
    observation.observation.mockResolvedValue({ truncated: false, sources: [
      { sourceIp: '198.51.100.7', recommendations: ['ROUTE_SCAN_DETECTED'] },
    ] });
    repo.claim.mockResolvedValue(null);
    await enforcement.runOnce();
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });

  it('no cuenta otra reincidencia mientras el bloqueo temporal anterior sigue activo', async () => {
    process.env.WEB_SECURITY_MODE = 'enforce_temp';
    process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = enforcement.CONFIRMATION;
    process.env.WEB_SECURITY_ROLLOUT_PERCENT = '100';
    process.env.WEB_SECURITY_INDEFINITE_CONFIRM = enforcement.INDEFINITE_CONFIRMATION;
    observation.observation.mockResolvedValue({ truncated: false, sources: [
      { sourceIp: '198.51.100.13', recommendations: ['TEMP_1H_RATE_LIMIT'] },
    ] });
    repo.hasActiveTemporaryIn.mockResolvedValue(true);
    await enforcement.runOnce({ now: 50_000_000 });
    expect(repo.countAppliedTemporarySince).not.toHaveBeenCalled();
    expect(repo.claim).not.toHaveBeenCalled();
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });

  it('escala episodios de escaneo de seis horas a veinticuatro e indefinido', async () => {
    process.env.WEB_SECURITY_MODE = 'enforce_temp';
    process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = enforcement.CONFIRMATION;
    process.env.WEB_SECURITY_ROLLOUT_PERCENT = '100';
    process.env.WEB_SECURITY_INDEFINITE_CONFIRM = enforcement.INDEFINITE_CONFIRMATION;
    observation.observation.mockResolvedValue({ truncated: false, sources: [
      { sourceIp: '198.51.100.14', recommendations: ['ROUTE_SCAN_DETECTED'] },
    ] });

    repo.countAppliedRecommendationsSince.mockResolvedValueOnce(0);
    await enforcement.runOnce({ now: 60_000_000 });
    expect(agent.callSecurityAgent).toHaveBeenLastCalledWith('web_ban', expect.objectContaining({
      jail: 'gestionvpn-web-scan-6h', sourceJail: 'gestionvpn-web-scan-6h',
    }));
    expect(repo.complete).toHaveBeenLastCalledWith(expect.objectContaining({ expiresAt: 81_600_000 }));

    repo.claim.mockResolvedValue('action-2');
    repo.countAppliedRecommendationsSince.mockResolvedValueOnce(1);
    await enforcement.runOnce({ now: 90_000_000 });
    expect(agent.callSecurityAgent).toHaveBeenLastCalledWith('web_ban', expect.objectContaining({
      jail: 'gestionvpn-web-scan-24h', sourceJail: 'gestionvpn-web-scan-24h',
    }));

    repo.claim.mockResolvedValue('action-3');
    repo.countAppliedRecommendationsSince.mockResolvedValueOnce(2);
    await enforcement.runOnce({ now: 180_000_000 });
    expect(agent.callSecurityAgent).toHaveBeenLastCalledWith('web_ban_indefinite', expect.objectContaining({
      jail: 'gestionvpn-indefinite', sourceJail: 'gestionvpn-web-scan-24h',
    }));
  });

  it('queda armado pero no ejecuta con rollout cero o inválido', async () => {
    process.env.WEB_SECURITY_MODE = 'enforce_temp';
    process.env.WEB_SECURITY_ENFORCEMENT_CONFIRM = enforcement.CONFIRMATION;
    process.env.WEB_SECURITY_ROLLOUT_PERCENT = '101';
    expect(await enforcement.runOnce()).toEqual(expect.objectContaining({
      armed: true, active: false, rolloutPercent: 0, status: 'ARMED_NO_ROLLOUT',
    }));
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });

  it('asigna a cada IP una cohorte estable entre 1 y 100', () => {
    const first = enforcement.rolloutBucket('198.51.100.99');
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(100);
    expect(enforcement.rolloutBucket('198.51.100.99')).toBe(first);
  });
});
