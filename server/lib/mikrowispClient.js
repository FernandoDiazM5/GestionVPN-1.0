const dns = require('node:dns').promises;
const net = require('node:net');
const { AppError } = require('./apiResponse');

const TIMEOUT_MS = 10_000;
const CLIENT_DETAILS_PATH = 'GetClientsDetails';
const CLIENT_LIST_PATH = 'GetAllClients';
const CATALOG_OPERATIONS = Object.freeze({
  ROUTERS: { path: 'GetRouters', body: { id: -1 }, rows: ['routers'], id: ['id'], name: ['nombre'], metadata: { status: ['estado'], model: ['modelo'] } },
});
const READ_ONLY_PATHS = new Set([CLIENT_DETAILS_PATH, CLIENT_LIST_PATH, ...Object.values(CATALOG_OPERATIONS).map(operation => operation.path)]);

function integrationError(message, code = 'MIKROWISP_INVALID_RESPONSE', status = 422) {
  return new AppError(message, status, code);
}

function isForbiddenIp(address) {
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && parts[2] === 2)
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && parts[2] === 100)))
      || (a === 203 && b === 0 && parts[2] === 113);
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::' || normalized === '::1'
      || normalized.startsWith('fc') || normalized.startsWith('fd')
      || normalized.startsWith('fe8') || normalized.startsWith('fe9')
      || normalized.startsWith('fea') || normalized.startsWith('feb')
      || normalized.startsWith('::ffff:');
  }
  return true;
}

function normalizeBaseUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); }
  catch (_) { throw integrationError('La URL de MikroWisp no es válida', 'MIKROWISP_URL_INVALID'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.port) {
    throw integrationError('La URL debe usar HTTPS estándar y no incluir credenciales, parámetros ni fragmentos', 'MIKROWISP_URL_INVALID');
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  if (path && path !== '/api/v1') throw integrationError('Indica sólo el dominio de MikroWisp o su ruta /api/v1', 'MIKROWISP_URL_INVALID');
  parsed.pathname = '/api/v1/';
  return parsed.toString();
}

async function assertPublicDestination(baseUrl, lookup = dns.lookup) {
  const { hostname } = new URL(baseUrl);
  let records;
  try { records = await lookup(hostname, { all: true, verbatim: true }); }
  catch (_) { throw integrationError('No se pudo resolver el dominio de MikroWisp', 'MIKROWISP_HOST_UNREACHABLE'); }
  if (!Array.isArray(records) || records.length === 0 || records.some(record => isForbiddenIp(record.address))) {
    throw integrationError('El dominio de MikroWisp apunta a una red privada o reservada no permitida', 'MIKROWISP_HOST_FORBIDDEN', 403);
  }
}

function canonicalClientId(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) throw integrationError('El ID de cliente debe ser un entero positivo', 'MIKROWISP_CLIENT_ID_INVALID');
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw integrationError('El ID de cliente debe ser un entero positivo', 'MIKROWISP_CLIENT_ID_INVALID');
  return String(id);
}

function firstValue(source, keys) {
  for (const key of keys) if (source?.[key] !== undefined && source[key] !== null) return source[key];
  return null;
}

function cleanText(value, max = 512) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return cleaned || null;
}

function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['datos', 'data', 'result', 'clientes', 'clients']) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (payload?.[key] && typeof payload[key] === 'object') return [payload[key]];
  }
  return payload && typeof payload === 'object' ? [payload] : [];
}

function catalogReference(externalId, name) {
  if (externalId === null || externalId === undefined || String(externalId).trim() === '') return null;
  const visibleName = cleanText(name, 255);
  return { externalId: cleanText(externalId, 128), name: visibleName || 'Pendiente de sincronizar', resolved: Boolean(visibleName) };
}

function sanitizeService(raw) {
  return {
    id: cleanText(firstValue(raw, ['id', 'idservicio', 'id_servicio']), 128),
    status: cleanText(firstValue(raw, ['estado', 'status', 'status_user']), 64),
    type: cleanText(firstValue(raw, ['tiposervicio', 'tipo_servicio', 'tipo']), 64),
    profile: catalogReference(firstValue(raw, ['idperfil', 'id_perfil']), firstValue(raw, ['perfil', 'plan'])),
    node: catalogReference(firstValue(raw, ['nodo', 'idnodo', 'id_nodo']), null),
    cost: cleanText(firstValue(raw, ['costo']), 64),
    accessPointIp: cleanText(firstValue(raw, ['ipap']), 64),
    mac: cleanText(firstValue(raw, ['mac']), 64),
    ip: cleanText(firstValue(raw, ['ip']), 64),
    installedAt: cleanText(firstValue(raw, ['instalado']), 32),
    coordinates: cleanText(firstValue(raw, ['coordenadas']), 128),
    address: cleanText(firstValue(raw, ['direccion']), 512),
  };
}

function sanitizeBilling(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const pendingCount = Number(firstValue(raw, ['facturas_nopagadas', 'facturas_pendientes', 'pending_count']));
  const pendingTotal = cleanText(firstValue(raw, ['total_facturas', 'total_pendiente', 'pending_total']), 64);
  if (!Number.isFinite(pendingCount) && pendingTotal === null) return null;
  return { pendingInvoices: Number.isFinite(pendingCount) && pendingCount >= 0 ? pendingCount : null, pendingTotal };
}

function sanitizeClient(raw) {
  const id = firstValue(raw, ['idcliente', 'id_cliente', 'idCliente', 'id']);
  return {
    id: canonicalClientId(id),
    name: cleanText(firstValue(raw, ['nombre', 'name', 'nombre_cliente']), 255),
    email: cleanText(firstValue(raw, ['correo', 'email']), 254),
    document: cleanText(firstValue(raw, ['cedula', 'documento', 'dni', 'ruc']), 64),
    phone: cleanText(firstValue(raw, ['telefono', 'phone']), 64),
    mobile: cleanText(firstValue(raw, ['movil', 'mobile']), 64),
    address: cleanText(firstValue(raw, ['direccion_principal', 'direccion', 'address']), 512),
    status: cleanText(firstValue(raw, ['estado', 'status', 'estado_cliente']), 64),
    services: Array.isArray(raw?.servicios) ? raw.servicios.map(sanitizeService) : [],
    billing: sanitizeBilling(raw?.facturacion),
  };
}

function exactClient(payload, requestedId) {
  const rows = unwrapRows(payload);
  const sanitized = [];
  for (const row of rows) {
    try { sanitized.push(sanitizeClient(row)); } catch (_) { /* fila sin ID utilizable */ }
  }
  const matches = sanitized.filter(client => client.id === requestedId);
  if (matches.length === 0) throw integrationError('Cliente no encontrado en MikroWisp', 'MIKROWISP_CLIENT_NOT_FOUND', 404);
  if (matches.length !== 1 || sanitized.length !== 1) throw integrationError('MikroWisp devolvió una respuesta ambigua', 'MIKROWISP_CLIENT_AMBIGUOUS', 409);
  if (!matches[0].name) throw integrationError('MikroWisp no devolvió el nombre del cliente', 'MIKROWISP_INVALID_RESPONSE');
  return matches[0];
}

function clientList(payload) {
  const rows = unwrapRows(payload);
  if (!Array.isArray(rows)) throw integrationError('MikroWisp devolvió una lista de clientes inválida', 'MIKROWISP_INVALID_RESPONSE');
  const clients = new Map();
  for (const row of rows) {
    let client;
    try { client = sanitizeClient(row); } catch (_) { throw integrationError('La lista contiene clientes sin ID válido; no se guardó una importación parcial'); }
    if (!client.name || clients.has(client.id)) throw integrationError('La lista contiene nombres ausentes o IDs duplicados; no se guardó una importación parcial');
    clients.set(client.id, client);
  }
  if (clients.size === 0) throw integrationError('MikroWisp no devolvió clientes utilizables', 'MIKROWISP_CLIENTS_EMPTY', 404);
  if (clients.size > 20_000) throw integrationError('La lista de clientes excede el límite seguro', 'MIKROWISP_CLIENTS_LIMIT', 422);
  return [...clients.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

async function postReadOnly(config, path, body, dependencies = {}) {
  if (!READ_ONLY_PATHS.has(path)) throw integrationError('Consulta MikroWisp no permitida', 'MIKROWISP_OPERATION_NOT_ALLOWED', 403);
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  await assertPublicDestination(baseUrl, dependencies.lookup || dns.lookup);
  const fetchImpl = dependencies.fetch || fetch;
  let response;
  try {
    response = await fetchImpl(new URL(path, baseUrl), {
      method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (_) { throw integrationError('No se pudo conectar con MikroWisp', 'MIKROWISP_UNREACHABLE'); }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload === null || payload?.estado === 'error') throw integrationError('MikroWisp rechazó la consulta', 'MIKROWISP_REQUEST_REJECTED');
  return payload;
}

function catalogEntries(payload, definition) {
  let rows = null;
  for (const key of definition.rows) if (Array.isArray(payload?.[key])) { rows = payload[key]; break; }
  if (!rows) throw integrationError('MikroWisp devolvió un catálogo inválido', 'MIKROWISP_INVALID_RESPONSE');
  const unique = new Map();
  for (const raw of rows) {
    const idValue = firstValue(raw, definition.id);
    const name = cleanText(firstValue(raw, definition.name), 255);
    if (idValue === null || !name) throw integrationError('MikroWisp devolvió una entrada de catálogo inválida', 'MIKROWISP_INVALID_RESPONSE');
    const externalId = cleanText(idValue, 128);
    if (!externalId || unique.has(externalId)) throw integrationError('MikroWisp devolvió IDs de catálogo duplicados', 'MIKROWISP_INVALID_RESPONSE');
    const metadata = {};
    for (const [target, sources] of Object.entries(definition.metadata)) {
      const value = cleanText(firstValue(raw, sources), 255);
      if (value !== null) metadata[target] = value;
    }
    unique.set(externalId, { externalId, name, metadata });
  }
  return [...unique.values()];
}

async function getCatalog(config, rawType, dependencies) {
  const type = String(rawType || '').toUpperCase();
  const definition = CATALOG_OPERATIONS[type];
  if (!definition) throw integrationError('Catálogo MikroWisp no permitido', 'MIKROWISP_OPERATION_NOT_ALLOWED', 403);
  const payload = await postReadOnly(config, definition.path, { token: config.token, ...definition.body }, dependencies);
  return catalogEntries(payload, definition);
}

async function getClientDetails(config, clientId, dependencies) {
  const id = canonicalClientId(clientId);
  const payload = await postReadOnly(config, CLIENT_DETAILS_PATH, { token: config.token, idcliente: Number(id) }, dependencies);
  return exactClient(payload, id);
}

async function listClientDetails(config, dependencies = {}) {
  const clients = new Map();
  const limit = 100;
  const pause = dependencies.pause || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (let pagina = 1; pagina <= 201; pagina += 1) {
    if (pagina > 1) await pause(300);
    const payload = await postReadOnly(config, CLIENT_LIST_PATH, { token: config.token, limit, pagina }, dependencies);
    if (!Array.isArray(payload?.clientes)) throw integrationError('MikroWisp devolvió una lista inválida; no se guardaron datos parciales');
    if (payload.clientes.length) {
      for (const client of clientList(payload)) {
        if (clients.has(client.id)) throw integrationError('MikroWisp repitió clientes entre páginas; no se guardaron datos parciales');
        clients.set(client.id, { id: client.id, name: client.name });
      }
    }
    if (clients.size > 20_000) throw integrationError('La lista de clientes excede el límite seguro', 'MIKROWISP_CLIENTS_LIMIT');
    if (payload.clientes.length < limit) return [...clients.values()].sort((a, b) => Number(a.id) - Number(b.id));
  }
  throw integrationError('MikroWisp no confirmó el final de la lista; no se guardaron datos parciales');
}

async function validateConnection(config, dependencies) {
  const id = canonicalClientId(config.validationClientId);
  const client = await getClientDetails(config, id, dependencies);
  return { label: new URL(normalizeBaseUrl(config.baseUrl)).hostname, metadata: { apiVersion: 'v1', validationClientId: id, validationClientName: client.name } };
}

module.exports = { CLIENT_DETAILS_PATH, CATALOG_OPERATIONS, normalizeBaseUrl, assertPublicDestination, isForbiddenIp, canonicalClientId, catalogReference, sanitizeService, sanitizeBilling, sanitizeClient, exactClient, clientList, catalogEntries, postReadOnly, getClientDetails, listClientDetails, getCatalog, validateConnection };
