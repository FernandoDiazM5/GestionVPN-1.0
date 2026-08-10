const { safeWrite } = require('../routeros.service');
const { normalizeCidrs } = require('./ipv4Cidr');

function splitAllowedAddresses(value) {
  return normalizeCidrs(String(value || '').split(',').map((item) => item.trim()), { allowHost: true });
}

function sameAddresses(left, right) {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((address) => expected.has(address));
}

function resolvePeer(peers, { interfaceName, publicKey }) {
  const interfacePeers = (peers || []).filter((peer) => peer.interface === interfaceName);
  if (publicKey) {
    const keyed = interfacePeers.filter((peer) => peer['public-key'] === publicKey);
    if (keyed.length === 1) return { peer: keyed[0], resolution: 'public-key' };
    if (keyed.length > 1) throw new Error(`Hay varios peers con la clave guardada en ${interfaceName}`);
  }
  if (interfacePeers.length === 1) return { peer: interfacePeers[0], resolution: 'unique-interface-peer' };
  if (interfacePeers.length === 0) throw new Error(`No se encontró el peer WireGuard de ${interfaceName}`);
  throw new Error(`No se puede identificar con seguridad el peer de ${interfaceName}: hay ${interfacePeers.length} candidatos`);
}

async function syncPeerLanAddresses(api, {
  interfaceName,
  publicKey = '',
  peerAddress = '',
  lanSubnets = [],
}) {
  if (!interfaceName) throw new Error('Interfaz WireGuard requerida');
  const desired = normalizeCidrs([peerAddress, ...lanSubnets], { allowHost: true });
  if (desired.length === 0) throw new Error(`Allowed Address vacío para ${interfaceName}`);

  const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
  const { peer, resolution } = resolvePeer(peers, { interfaceName, publicKey });
  const before = splitAllowedAddresses(peer['allowed-address']);
  const changed = !sameAddresses(before, desired);
  if (changed) {
    await safeWrite(api, [
      '/interface/wireguard/peers/set',
      `=.id=${peer['.id']}`,
      `=allowed-address=${desired.join(',')}`,
    ]);
  }

  const verifiedPeers = await safeWrite(api, ['/interface/wireguard/peers/print']);
  const verified = verifiedPeers.find((candidate) => candidate['.id'] === peer['.id']);
  const actual = splitAllowedAddresses(verified?.['allowed-address']);
  if (!verified || !sameAddresses(actual, desired)) {
    throw new Error(`RouterOS no confirmó los Allowed Address de ${interfaceName}`);
  }
  return { changed, resolution, publicKey: peer['public-key'] || '', before, actual };
}

module.exports = {
  resolvePeer,
  sameAddresses,
  splitAllowedAddresses,
  syncPeerLanAddresses,
};
