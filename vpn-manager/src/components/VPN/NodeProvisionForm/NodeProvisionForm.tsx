import {
  useNodeProvisionForm,
  useNodeProvisioning,
  useScriptGeneration,
} from './hooks';
import {
  ProvisionFormHeader,
  ProvisionFormInputs,
  NamePreview,
  ProvisionActionButtons,
  ProvisionLogs,
  ProvisionError,
  WireGuardDetails,
  ScriptOutput,
} from './components';
import { generateIfaceName, generateVrfName, canProvision } from './utils';

export default function NodeProvisionForm() {
  const formState = useNodeProvisionForm();
  const provisionState = useNodeProvisioning();
  const scriptState = useScriptGeneration();

  const ifaceName = generateIfaceName(formState.nodeNumber, formState.nodeName, formState.protocol);
  const vrfName = generateVrfName(formState.nodeNumber, formState.nodeName);

  const canProvisionNow = canProvision(
    formState.nodeNumber,
    formState.nodeName,
    formState.lanSubnet,
    formState.remoteAddress,
    formState.protocol,
    formState.cpePublicKey,
    formState.pppUser,
    formState.pppPassword,
    provisionState.isProvisioning
  );

  const handleProvision = async () => {
    await provisionState.handleProvision({
      nodeNumber: formState.nodeNumber,
      nodeName: formState.nodeName,
      pppUser: formState.pppUser,
      pppPassword: formState.pppPassword,
      lanSubnet: formState.lanSubnet,
      remoteAddress: formState.remoteAddress,
      protocol: formState.protocol,
      cpePublicKey: formState.cpePublicKey,
    });
  };

  const handleGenerateScript = async () => {
    await scriptState.handleGenerateScript({
      nodeName: formState.nodeName,
      pppUser: formState.pppUser,
      pppPassword: formState.pppPassword,
      lanSubnet: formState.lanSubnet,
      serverPublicIP: formState.serverPublicIP,
    });
  };

  return (
    <div className="card overflow-hidden">
      <ProvisionFormHeader isOpen={formState.isOpen} onToggle={formState.toggleOpen} />

      {formState.isOpen && (
        <div className="p-5 space-y-5 border-t border-slate-100">
          <ProvisionFormInputs
            nodeNumber={formState.nodeNumber}
            nodeName={formState.nodeName}
            lanSubnet={formState.lanSubnet}
            remoteAddress={formState.remoteAddress}
            protocol={formState.protocol}
            pppUser={formState.pppUser}
            pppPassword={formState.pppPassword}
            cpePublicKey={formState.cpePublicKey}
            onNodeNumberChange={formState.setNodeNumber}
            onNodeNameChange={formState.setNodeName}
            onLanSubnetChange={formState.setLanSubnet}
            onRemoteAddressChange={formState.setRemoteAddress}
            onProtocolChange={formState.setProtocol}
            onPppUserChange={formState.setPppUser}
            onPppPasswordChange={formState.setPppPassword}
            onCpePublicKeyChange={formState.setCpePublicKey}
          />

          <NamePreview ifaceName={ifaceName} vrfName={vrfName} />

          <ProvisionActionButtons
            canProvision={canProvisionNow}
            isProvisioning={provisionState.isProvisioning}
            isGenerating={scriptState.isGenerating}
            serverPublicIP={formState.serverPublicIP}
            onServerPublicIPChange={formState.setServerPublicIP}
            onProvision={handleProvision}
            onGenerateScript={handleGenerateScript}
          />

          <ProvisionLogs logs={provisionState.provisionLogs} />

          <ProvisionError error={provisionState.provisionError} isProvisioning={provisionState.isProvisioning} />

          <WireGuardDetails serverPublicKey={provisionState.serverPublicKey} wgPort={provisionState.wgPort} />

          <ScriptOutput
            script={scriptState.generatedScript}
            onCopy={scriptState.handleCopy}
            copied={scriptState.copied}
          />
        </div>
      )}
    </div>
  );
}
