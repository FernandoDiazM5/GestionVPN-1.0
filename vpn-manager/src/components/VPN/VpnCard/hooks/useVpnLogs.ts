import { useState, useEffect, useRef } from 'react';
import type { VpnSecret } from '../types';

interface UseVpnLogsReturn {
  logs: string[];
  addLog: (msg: string) => void;
  logsEndRef: React.RefObject<HTMLDivElement | null>;
}

export function useVpnLogs(vpn: VpnSecret): UseVpnLogsReturn {
  const [logs, setLogs] = useState<string[]>(
    vpn.running ? [`Sincronizado · IP ${vpn.ip ?? 'en resolución'}`] : [],
  );
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-10), msg]);

  return { logs, addLog, logsEndRef };
}
