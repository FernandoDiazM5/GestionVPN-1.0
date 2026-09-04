const express = require('express');
const request = require('supertest');
const router = require('../../routes/team.routes');
const repo = require('../../db/repos/memberWgRepo');
const { errorMiddleware } = require('../../lib/apiResponse');

const publicKey = 'AAAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAAAAAAAAAA+A=';
const route = router.stack.find(layer => layer.route?.path === '/wireguard/by-key').route;

function appForLookup() {
  const app = express();
  // La sesión del OWNER se fija aquí; se ejecutan validación y handler reales.
  app.use((req, _res, next) => { req.account = { workspace_id: 'workspace-a' }; next(); });
  app.get('/wireguard/by-key', ...route.stack.slice(2).map(layer => layer.handle));
  app.use(errorMiddleware);
  return app;
}

describe('consulta WireGuard con clave en query', () => {
  afterEach(() => vi.restoreAllMocks());

  it('conserva caracteres especiales y limita la búsqueda al workspace de sesión', async () => {
    const lookup = vi.spyOn(repo, 'getByPublicKey').mockResolvedValue(null);
    const response = await request(appForLookup()).get('/wireguard/by-key').query({ publicKey });
    expect(lookup).toHaveBeenCalledWith('workspace-a', publicKey);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NO_WG');
  });

  it.each([
    '', '?publicKey=invalid',
    `?publicKey=${encodeURIComponent(publicKey)}&publicKey=${encodeURIComponent(publicKey)}`,
    `?publicKey=${encodeURIComponent(publicKey)}&workspace_id=workspace-b`,
  ])('rechaza consulta inválida antes de acceder a datos: %s', async query => {
    const lookup = vi.spyOn(repo, 'getByPublicKey');
    const response = await request(appForLookup()).get(`/wireguard/by-key${query}`);
    expect(response.status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('mantiene autenticación en la ruta nueva', async () => {
    const app = express();
    app.use(router);
    app.use(errorMiddleware);
    const response = await request(app).get('/wireguard/by-key').query({ publicKey });
    expect(response.status).toBe(401);
  });
});
