import { useState, useRef, useEffect, useCallback } from 'react';
import type { PollResult, LiveCpe } from '../../../../types/apMonitor';
import type { SavedDevice } from '../../../../types/devices';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import { deviceDb } from '../../../../store/deviceDb';

const BASE = `${API_BASE_URL}/api/ap-monitor`;
export const AP_POLL_CACHE_KEY = 'apMonitorPollResults_v2';
export const AP_POLL_CACHE_TTL_MS = 5 * 60_000;
export const AP_POLL_PERSIST_INTERVAL_MS = 1_500;
const LEGACY_AP_POLL_CACHE_KEY = 'apMonitorPollResults';
const MAX_CACHED_APS = 100;
const MAX_CACHED_STATIONS_PER_AP = 250;

interface PollCachePayload {
  version: 2;
  savedAt: number;
  results: Record<string, PollResult>;
}

type PollCacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function compactStation(station: LiveCpe): LiveCpe {
  const {
    mac, signal, noisefloor, remote_signal, ccq, tx_rate, rx_rate,
    airmax_quality, airmax_capacity, airmax_dcap, airmax_ucap,
    airmax_cinr_rx, airmax_tx_usage, airmax_rx_usage,
    throughputRxKbps, throughputTxKbps, uptimeStr, distance, lastip,
    remote_hostname, cpe_name, hostname, cpe_product, modelo,
    firmware_family, isKnown,
  } = station;
  return {
    mac, signal, noisefloor, remote_signal, ccq, tx_rate, rx_rate,
    airmax_quality, airmax_capacity, airmax_dcap, airmax_ucap,
    airmax_cinr_rx, airmax_tx_usage, airmax_rx_usage,
    throughputRxKbps, throughputTxKbps, uptimeStr, distance, lastip,
    remote_hostname, cpe_name, hostname, cpe_product, modelo,
    firmware_family, isKnown,
  };
}

export function compactPollResults(results: Record<string, PollResult>): Record<string, PollResult> {
  return Object.fromEntries(
    Object.entries(results)
      .sort(([, a], [, b]) => (b.polledAt ?? 0) - (a.polledAt ?? 0))
      .slice(0, MAX_CACHED_APS)
      .map(([apId, result]) => [apId, {
        stations: result.stations.slice(0, MAX_CACHED_STATIONS_PER_AP).map(compactStation),
        polledAt: result.polledAt,
        loading: false,
      }]),
  );
}

export function readPollResultsCache(
  storage: PollCacheStorage,
  now = Date.now(),
): Record<string, PollResult> {
  try {
    storage.removeItem(LEGACY_AP_POLL_CACHE_KEY);
    const raw = storage.getItem(AP_POLL_CACHE_KEY);
    if (!raw) return {};
    const payload = JSON.parse(raw) as Partial<PollCachePayload>;
    const age = now - Number(payload.savedAt);
    if (payload.version !== 2 || !Number.isFinite(age) || age < 0 || age > AP_POLL_CACHE_TTL_MS
      || !payload.results || typeof payload.results !== 'object' || Array.isArray(payload.results)) {
      storage.removeItem(AP_POLL_CACHE_KEY);
      return {};
    }
    return compactPollResults(payload.results);
  } catch {
    try { storage.removeItem(AP_POLL_CACHE_KEY); } catch { /* storage unavailable */ }
    return {};
  }
}

export function persistPollResultsCache(
  storage: PollCacheStorage,
  results: Record<string, PollResult>,
  now = Date.now(),
): boolean {
  try {
    const payload: PollCachePayload = {
      version: 2,
      savedAt: now,
      results: compactPollResults(results),
    };
    storage.setItem(AP_POLL_CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function usePolling(devices: SavedDevice[], _activeNodeName: string | null, onTunnelInactive?: (message: string) => void) {
  const [pollResults, setPollResults] = useState<Record<string, PollResult>>(() => {
    try {
      return readPollResultsCache(sessionStorage);
    } catch { /* storage unavailable */ }
    return {};
  });

  const persistenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPollResultsRef = useRef(pollResults);
  const hasPendingPersistenceRef = useRef(false);
  const persistenceDisabledRef = useRef(false);
  const persistenceReadyRef = useRef(false);

  useEffect(() => {
    pendingPollResultsRef.current = pollResults;
    if (!persistenceReadyRef.current) {
      persistenceReadyRef.current = true;
      return;
    }
    hasPendingPersistenceRef.current = true;
    if (persistenceDisabledRef.current || persistenceTimerRef.current) return;
    persistenceTimerRef.current = setTimeout(() => {
      persistenceTimerRef.current = null;
      hasPendingPersistenceRef.current = false;
      try {
        persistenceDisabledRef.current = !persistPollResultsCache(
          sessionStorage,
          pendingPollResultsRef.current,
        );
      } catch {
        persistenceDisabledRef.current = true;
      }
    }, AP_POLL_PERSIST_INTERVAL_MS);
  }, [pollResults]);

  useEffect(() => () => {
    if (persistenceTimerRef.current) clearTimeout(persistenceTimerRef.current);
    if (!hasPendingPersistenceRef.current || persistenceDisabledRef.current) return;
    try { persistPollResultsCache(sessionStorage, pendingPollResultsRef.current); } catch { /* storage unavailable */ }
  }, []);

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
