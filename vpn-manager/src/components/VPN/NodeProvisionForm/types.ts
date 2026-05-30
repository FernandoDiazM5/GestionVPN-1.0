export interface ProvisionStep {
  step: number;
  obj: string;
  name: string;
  status: string;
}

export interface NodeProvisionData {
  nodeNumber: string;
  nodeName: string;
  pppUser: string;
  pppPassword: string;
  lanSubnet: string;
  remoteAddress: string;
  protocol: 'sstp' | 'wireguard';
  cpePublicKey: string;
  serverPublicIP: string;
}

export interface ProvisionFormProps {
  // Props si es necesario reutilizar el componente
}
