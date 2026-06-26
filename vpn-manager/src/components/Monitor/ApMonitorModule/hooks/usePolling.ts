import { useState, useRef, useEffect, useCallback } from 'react';
import type { PollResult, LiveCpe } from '../../../../types/apMonitor';
import type { SavedDevice } from '../../../../types/devices';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import { deviceDb } from '../../../../store/deviceDb';

const BASE = `${API_BASE_URL}/api/ap-monitor`;

export function usePolling(devices: SavedDevice[], _activeNodeName: string | null, onTunnelInactive?: (message: string) => void) {
  const [pollResults, setPollResults] = useState<Record<string, PollResult>>(() => {
    try {
      const saved = sessionStorage.getItem('apMonitorPollResults');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return {};
  });
  useEffect(() => {
    sessionStorage.setItem('apMonitorPollResults', JSON.stringify(pollResults));
  }, [pollResults]);

  const pollResultsRef = useRef(pollResults);
  useEffect(() => { pollResultsRef.current = pollResults; }, [pollResults]);

  const devicesRef = useRef(devices);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  // E1/Etapa 3: pollApDirect es una acción MANUAL de un solo tiro (botón
  // "Sync ahora"/"Sincronizar todo"). El polling recurrente vive en el backend
  // (apPollJob) y llega por SSE; ya no hay timers de polling en el navegador.
  const pollApDirect = useCallback(async (apId: string, saveCount = false) => {
    const dev = devicesRef.current.find(d => d.id === apId);
    if (!dev) return;

    setPollResults(prev => ({
      ...prev,
      [apId]: { ...(prev[apId] ?? { stations: [] }), loading: true, polledAt: prev[apId]?.polledAt ?? 0 },
    }));

    try {
      // C4: solo enviamos apId. IP, puerto, firmware y credenciales SSH se
      // resuelven server-side desde la DB (cifradas) — nunca viajan por el navegador.
      // E2: el sync MANUAL (saveCount) persiste un punto en signal_history.
      const res = await fetchWithTimeout(`${BASE}/poll-direct`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apId, saveHistory: saveCount }),
      }, 20_000);
      const data = await res.json();
      if (data.success) {
        setPollResults(prev => ({ ...prev, [apId]: { stations: data.stations || [], polledAt: data.polledAt, loading: false } }));
        if (saveCount) {
          const count = (data.stations || []).length;
          const updatedDev = { ...dev, lastCpeCount: count, lastCpeCountAt: Date.now() };
          await deviceDb.saveSingle(updatedDev);
        }
      } else {
        // Túnel del nodo no activo → aviso con opción de activarlo (no es error de SSH).
        if (data.code === 'TUNNEL_NOT_ACTIVE') onTunnelInactive?.(data.message);
        setPollResults(prev => ({ ...prev, [apId]: { ...(prev[apId] ?? { stations: [] }), loading: false, error: data.message } }));
      }
    } catch (e) {
      setPollResults(prev => ({
        ...prev,
        [apId]: { ...(prev[apId] ?? { stations: [] }), loading: false, error: e instanceof Error ? e.message : 'Error SSH' },
      }));
    }
  }, [onTunnelInactive]);

  // ── E1/Etapa 2: heartbeat + seed desde BD + ingest de SSE ──────────────
  // pingWatch: avisa al backend "estoy mirando" (el apPollJob solo pollea
  // workspaces con heartbeat reciente → SSH solo mientras la vista está abierta).
  const pingWatch = useCallback(() => {
    fetchWithTimeout(`${BASE}/watch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }, 5_000).catch(() => { /* no-fatal */ });
  }, []);

  // seedFromDb: pinta inmediato las estaciones ya conocidas (cpes.last_stats)
  // sin esperar a un poll. No pisa un resultado más fresco que ya tengamos.
  const seedFromDb = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${BASE}/stations`, {}, 10_000);
      const data = await res.json();
      if (!data.success || !data.aps) return;
      setPollResults(prev => {
        const next = { ...prev };
        for (const [apId, info] of Object.entries(data.aps as Record<string, { stations: LiveCpe[]; polledAt: number }>)) {
          const cur = prev[apId];
          if (!cur || (info.polledAt ?? 0) >= (cur.polledAt ?? 0)) {
            next[apId] = { stations: info.stations || [], polledAt: info.polledAt || 0, loading: false };
          }
        }
        return next;
      });
    } catch { /* no-fatal */ }
  }, []);

  // ingestApPoll: aplica un evento SSE 'ap-poll' del backend.
  const ingestApPoll = useCallback((ev: { apId: string; stations?: LiveCpe[]; polledAt?: number; error?: string }) => {
    if (!ev?.apId) return;
    setPollResults(prev => ({
      ...prev,
      [ev.apId]: ev.error
        ? { ...(prev[ev.apId] ?? { stations: [] }), loading: false, error: ev.error }
        : { stations: ev.stations || [], polledAt: ev.polledAt || Date.now(), loading: false },
    }));
  }, []);

  return {
    pollResults,
    setPollResults,
    pollApDirect,
    pollResultsRef,
    pingWatch,
    seedFromDb,
    ingestApPoll,
  };
}
