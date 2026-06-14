// ============================================================
//  useApPollEvents (E1/Etapa 2) — escucha el evento SSE 'ap-poll'
//  emitido por el apPollJob del backend y lo entrega al consumidor.
//  Reusa el stream existente /api/events/stream (room por workspace).
// ============================================================
import { useEffect, useRef } from 'react';
import { API_BASE_URL } from '../../../../config';

interface ApPollEvent {
  apId: string;
  stations?: unknown[];
  polledAt?: number;
  error?: string;
}

export function useApPollEvents(onEvent: (e: ApPollEvent) => void, enabled: boolean) {
  const cbRef = useRef(onEvent);
  useEffect(() => { cbRef.current = onEvent; });

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(`${API_BASE_URL}/api/events/stream`, { withCredentials: true });
    const handler = (e: MessageEvent) => {
      try { cbRef.current(JSON.parse(e.data)); } catch { /* ignora payloads no-JSON */ }
    };
    es.addEventListener('ap-poll', handler as EventListener);
    return () => {
      es.removeEventListener('ap-poll', handler as EventListener);
      es.close();
    };
  }, [enabled]);
}
