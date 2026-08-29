const repo = require('../db/repos/externalCatalogRepo');
const integrations = require('./workspaceIntegrationService');
const mikrowisp = require('./mikrowispClient');
const { AppError } = require('./apiResponse');

const CATALOGS = Object.freeze({
  ROUTERS: { label: 'Routers y nodos' },
  MONITORING_EQUIPMENT: { label: 'Equipos monitoreados' },
  NAP_BOXES: { label: 'Cajas NAP' },
});

function catalogType(value) {
  const type = String(value || '').trim().toUpperCase();
  if (!CATALOGS[type]) throw new AppError('Catálogo externo no soportado', 404, 'EXTERNAL_CATALOG_NOT_SUPPORTED');
  return type;
}

function unresolved(externalId) {
  return { externalId: String(externalId), name: 'Pendiente de sincronizar', resolved: false };
}

async function list(workspaceId, rawType) {
  const type = catalogType(rawType);
  return { type, label: CATALOGS[type].label, entries: await repo.list(workspaceId, type) };
}

async function listTypes(workspaceId) {
  const states = await repo.listStates(workspaceId);
  return Object.keys(CATALOGS).map(type => ({
    type, label: CATALOGS[type].label,
    count: states.get(type)?.count || 0,
    lastSyncedAt: states.get(type)?.lastSyncedAt || null,
  }));
}

async function sync(workspaceId, rawType) {
  const type = catalogType(rawType);
  const config = await integrations.getSecret(workspaceId, 'MIKROWISP');
  if (!config) throw new AppError('La integración MikroWisp no está configurada o activa', 404, 'INTEGRATION_NOT_CONFIGURED');
  const entries = await mikrowisp.getCatalog(config, type);
  const saved = await repo.replace(workspaceId, type, entries);
  return { type, label: CATALOGS[type].label, entries: saved };
}

async function resolve(workspaceId, rawType, externalId) {
  const type = catalogType(rawType);
  const name = await repo.resolveName(workspaceId, type, String(externalId));
  return name ? { externalId: String(externalId), name, resolved: true } : unresolved(externalId);
}

module.exports = { CATALOGS, catalogType, unresolved, list, listTypes, sync, resolve };
