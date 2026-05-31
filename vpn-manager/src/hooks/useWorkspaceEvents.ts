// ============================================================
//  useWorkspaceEvents (Fase 4) — SSE en tiempo real
//  Escucha /api/events/stream (cookie) y dispara onEvent por cada
//  evento 'tunnel'. El navegador reconecta solo ante caídas.
// ============================================================
import { useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config';

interface TunnelEvent {
  tunnelId: string;
  action: string;
  userId: string | null;
  ts: number;
}

export function useWorkspaceEvents(onEvent: (e: TunnelEvent) => void, enabled: boolean) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(`${API_BASE_URL}/api/events/stream`, { withCredentials: true });
    const handler = (e: MessageEvent) => {
      try { cbRef.current(JSON.parse(e.data)); } catch { /* ignora payloads no-JSON */ }
    };
    es.addEventListener('tunnel', handler as EventListener);
    return () => {
      es.removeEventListener('tunnel', handler as EventListener);
      es.close();
    };
  }, [enabled]);
}
