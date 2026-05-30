import { useState, useRef, useEffect, useCallback } from 'react';
import type { PollResult } from '../../../types/apMonitor';
import type { SavedDevice } from '../../../types/devices';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../config';
import { deviceDb } from '../../../store/deviceDb';

const BASE = `${API_BASE_URL}/api/ap-monitor`;

export function usePolling(devices: SavedDevice[], activeNodeName: string | null) {
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

  const [pollInterval, setPollInterval] = useState<number>(() => {
    const saved = localStorage.getItem('vpn_ap_poll_ms');
    return saved ? parseInt(saved, 10) : 30_000;
  });
  const pollIntervalRef = useRef(pollInterval);

  const pollTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const devicesRef = useRef(devices);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const autoPolledRef = useRef(false);

  const pollApDirect = useCallback(async (apId: string, scheduleNext = true, saveCount = false) => {
    const dev = devicesRef.current.find(d => d.id === apId);
    if (!dev) return;

    setPollResults(prev => ({
      ...prev,
      [apId]: { ...(prev[apId] ?? { stations: [] }), loading: true, polledAt: prev[apId]?.polledAt ?? 0 },
    }));

    try {
      const res = await fetchWithTimeout(`${BASE}/poll-direct`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apId,
          ip: dev.ip,
          port: dev.sshPort ?? 22,
          user: dev.sshUser ?? '',
          pass: dev.sshPass ?? '',
          firmware: dev.firmware ?? '',
          saveHistory: false,
        }),
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
        setPollResults(prev => ({ ...prev, [apId]: { ...(prev[apId] ?? { stations: [] }), loading: false, error: data.message } }));
      }
    } catch (e) {
      setPollResults(prev => ({
        ...prev,
        [apId]: { ...(prev[apId] ?? { stations: [] }), loading: false, error: e instanceof Error ? e.message : 'Error SSH' },
      }));
    }

    if (scheduleNext && pollIntervalRef.current > 0) {
      if (Object.keys(pollTimers.current).some(id => id === apId)) {
        pollTimers.current[apId] = window.setTimeout(() => pollApDirect(apId, true), pollIntervalRef.current);
      } else {
        delete pollTimers.current[apId];
      }
    }
  }, []);

  return {
    pollResults,
    setPollResults,
    pollInterval,
    setPollInterval,
    pollIntervalRef,
    pollTimers,
    pollApDirect,
    pollResultsRef,
    autoPolledRef,
  };
}
