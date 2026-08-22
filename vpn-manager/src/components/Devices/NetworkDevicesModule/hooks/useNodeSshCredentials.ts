import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../../../config';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import type { ScanCred } from '../types';

export type NodeSshCredsStatus = 'idle' | 'loading' | 'ready' | 'forbidden' | 'error';

export function useNodeSshCredentials(pppUser: string | null | undefined) {
  const [creds, setCreds] = useState<ScanCred[]>([]);
  const [status, setStatus] = useState<NodeSshCredsStatus>('idle');
  const [error, setError] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (targetPppUser: string, signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setCreds([]);
    setError('');
    setStatus('loading');
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/node/ssh-creds/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: targetPppUser }), signal,
      }, 5_000);
      const data = await response.json();
      if (currentRequest !== requestId.current) return;
      if (response.status === 403) {
        setLoadedFor(targetPppUser);
        setStatus('forbidden');
        setError(data.message || 'Tu rol no permite consultar las credenciales del nodo.');
        return;
      }
      if (!response.ok || !data.success) throw new Error(data.message || 'No se pudieron consultar las credenciales SSH.');
      setCreds(Array.isArray(data.creds) ? data.creds.filter((cred: ScanCred) => cred.user && cred.pass) : []);
      setLoadedFor(targetPppUser);
      setStatus('ready');
    } catch (reason) {
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setLoadedFor(targetPppUser);
      setStatus('error');
      setError(reason instanceof Error ? reason.message : 'No se pudieron consultar las credenciales SSH.');
    }
  }, []);

  useEffect(() => {
    if (!pppUser) {
      requestId.current++;
      setCreds([]); setError(''); setLoadedFor(null); setStatus('idle');
      return;
    }
    const controller = new AbortController();
    void load(pppUser, controller.signal);
    return () => controller.abort();
  }, [pppUser, load]);

  const matchesActiveNode = !pppUser || loadedFor === pppUser;
  return {
    creds: matchesActiveNode ? creds : [],
    status: pppUser && !matchesActiveNode ? 'loading' as const : status,
    error: matchesActiveNode ? error : '',
    reload: () => pppUser && load(pppUser),
  };
}
