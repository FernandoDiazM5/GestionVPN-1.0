const { safeWrite, writeIdempotent } = require('../routeros.service');
const { entriesToAdd } = require('./addressList');
const { normalizeCidrs } = require('./ipv4Cidr');

const TOWER_LIST = 'LIST-NET-REMOTE-TOWERS';
let addressListQueue = Promise.resolve();
let routeQueue = Promise.resolve();

function serializeAddressList(task) {
  const run = addressListQueue.then(task, task);
  addressListQueue = run.catch(() => undefined);
  return run;
}

function serializeRoute(task) {
  const run = routeQueue.then(task, task);
  routeQueue = run.catch(() => undefined);
  return run;
}

async function ensureTowerEntries(api, addresses, comment) {
  return serializeAddressList(async () => {
    const wanted = normalizeCidrs(addresses, { allowHost: true });
    // A failed read must abort: treating it as an empty list would create duplicates.
    const existing = await safeWrite(api, ['/ip/firewall/address-list/print']);
    const missing = entriesToAdd(existing, TOWER_LIST, wanted);
    for (const address of missing) {
      await writeIdempotent(api, ['/ip/firewall/address-list/add',
        `=list=${TOWER_LIST}`, `=address=${address}`, `=comment=${comment}`]);
    }
    return missing;
  });
}

async function ensureRoute(api, { dst, gateway, routingTable, comment, distance }) {
  return serializeRoute(async () => {
    const normalizedDst = normalizeCidrs([dst], { allowHost: true })[0];
    if (!normalizedDst) throw new Error(`CIDR de ruta inválido: ${dst}`);
    const found = await safeWrite(api, ['/ip/route/print',
      `?dst-address=${normalizedDst}`, `?routing-table=${routingTable}`]);
    if ((found || []).some((route) => route['dst-address'] === normalizedDst
        && route['routing-table'] === routingTable && route.dynamic !== 'true')) return false;
    const command = ['/ip/route/add', `=dst-address=${normalizedDst}`, `=gateway=${gateway}`,
      `=routing-table=${routingTable}`, '=scope=30', '=target-scope=10'];
    if (distance) command.push(`=distance=${distance}`);
    if (comment) command.push(`=comment=${comment}`);
    await writeIdempotent(api, command);
    return true;
  });
}

async function removeRoutesForVrf(api, routingTable, addresses) {
  const wanted = new Set(normalizeCidrs(addresses, { allowHost: true }));
  if (wanted.size === 0) return [];
  const routes = await safeWrite(api, ['/ip/route/print']);
  const removed = [];
  for (const route of routes || []) {
    if (route.dynamic === 'true' || route['routing-table'] !== routingTable
        || !wanted.has(route['dst-address']) || !route['.id']) continue;
    await safeWrite(api, ['/ip/route/remove', `=.id=${route['.id']}`]);
    removed.push(route['dst-address']);
  }
  return removed;
}

module.exports = { TOWER_LIST, ensureTowerEntries, ensureRoute, removeRoutesForVrf };
