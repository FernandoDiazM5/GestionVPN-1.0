import { describe, expect, it, vi } from 'vitest';
const client = require('../../lib/mikrowispClient');

const publicLookup = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]);

describe('mikrowispClient read-only', () => {
  it('normaliza únicamente dominios HTTPS hacia /api/v1', () => {
    expect(client.normalizeBaseUrl('https://isp.example.com')).toBe('https://isp.example.com/api/v1/');
    expect(client.normalizeBaseUrl('https://isp.example.com/api/v1/')).toBe('https://isp.example.com/api/v1/');
    expect(() => client.normalizeBaseUrl('http://isp.example.com')).toThrowError(expect.objectContaining({ code: 'MIKROWISP_URL_INVALID' }));
    expect(() => client.normalizeBaseUrl('https://user:pass@isp.example.com')).toThrowError(expect.objectContaining({ code: 'MIKROWISP_URL_INVALID' }));
    expect(() => client.normalizeBaseUrl('https://isp.example.com/api/otra')).toThrowError(expect.objectContaining({ code: 'MIKROWISP_URL_INVALID' }));
  });

  it('bloquea destinos privados o reservados', async () => {
    for (const address of ['127.0.0.1', '10.0.0.2', '172.16.0.2', '192.168.1.2', '169.254.169.254', '::1', 'fd00::1']) {
      await expect(client.assertPublicDestination('https://isp.example.com/api/v1/', vi.fn(async () => [{ address }]))).rejects.toMatchObject({ code: 'MIKROWISP_HOST_FORBIDDEN' });
    }
  });

  it('sólo llama al endpoint nominal GetClientsDetails y filtra secretos', async () => {
    const fetchMock = vi.fn(async (_url, options) => ({
      ok: true,
      json: async () => [{ idcliente: '0014', nombre: '  Ana   Pérez ', cedula: '123', movil: '999', direccion_principal: 'Calle 1', estado: 'Activo', usuario_pppoe: 'ana', password: 'secreto', token: 'no-pasar' }],
      options,
    }));
    const result = await client.getClientDetails({ baseUrl: 'https://isp.example.com', token: 'api-secret' }, '0014', { fetch: fetchMock, lookup: publicLookup });
    expect(result).toEqual({ id: '14', name: 'Ana Pérez', email: null, document: '123', phone: null, mobile: '999', address: 'Calle 1', status: 'Activo', services: [], billing: null });
    expect(JSON.stringify(result)).not.toMatch(/ppp|secreto|token/i);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe('https://isp.example.com/api/v1/GetClientsDetails');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(JSON.parse(options.body)).toEqual({ token: 'api-secret', idcliente: 14 });
  });

  it('adapta la respuesta real `datos`, servicios y facturación sin filtrar secretos operativos', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ estado: 'exito', datos: [{
      id: 6, nombre: 'ARIEL Perez', estado: 'ACTIVO', correo: '', telefono: '45434565', movil: '998283745', cedula: '65454323', direccion_principal: '2301 Peger Rd.',
      servicios: [{ id: 5, idperfil: 2, nodo: 2, costo: '150.00', ipap: '', mac: '00:44:56:56:78:17', ip: '192.168.33.3', instalado: '0000-00-00', pppuser: 'User6', ppppass: 'Pass6', tiposervicio: 'internet', status_user: 'OFFLINE', coordenadas: '-11,-77', direccion: '', snmp_comunidad: 'public', perfil: 'Plan 4Mbps' }],
      facturacion: { facturas_nopagadas: 4, total_facturas: '750.00' },
    }] }) }));
    const result = await client.getClientDetails({ baseUrl: 'https://isp.example.com', token: 'sensitive-token' }, '6', { fetch: fetchMock, lookup: publicLookup });
    expect(result).toEqual({
      id: '6', name: 'ARIEL Perez', email: null, document: '65454323', phone: '45434565', mobile: '998283745', address: '2301 Peger Rd.', status: 'ACTIVO',
      services: [{
        id: '5', status: 'OFFLINE', type: 'internet', profile: { externalId: '2', name: 'Plan 4Mbps', resolved: true }, node: { externalId: '2', name: 'Pendiente de sincronizar', resolved: false },
        cost: '150.00', accessPointIp: null, mac: '00:44:56:56:78:17', ip: '192.168.33.3', installedAt: '0000-00-00', coordinates: '-11,-77', address: null,
      }],
      billing: { pendingInvoices: 4, pendingTotal: '750.00' },
    });
    expect(JSON.stringify(result)).not.toMatch(/ppp|Pass6|User6|snmp|public|sensitive-token/i);
  });

  it('obtiene clientes del endpoint de listado paginado sin secretos', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ estado: 'exito', clientes: [
      { id: 9, nombre: 'Cliente nueve', ppppass: 'oculto' },
      { id: 2, nombre: 'Cliente dos', token: 'oculto' },
    ] }) }));
    const result = await client.listClientDetails({ baseUrl: 'https://isp.example.com', token: 'api-secret' }, { fetch: fetchMock, lookup: publicLookup });
    expect(result.map(item => ({ id: item.id, name: item.name }))).toEqual([{ id: '2', name: 'Cliente dos' }, { id: '9', name: 'Cliente nueve' }]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'api-secret', limit: 100, pagina: 1 });
    expect(fetchMock.mock.calls[0][0].pathname).toBe('/api/v1/GetAllClients');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toMatch(/oculto|ppppass|token/i);
  });

  it('rechaza rutas arbitrarias y respuestas con ID distinto o ambiguas', async () => {
    await expect(client.postReadOnly({ baseUrl: 'https://isp.example.com' }, 'NewUser', {}, { lookup: publicLookup })).rejects.toMatchObject({ code: 'MIKROWISP_OPERATION_NOT_ALLOWED' });
    expect(() => client.exactClient([{ idcliente: 15, nombre: 'Otro' }], '14')).toThrowError(expect.objectContaining({ code: 'MIKROWISP_CLIENT_NOT_FOUND' }));
    expect(() => client.exactClient([{ idcliente: 14, nombre: 'Ana' }, { idcliente: 14, nombre: 'Ana duplicada' }], '14')).toThrowError(expect.objectContaining({ code: 'MIKROWISP_CLIENT_AMBIGUOUS' }));
  });

  it('sincroniza sólo catálogos nominales y conserva metadatos permitidos', async () => {
    const fetchMock = vi.fn(async url => ({
      ok: true,
      json: async () => url.toString().endsWith('/GetRouters') ? { routers: [
        { id: 2, nombre: 'Nodo Norte', ip: '192.168.1.1', estado: 'CONECTADO', modelo: 'RB5009', password: 'no-pasar' },
      ] } : {},
    }));
    const entries = await client.getCatalog({ baseUrl: 'https://isp.example.com', token: 'secret' }, 'ROUTERS', { fetch: fetchMock, lookup: publicLookup });
    expect(entries).toEqual([{ externalId: '2', name: 'Nodo Norte', metadata: { status: 'CONECTADO', model: 'RB5009' } }]);
    expect(JSON.stringify(entries)).not.toMatch(/192\.168|password|no-pasar/i);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'secret', id: -1 });
    await expect(client.getCatalog({ baseUrl: 'https://isp.example.com' }, 'PLANES', { lookup: publicLookup })).rejects.toMatchObject({ code: 'MIKROWISP_OPERATION_NOT_ALLOWED' });
  });

  it('rechaza catálogos sin arreglo, sin nombre o con IDs duplicados', () => {
    const definition = client.CATALOG_OPERATIONS.ROUTERS;
    expect(() => client.catalogEntries({}, definition)).toThrowError(expect.objectContaining({ code: 'MIKROWISP_INVALID_RESPONSE' }));
    expect(() => client.catalogEntries({ routers: [{ id: 1 }] }, definition)).toThrowError(expect.objectContaining({ code: 'MIKROWISP_INVALID_RESPONSE' }));
    expect(() => client.catalogEntries({ routers: [{ id: 1, nombre: 'A' }, { id: 1, nombre: 'B' }] }, definition)).toThrowError(expect.objectContaining({ code: 'MIKROWISP_INVALID_RESPONSE' }));
  });
});

describe('importación paginada', () => {
  const config = { baseUrl: 'https://isp.example.com', token: 'secret' };
  it('recorre páginas secuenciales y espera entre consultas', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, nombre: 'Cliente ' + i }));
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ clientes: rows }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ clientes: [{ id: 101, nombre: 'Último' }] }) });
    const pause = vi.fn();
    const result = await client.listClientDetails(config, { fetch, lookup: publicLookup, pause });
    expect(result).toHaveLength(101);
    expect(pause).toHaveBeenCalledWith(300);
    expect(fetch.mock.calls.map(([, options]) => JSON.parse(options.body).pagina)).toEqual([1, 2]);
  });
  it('rechaza páginas repetidas en vez de guardar una lista incompleta', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, nombre: 'Cliente' }));
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ clientes: rows }) }));
    await expect(client.listClientDetails(config, { fetch, lookup: publicLookup, pause: vi.fn() })).rejects.toThrow('repitió');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('no interpreta errores del proveedor como clientes', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ estado: 'error', mensaje: 'No existe' }) }));
    await expect(client.listClientDetails(config, { fetch, lookup: publicLookup })).rejects.toMatchObject({ code: 'MIKROWISP_REQUEST_REJECTED' });
  });
});
