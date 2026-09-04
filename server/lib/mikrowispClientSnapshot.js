const integrations = require('./workspaceIntegrationService');
const catalog = require('../db/repos/externalCatalogRepo');
const { AppError } = require('./apiResponse');
const TYPE = 'TELEGRAM_CLIENTS';
const inFlight = new Map();
const lastAttempt = new Map();
async function read(workspaceId) {
  const rows = await catalog.list(workspaceId, TYPE);
  return rows.map(row => ({ id: row.externalId, name: row.name }));
}
function sync(workspaceId) {
  if (inFlight.has(workspaceId)) return inFlight.get(workspaceId);
  if (Date.now() - (lastAttempt.get(workspaceId) || 0) < 60_000) {
    throw new AppError('Espera un minuto antes de volver a importar clientes.', 429, 'MIKROWISP_IMPORT_COOLDOWN');
  }
  lastAttempt.set(workspaceId, Date.now());
  const task = (async () => {
    const clients = await integrations.listMikrowispClients(workspaceId);
    // Sólo ID y nombre: nunca credenciales, servicios ni datos de facturación.
    await catalog.replace(workspaceId, TYPE, clients.map(client => ({ externalId: client.id, name: client.name })));
    return { count: clients.length };
  })().finally(() => inFlight.delete(workspaceId));
  inFlight.set(workspaceId, task);
  return task;
}
module.exports = { read, sync };
