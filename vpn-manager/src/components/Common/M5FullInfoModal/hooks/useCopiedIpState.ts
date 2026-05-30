import { useState } from 'react';

export function useCopiedIpState(ip: string) {
  const [copiedIp, setCopiedIp] = useState(false);

  const copyIp = () => {
    navigator.clipboard.writeText(ip).then(() => {
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 1500);
    });
  };

  return { copiedIp, copyIp };
}
