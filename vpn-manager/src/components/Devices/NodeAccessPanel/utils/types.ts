// ── Tipos para provisión ───────────────────────────────────────────────────
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
}
