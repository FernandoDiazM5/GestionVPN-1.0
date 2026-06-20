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
  /** WG: 'generated' = el servidor generó el par del CPE; 'manual' = se pegó la pública. */
  cpeKeyMode?: 'generated' | 'manual';
  /** SSTP: 'generated' = el servidor generó usuario+contraseña; 'manual' = se ingresaron. */
  sstpCredMode?: 'generated' | 'manual';
  /** Script .rsc del CPE listo para copy/paste (WG: privada embebida · SSTP: user+pass embebidos). */
  cpeScript?: string;
  /** Pasos del script del CPE (para mostrarlos en tarjetas con copiar). */
  cpeSteps?: { title: string; cmd: string }[];
  /** SSTP: credenciales PPP efectivas (generadas o manuales). */
  pppUser?: string;
  pppPassword?: string;
  peerIP?: string;
  wgPort?: number;
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
