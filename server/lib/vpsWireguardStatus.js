const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');

const INTERFACE = 'wg0';
const COMMAND_TIMEOUT_MS = 2500;

function run(command, args = []) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 128 * 1024 }, (error, stdout = '') => {
      resolve({ ok: !error, output: String(stdout).trim(), code: error?.code || null });
    });
  });
}

function parseJson(output, fallback) {
  try { return JSON.parse(output); } catch (_) { return fallback; }
}

async function exists(path) {
  try { await fs.access(path); return true; } catch (_) { return false; }
}

function normalizeAddresses(rows) {
  const info = Array.isArray(rows) ? rows[0] : null;
  return (info?.addr_info || [])
    .filter(item => item.family === 'inet' || item.family === 'inet6')
    .map(item => `${item.local}/${item.prefixlen}`);
}

function normalizeRoutes(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(item => item.dst || item.gateway)
    .filter(Boolean)
    .slice(0, 64);
}

async function inspectVpsWireguard() {
  const [wgVersion, interfacePresent, addressResult, routeResult, publicKeyResult, portResult] = await Promise.all([
    run('wg', ['--version']),
    exists(`/sys/class/net/${INTERFACE}`),
    run('ip', ['-j', 'address', 'show', 'dev', INTERFACE]),
    run('ip', ['-j', 'route', 'show', 'dev', INTERFACE]),
    run('wg', ['show', INTERFACE, 'public-key']),
    run('wg', ['show', INTERFACE, 'listen-port']),
  ]);

  const addresses = addressResult.ok ? normalizeAddresses(parseJson(addressResult.output, [])) : [];
  const routes = routeResult.ok ? normalizeRoutes(parseJson(routeResult.output, [])) : [];
  const publicKey = publicKeyResult.ok && /^[A-Za-z0-9+/]{43}=$/.test(publicKeyResult.output)
    ? publicKeyResult.output
    : null;
  const listenPort = portResult.ok && /^\d{1,5}$/.test(portResult.output)
    ? Number(portResult.output)
    : null;

  let status = 'NOT_CONFIGURED';
  if (interfacePresent && publicKey && addresses.length > 0) status = 'ACTIVE';
  else if (interfacePresent) status = 'DEGRADED';

  return {
    status,
    readOnly: true,
    interface: INTERFACE,
    toolsAvailable: wgVersion.ok,
    interfacePresent,
    addresses,
    listenPort,
    publicKey,
    routes,
    inspectedAt: Date.now(),
  };
}

module.exports = { inspectVpsWireguard, normalizeAddresses, normalizeRoutes };
