import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const query = vi.fn();
const txQuery = vi.fn();
const verify = vi.fn();
const close = vi.fn();
const encryptPass = vi.fn(value => `enc:${value}`);
const decryptPass = vi.fn(value => value.replace(/^enc:/, ''));

stubModule(__dirname, '../../db/mysql', {
  query,
  withTransaction: vi.fn(async callback => callback({ query: txQuery })),
});
stubModule(__dirname, '../../db.service', { encryptPass, decryptPass });
stubModule(__dirname, '../../../node_modules/nodemailer/lib/nodemailer.js', { createTransport: vi.fn(() => ({ verify, close })) });

const service = require('../../lib/workspaceIntegrationService');

beforeEach(() => {
  vi.clearAllMocks();
  verify.mockResolvedValue(true);
  query.mockResolvedValue([]);
  txQuery.mockResolvedValue({ affectedRows: 1 });
});

describe('workspaceIntegrationService', () => {
  it('lista estados sin devolver config_enc ni secretos', async () => {
    query.mockResolvedValue([{ provider: 'TELEGRAM', status: 'ACTIVE', active: 1, display_label: '@joinpoint', metadata_json: '{"username":"joinpoint"}', last_validated_at: 10, updated_at: 11 }]);
    const result = await service.list('ws-1');
    expect(result.find(item => item.provider === 'TELEGRAM')).toEqual(expect.objectContaining({ configured: true, label: '@joinpoint' }));
    expect(JSON.stringify(result)).not.toContain('config_enc');
    expect(JSON.stringify(result)).not.toContain('botToken');
  });

  it('cifra Brevo y desactiva Gmail dentro de la misma transacción', async () => {
    query.mockResolvedValue([]);
    await service.save({ workspaceId: 'ws-1', userId: 'u-1', provider: 'BREVO', config: { username: 'user@smtp-brevo.com', password: 'clave-segura', fromEmail: 'avisos@example.com', fromName: 'Avisos' } });
    expect(verify).toHaveBeenCalledOnce();
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining("provider IN ('BREVO','GMAIL')"), expect.any(Array));
    expect(encryptPass).toHaveBeenCalledWith(expect.stringContaining('clave-segura'));
    expect(txQuery).not.toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['clave-segura']));
  });

  it('rechaza máscaras y tokens Telegram con formato inválido antes de guardar', async () => {
    await expect(service.save({ workspaceId: 'ws-1', userId: 'u-1', provider: 'TELEGRAM', config: { botToken: '********' } })).rejects.toMatchObject({ code: 'INTEGRATION_FIELD_REQUIRED' });
    expect(txQuery).not.toHaveBeenCalled();
  });

  it('elimina por workspace y proveedor sin aceptar proveedores arbitrarios', async () => {
    await service.remove('ws-1', 'GEMINI');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM workspace_integrations'), ['ws-1', 'GEMINI']);
    await expect(service.remove('ws-1', 'DESCONOCIDO')).rejects.toMatchObject({ code: 'INTEGRATION_NOT_SUPPORTED' });
  });
});
