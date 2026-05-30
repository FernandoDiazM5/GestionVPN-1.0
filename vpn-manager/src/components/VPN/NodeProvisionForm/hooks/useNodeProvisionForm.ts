import { useState } from 'react';

export function useNodeProvisionForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [nodeNumber, setNodeNumber] = useState('');
  const [nodeName, setNodeName] = useState('');
  const [pppUser, setPppUser] = useState('');
  const [pppPassword, setPppPassword] = useState('');
  const [lanSubnet, setLanSubnet] = useState('');
  const [remoteAddress, setRemoteAddress] = useState('');
  const [protocol, setProtocol] = useState<'sstp' | 'wireguard'>('sstp');
  const [cpePublicKey, setCpePublicKey] = useState('');
  const [serverPublicIP, setServerPublicIP] = useState('');

  const toggleOpen = () => setIsOpen(!isOpen);

  return {
    isOpen,
    setIsOpen,
    toggleOpen,
    nodeNumber,
    setNodeNumber,
    nodeName,
    setNodeName,
    pppUser,
    setPppUser,
    pppPassword,
    setPppPassword,
    lanSubnet,
    setLanSubnet,
    remoteAddress,
    setRemoteAddress,
    protocol,
    setProtocol,
    cpePublicKey,
    setCpePublicKey,
    serverPublicIP,
    setServerPublicIP,
  };
}
