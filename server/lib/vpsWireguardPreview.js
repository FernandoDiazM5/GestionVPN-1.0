const os = require('node:os');
const { cidrOverlaps, normalizeCidr } = require('./ipv4Cidr');
const { localInterfaceCidrs } = require('./managementNetworkService');
const mgmtNet = require('./mgmtNet');

function previewVpsWireguard(input, options = {}) {
  const managementSupernet = String(options.managementSupernet || mgmtNet.DEFAULT_SUPERNET).trim();
  const plan = mgmtNet.deriveSupernet(managementSupernet);
  const blockers = [];
  const warnings = [];

  if (!plan) blockers.push('La supernet de gestión vigente no es válida.');

  const address = normalizeCidr(input.address, { allowHost: true });
  if (!address || !address.endsWith('/32')) blockers.push('La dirección del VPS debe ser una IPv4 /32 válida.');
  if (plan && address && !cidrOverlaps(address, plan.vpsNet)) {
    blockers.push(`La dirección del VPS debe pertenecer a ${plan.vpsNet}.`);
  }

  const allowedIps = [];
  const seen = new Set();
  for (const value of input.allowedIps || []) {
    const normalized = normalizeCidr(value, { allowHost: false, allowDefaultRoute: true });
    if (!normalized) blockers.push(`AllowedIP inválida: ${value}.`);
    else if (normalized === '0.0.0.0/0') blockers.push('No se permite 0.0.0.0/0 en el túnel de gestión.');
    else if (!seen.has(normalized)) { seen.add(normalized); allowedIps.push(normalized); }
  }
  if (plan && !allowedIps.includes(plan.net)) blockers.push(`AllowedIPs debe incluir exactamente la supernet de gestión ${plan.net}.`);

  const interfaces = options.interfaces || os.networkInterfaces();
  const hostNetworks = localInterfaceCidrs(interfaces);
  const conflicts = [];
  for (const allowed of allowedIps) {
    for (const host of hostNetworks) {
      if (cidrOverlaps(allowed, host.cidr)) conflicts.push({ allowedIp: allowed, ...host });
    }
  }
  if (conflicts.length) blockers.push('Una o más AllowedIPs se solapan con redes activas del VPS o Docker.');
  if (input.localListenPort === 0) warnings.push('El VPS usará un puerto local dinámico; el Core se alcanza mediante PersistentKeepalive.');

  const current = options.current || {};
  const desired = {
    interface: input.interface,
    address,
    localListenPort: input.localListenPort || null,
    mtu: input.mtu,
    corePublicKey: input.corePublicKey,
    coreEndpoint: `${input.coreEndpointHost}:${input.coreEndpointPort}`,
    allowedIps,
    persistentKeepalive: input.persistentKeepalive,
  };
  const changes = Object.entries(desired)
    .filter(([key, value]) => JSON.stringify(current[key] ?? null) !== JSON.stringify(value))
    .map(([field, value]) => ({ field, value }));

  return {
    valid: blockers.length === 0,
    canApply: false,
    readOnly: true,
    blockers,
    warnings,
    conflicts,
    desired,
    changes,
    actions: [
      `Crear o actualizar la interfaz ${input.interface} con MTU ${input.mtu}.`,
      `Asignar ${address || input.address} al VPS.`,
      `Configurar el peer del Core en ${input.coreEndpointHost}:${input.coreEndpointPort}.`,
      `Enrutar ${allowedIps.join(', ') || 'las redes permitidas'} por el túnel.`,
      'Verificar handshake, rutas y conectividad antes de confirmar.',
    ],
  };
}

module.exports = { previewVpsWireguard };
