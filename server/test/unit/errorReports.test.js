const express = require('express');
const request = require('supertest');
const { createErrorReportsRouter, redact } = require('../../routes/errorReports.routes');

const baseReport = {
  source: 'render',
  name: 'TypeError',
  message: 'No se pudo leer token=secreto',
  stack: 'TypeError: fallo password=privada',
  componentStack: '<Panel />',
  route: '/nodes?reset=token-real',
  userAgent: 'Vitest',
  occurredAt: 1_700_000_000_000,
};

function appWith(sendGeneric) {
  const app = express();
  app.use(express.json());
  app.use('/api/error-reports', createErrorReportsRouter({
    sendGeneric,
    errorReportEmail: 'admin@example.com',
    logger: { info: vi.fn(), warn: vi.fn() },
  }));
  return app;
}

describe('errorReports.routes', () => {
  it('envia un reporte redactado solo al correo configurado', async () => {
    const sendGeneric = vi.fn().mockResolvedValue({ delivered: true });
    const response = await request(appWith(sendGeneric))
      .post('/api/error-reports')
      .set('sec-fetch-site', 'same-origin')
      .send(baseReport);

    expect(response.status).toBe(202);
    expect(sendGeneric).toHaveBeenCalledTimes(1);
    const mail = sendGeneric.mock.calls[0][0];
    expect(mail.to).toBe('admin@example.com');
    expect(mail.text).not.toContain('secreto');
    expect(mail.text).not.toContain('privada');
    expect(mail.text).not.toContain('token-real');
    expect(mail.text).toContain('[REDACTED]');
  });

  it('rechaza payloads no validos y solicitudes cross-site', async () => {
    const sendGeneric = vi.fn();
    const app = appWith(sendGeneric);
    expect((await request(app).post('/api/error-reports').send({ message: 'x' })).status).toBe(422);
    expect((await request(app).post('/api/error-reports').set('sec-fetch-site', 'cross-site').send(baseReport)).status).toBe(403);
    expect(sendGeneric).not.toHaveBeenCalled();
  });

  it('deduplica reportes iguales durante la ventana de proteccion', async () => {
    const sendGeneric = vi.fn().mockResolvedValue({ delivered: true });
    const app = appWith(sendGeneric);
    await request(app).post('/api/error-reports').send(baseReport);
    await request(app).post('/api/error-reports').send(baseReport);
    expect(sendGeneric).toHaveBeenCalledTimes(1);
  });

  it('redacta JWT y claves privadas', () => {
    const jwt = 'eyJabcdefghijk.abcdefghijklmnop.abcdefghijklmnop';
    const privateKey = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';
    expect(redact(`${jwt}\n${privateKey}`)).not.toContain('abc');
  });
});
