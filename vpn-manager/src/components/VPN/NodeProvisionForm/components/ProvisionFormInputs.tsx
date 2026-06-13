import { ProtocolSelector } from './ProtocolSelector';
import { SSTPInputs } from './SSTPInputs';
import { WireGuardInputs } from './WireGuardInputs';

interface ProvisionFormInputsProps {
  nodeNumber: string;
  nodeName: string;
  lanSubnet: string;
  remoteAddress: string;
  protocol: 'sstp' | 'wireguard';
  pppUser: string;
  pppPassword: string;
  cpePublicKey: string;
  onNodeNumberChange: (value: string) => void;
  onNodeNameChange: (value: string) => void;
  onLanSubnetChange: (value: string) => void;
  onRemoteAddressChange: (value: string) => void;
  onProtocolChange: (protocol: 'sstp' | 'wireguard') => void;
  onPppUserChange: (value: string) => void;
  onPppPasswordChange: (value: string) => void;
  onCpePublicKeyChange: (value: string) => void;
}

export function ProvisionFormInputs({
  nodeNumber,
  nodeName,
  lanSubnet,
  remoteAddress,
  protocol,
  pppUser,
  pppPassword,
  cpePublicKey,
  onNodeNumberChange,
  onNodeNameChange,
  onLanSubnetChange,
  onRemoteAddressChange,
  onProtocolChange,
  onPppUserChange,
  onPppPasswordChange,
  onCpePublicKeyChange,
}: ProvisionFormInputsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div>
        <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nº Nodo</label>
        <input
          type="number"
          min="1"
          value={nodeNumber}
          onChange={e => onNodeNumberChange(e.target.value)}
          placeholder="12"
          className="input-field w-full"
        />
      </div>
      <div>
        <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nombre Nodo</label>
        <input
          value={nodeName}
          onChange={e => onNodeNameChange(e.target.value)}
          placeholder="ETAPA12"
          className="input-field w-full"
        />
      </div>
      <ProtocolSelector protocol={protocol} onProtocolChange={onProtocolChange} />
      {protocol === 'sstp' ? (
        <SSTPInputs
          pppUser={pppUser}
          pppPassword={pppPassword}
          onUserChange={onPppUserChange}
          onPasswordChange={onPppPasswordChange}
        />
      ) : (
        <WireGuardInputs cpePublicKey={cpePublicKey} onCpePublicKeyChange={onCpePublicKeyChange} />
      )}
      <div>
        <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Subred LAN Remota</label>
        <input
          value={lanSubnet}
          onChange={e => onLanSubnetChange(e.target.value)}
          placeholder="10.5.5.0/24"
          className="input-field w-full"
        />
      </div>
      <div>
        <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">IP Remota Túnel</label>
        <input
          value={remoteAddress}
          onChange={e => onRemoteAddressChange(e.target.value)}
          placeholder="10.10.250.212"
          className="input-field w-full"
        />
      </div>
    </div>
  );
}
