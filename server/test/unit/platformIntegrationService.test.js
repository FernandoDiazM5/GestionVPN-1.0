import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const query = vi.fn();
const txQuery = vi.fn();
const verify = vi.fn();
const encryptPass = vi.fn(value => `enc:${value}`);
const decryptPass = vi.fn(value => value.replace(/^enc:/, ''));

stubModule(__dirname, '../../db/mysql', {
  query,
  withTransaction: vi.fn(async callback => callback({ query: txQuery })),
});
stubModule(__dirname, '../../db.service', { encryptPass, decryptPass });
stubModule(__dirname, '../../../node_modules/nodemailer/lib/nodemailer.js', {
  createTransport: vi.fn(() => ({ verify, close: vi.fn() })),
});

const service = require('../../lib/platformIntegrationService');

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue([]);
  txQuery.mockResolvedValue({ affectedRows: 1 });
  verify.mockResolvedValue(true);
});

describe('platformIntegrationService', () => {
  it('lista Firebase sin exponer la Web API Key ni la credencial de servicio', async () => {
    query.mockResolvedValue([{ provider: 'FIREBASE', status: 'ACTIVE', active: 1, display_label: 'joinpoint-prod', metadata_json: '{"projectId":"joinpoint-prod","apiKey":"AIza-secret"}', last_validated_at: 10, updated_at: 11 }]);
    const result = await service.list();
    expect(result.find(item => item.provider === 'FIREBASE')).toEqual(expect.objectContaining({ configured: true, label: 'joinpoint-prod' }));
    expect(JSON.stringify(result)).not.toContain('AIza-secret');
    expect(JSON.stringify(result)).not.toContain('serviceAccount');
  });

  it('cifra Brevo y desactiva el proveedor de correo alternativo', async () => {
    await service.save({ userId: 'admin-1', provider: 'BREVO', config: { username: 'smtp-user', password: 'smtp-secret', fromEmail: 'admin@example.com', fromName: 'Joinpoint' } });
    expect(verify).toHaveBeenCalledOnce();
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining("provider IN ('BREVO','GMAIL')"), expect.any(Array));
    expect(encryptPass).toHaveBeenCalledWith(expect.stringContaining('smtp-secret'));
    expect(txQuery).not.toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['smtp-secret']));
  });

  it('rechaza una cuenta de servicio Firebase de otro proyecto', () => {
    expect(() => service.normalize('FIREBASE', {
      projectId: 'joinpoint-prod', apiKey: 'AIza-key', authDomain: 'joinpoint-prod.firebaseapp.com', appId: '1:123:web:abc',
      serviceAccountJson: JSON.stringify({ project_id: 'otro-proyecto', client_email: 'firebase@example.com', private_key: 'private' }),
    })).toThrowError(expect.objectContaining({ code: 'FIREBASE_PROJECT_MISMATCH' }));
  });

  it('normaliza Gemini como integración global sin exponer la API key', () => {
    expect(service.normalize('GEMINI', { apiKey: 'AIza-valid-key-for-testing-12345', model: 'gemini-3.1-flash-lite' })).toEqual({ apiKey: 'AIza-valid-key-for-testing-12345', model: 'gemini-3.1-flash-lite' });
  });
});
