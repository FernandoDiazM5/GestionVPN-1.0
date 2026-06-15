export interface ProvisionStep {
  step: string | number;
  obj: string;
  name: string;
  status: 'ok' | 'error';
}

export interface ProvisionResult {
  success: boolean;
  message: string;
  ifaceName?: string;
  vrfName?: string;
  remoteAddress?: string;
  steps: ProvisionStep[];
  failedAt?: number;
  serverPublicKey?: string;
  /** true si, al fallar, el backend revirtió los objetos parciales en el router (H4). */
  rolledBack?: boolean;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface ProtectedNet {
  cidr: string;
  label: string;
}

export interface WgPeer {
  name: string;
  publicKey: string;
  address: string;
  endpoint?: string;
  allowedIps: string;
  persistentKeepalive?: string;
}
