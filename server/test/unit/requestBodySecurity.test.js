const express = require('express');
const request = require('supertest');
const {
  requireJsonForMutation,
  strictJsonParser,
} = require('../../middleware/requestBodySecurity');
const { errorMiddleware } = require('../../lib/apiResponse');

function createApp() {
  const app = express();
  app.use(requireJsonForMutation);
  app.use(strictJsonParser);
  app.post('/echo', (req, res) => res.json({ success: true, body: req.body }));
  app.post('/empty', (_req, res) => res.json({ success: true }));
  app.use(errorMiddleware);
  return app;
}

describe('request body security', () => {
  const app = createApp();

  it('acepta objetos JSON y peticiones de mutación realmente vacías', async () => {
    await request(app).post('/echo').send({ value: 1 }).expect(200, {
      success: true, body: { value: 1 },
    });
    await request(app).post('/empty').expect(200, { success: true });
  });

  it('rechaza bodies de mutación con Content-Type incorrecto', async () => {
    const response = await request(app)
      .post('/echo')
      .set('Content-Type', 'text/plain')
      .send('{"value":1}')
      .expect(415);
    expect(response.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rechaza JSON inválido y valores JSON no estructurados', async () => {
    const malformed = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"value":')
      .expect(400);
    expect(malformed.body.code).toBe('INVALID_JSON');

    const scalar = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('"texto"')
      .expect(400);
    expect(scalar.body.code).toBe('INVALID_JSON');
  });

  it('corta payloads mayores de 100 KiB antes de llegar a la ruta', async () => {
    const response = await request(app)
      .post('/echo')
      .send({ value: 'x'.repeat(101 * 1024) })
      .expect(413);
    expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
