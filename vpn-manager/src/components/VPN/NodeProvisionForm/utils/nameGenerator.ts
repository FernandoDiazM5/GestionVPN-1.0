export function generateIfaceName(nodeNumber: string, nodeName: string, protocol: 'sstp' | 'wireguard'): string {
  if (!nodeNumber || !nodeName) return '';
  return `VPN-${protocol === 'wireguard' ? 'WG' : 'SSTP'}-ND${nodeNumber}-${nodeName.toUpperCase()}`;
}

export function generateVrfName(nodeNumber: string, nodeName: string): string {
  if (!nodeNumber || !nodeName) return '';
  return `VRF-ND${nodeNumber}-${nodeName.toUpperCase()}`;
}

export function canProvision(
  nodeNumber: string,
  nodeName: string,
  lanSubnet: string,
  remoteAddress: string,
  protocol: 'sstp' | 'wireguard',
  cpePublicKey: string,
  pppUser: string,
  pppPassword: string,
  isProvisioning: boolean
): boolean {
  if (isProvisioning) return false;
  if (!nodeNumber || !nodeName || !lanSubnet || !remoteAddress) return false;

  if (protocol === 'wireguard') {
    return !!cpePublicKey;
  }

  return !!pppUser && !!pppPassword;
}
