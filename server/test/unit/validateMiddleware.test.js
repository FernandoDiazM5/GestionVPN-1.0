const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { validate } = require('../../middleware/validate');
const { errorMiddleware } = require('../../lib/apiResponse');

function buildApp(schemas, handler = (req, res) => res.json({
  success: true,
  body: req.body,
  params: req.params,
  query: req.query,
})) {
  const app = express();
  app.use(express.json());
  app.post('/items/:id', validate(schemas), handler);
  app.use(errorMiddleware);
  return app;
}

describe('validate middleware', () => {
  it('reemplaza body, params y query por valores parseados', async () => {
    const app = buildApp({
      body: z.object({ name: z.string().trim().min(1) }).strict(),
      params: z.object({ id: z.coerce.number().int().positive() }).strict(),
      query: z.object({ limit: z.coerce.number().int().min(1).max(100) }).strict(),
    });

    const response = await request(app)
      .post('/items/7?limit=10')
      .send({ name: '  AP principal  ' });

    expect(response.status).toBe(200);
    expect(response.body.body).toEqual({ name: 'AP principal' });
    expect(response.body.params).toEqual({ id: 7 });
    expect(response.body.query).toEqual({ limit: 10 });
  });

  it('rechaza claves desconocidas sin devolver sus valores', async () => {
    const app = buildApp({
      body: z.object({ name: z.string().min(1) }).strict(),
    });

    const response = await request(app)
      .post('/items/ap-1')
      .send({ name: 'AP', password: 'secreto-que-no-debe-volver' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: 'Datos de entrada inválidos',
      code: 'VALIDATION_ERROR',
      fields: ['body.password'],
    });
    expect(JSON.stringify(response.body)).not.toContain('secreto-que-no-debe-volver');
  });

  it('acumula campos inválidos sin ejecutar el handler', async () => {
    const handler = vi.fn((_req, res) => res.json({ success: true }));
    const app = buildApp({
      body: z.object({ port: z.number().int().min(1).max(65535) }).strict(),
      params: z.object({ id: z.string().regex(/^[a-z0-9-]+$/) }).strict(),
    }, handler);

    const response = await request(app)
      .post('/items/INVALID!')
      .send({ port: 70000 });

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual(['body.port', 'params.id']);
    expect(handler).not.toHaveBeenCalled();
  });

  it('falla al registrar una fuente que no sea un esquema Zod', () => {
    expect(() => validate({ body: {} })).toThrow('validate.body debe ser un esquema Zod');
  });
});
