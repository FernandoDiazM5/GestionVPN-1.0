// ============================================================
//  useDeviceScan — escaneo SSE de subred + autenticación SSH
//
//  Encapsula el ciclo completo de descubrimiento:
//   1. POST /api/node/scan-stream (SSE) → ScannedDevice[]
//   2. Para cada device: probar credenciales SSH en orden
//      (cred saved → cred cached → cred del nodo)
//   3. Persistir resultado en sessionStorage (sobrevive a F5)
//   4. Cancelar reader si el componente se desmonta o cambia el VRF
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { apiFetch } from '../../../../utils/apiClient';
import { credCache } from '../../../../store/deviceDb';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../../../../types/devices';
import type { NodeInfo } from '../../../../types/api';
import { SESSION_SCAN_KEY, estimateIpCount } from '../constants';
import type { SshAuthStatus, ScanCred, ScanState } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface UseDeviceScanInput {
  activeNodeVrf: string | null;
  nodes: NodeInfo[];
  effectiveLan: string;
  savedDevices: SavedDevice[];
  nodeSshCreds: ScanCred[];
  setNodeSshCreds: (creds: ScanCred[]) => void;
}

export function useDeviceScan(input: UseDeviceScanInput) {
  const { activeNodeVrf, nodes, effectiveLan, savedDevices, nodeSshCreds, setNodeSshCreds } = input;

  const [scanResults, setScanResults] = useState<ScannedDevice[]>([]);
  const [allScannedIPs, setAllScannedIPs] = useState<string[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [debugMsg, setDebugMsg] = useState('');
  const [scanError, setScanError] = useState('');
  const [sshStatus, setSshStatus] = useState<Record<string, SshAuthStatus>>({});
  const [discoveryProgress, setDiscoveryProgress] = useState(0);
  const [scanState, setScanState] = useState<ScanState>({ phase: 'idle', current: 0, total: 0 });

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Cancelar reader si el componente se desmonta a mitad de scan
  useEffect(() => () => { readerRef.current?.cancel(); }, []);

  // Hidratar desde sessionStorage al montar (sobrevive a refresh dentro del túnel actual).
  // Es un efecto de UNA SOLA VEZ: sincronizamos el state de React con un almacén
  // externo. El plugin react-hooks/set-state-in-effect lo advierte como cascada,
  // pero aquí ES el patrón correcto (no hay lazy init equivalente con 5 estados
  // interdependientes).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(SESSION_SCAN_KEY);
      if (!cached) return;
      const { results, allIPs, count, debug, sshStatus: cachedStatus } = JSON.parse(cached);
      if (Array.isArray(results) && results.length > 0) {
        setScanResults(results);
        setAllScannedIPs(allIPs ?? []);
        setScannedCount(count ?? 0);
        setDebugMsg(debug ?? '');
        if (cachedStatus && typeof cachedStatus === 'object') {
          setSshStatus(cachedStatus as Record<string, SshAuthStatus>);
        } else {
          const derived: Record<string, SshAuthStatus> = {};
          (results as Array<{ ip: string; cachedStats?: unknown }>).forEach(dev => {
            derived[dev.ip] = dev.cachedStats ? 'success' : 'failed';
          });
          setSshStatus(derived);
        }
      }
    } catch { /* sessionStorage corrupto → ignorar */ }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reset COMPLETO al cambiar de túnel activo (otro VRF = otra LAN = otro escaneo)
  const lastActiveNodeRef = useRef<string | null>(activeNodeVrf);
  useEffect(() => {
    if (activeNodeVrf !== null && activeNodeVrf !== lastActiveNodeRef.current) {
      if (lastActiveNodeRef.current !== null) {
        setScanResults([]);
        setAllScannedIPs([]);
        setScannedCount(0);
        setScanState({ phase: 'idle', current: 0, total: 0 });
        sessionStorage.removeItem(SESSION_SCAN_KEY);
        readerRef.current?.cancel().catch(() => { });
        readerRef.current = null;
      }
      lastActiveNodeRef.current = activeNodeVrf;
    }
  }, [activeNodeVrf]);

  // Barra de progreso animada durante "discovering" (estimación basada en CIDR).
  // Effect → setInterval → setState es el patrón canónico de animaciones derivadas
  // de tiempo. Suprimimos la advertencia genérica del plugin.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (scanState.phase !== 'discovering') {
      setDiscoveryProgress(0);
      return;
    }
    const total = estimateIpCount(effectiveLan);
    setDiscoveryProgress(0);
    const msPerIp = Math.max(20, Math.round(13000 / total));
    const timer = setInterval(() => {
      setDiscoveryProgress(p => {
        if (p >= total) { clearInterval(timer); return total; }
        return p + 1;
      });
    }, msPerIp);
    return () => clearInterval(timer);
  }, [scanState.phase, effectiveLan]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persistir en sessionStorage cuando el scan termina con resultados
  useEffect(() => {
    if (scanState.phase === 'done' && scanResults.length > 0) {
      sessionStorage.setItem(SESSION_SCAN_KEY, JSON.stringify({
        results: scanResults, allIPs: allScannedIPs, count: scannedCount, debug: debugMsg,
        sshStatus,
      }));
      const t = setTimeout(() => setScanState({ phase: 'idle', current: 0, total: 0 }), 3000);
      return () => clearTimeout(t);
    }
  }, [scanState.phase, scanResults, allScannedIPs, scannedCount, debugMsg, sshStatus]);

  // ── Fase de autenticación SSH (por batches de 3 para no saturar) ──
  const runAuthPhase = useCallback(async (devices: ScannedDevice[], baseCreds: ScanCred[]) => {
    if (devices.length === 0) return;

    const initialStatus: Record<string, SshAuthStatus> = {};
    devices.forEach(d => { initialStatus[d.ip] = 'pending'; });
    setSshStatus(initialStatus);
    setScanState({ phase: 'authenticating', current: 0, total: devices.length });
    let completed = 0;
    const batchSize = 3;

    for (let i = 0; i < devices.length; i += batchSize) {
      const batch = devices.slice(i, i + batchSize);

      await Promise.all(batch.map(async (dev) => {
        try {
          const devId = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
          const savedDev = savedDevices.find(s => s.id === devId);
          const cachedCred = await credCache.get(devId);

          let effectiveCreds = [...baseCreds];
          if (savedDev?.sshUser && savedDev?.sshPass) {
            effectiveCreds = effectiveCreds.filter(c => !(c.user === savedDev.sshUser && c.pass === savedDev.sshPass));
            effectiveCreds.unshift({ user: savedDev.sshUser, pass: savedDev.sshPass });
          }
          if (cachedCred?.user && cachedCred?.pass) {
            effectiveCreds = effectiveCreds.filter(c => !(c.user === cachedCred.user && c.pass === cachedCred.pass));
            effectiveCreds.unshift({ user: cachedCred.user, pass: cachedCred.pass });
          }

          if (effectiveCreds.length === 0) {
            completed++;
            setScanState(s => ({ ...s, current: completed }));
            return;
          }

          let foundUser = '';
          let foundPass = '';
          let foundStats: AntennaStats | null = null;

          for (const cred of effectiveCreds) {
            try {
              const res = await fetchWithTimeout(`${API_BASE_URL}/api/device/antenna`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  deviceIP: dev.ip,
                  deviceUser: cred.user,
                  devicePass: cred.pass,
                  devicePort: 22,
                }),
              }, 20_000);
              const d = await res.json();
              if (d.success && d.stats && (d.stats.signal != null || d.stats.txRate != null || d.stats.deviceName != null || d.stats.firmwareVersion != null)) {
                foundUser = cred.user;
                foundPass = cred.pass;
                foundStats = d.stats;
                break;
              } else if (d.success && d.stats?.raw) {
                foundUser = cred.user;
                foundPass = cred.pass;
                foundStats = d.stats;
                break;
              }
            } catch { /* siguiente credencial */ }
          }

          if (foundStats) {
            const s = foundStats;
            setSshStatus(prev => ({ ...prev, [dev.ip]: 'success' }));
            await credCache.save(devId, foundUser, foundPass);

            setScanResults(prev => {
              const next = [...prev];
              const idx = next.findIndex(d => d.ip === dev.ip);
              if (idx !== -1) {
                next[idx] = {
                  ...next[idx],
                  sshUser: foundUser,
                  sshPass: foundPass,
                  sshPort: 22,
                  cachedStats: s,
                  name: s.deviceName || next[idx].name,
                  model: s.deviceModel || next[idx].model,
                  firmware: s.firmwareVersion || next[idx].firmware,
                  mac: s.wlanMac || next[idx].mac,
                  essid: s.essid || next[idx].essid,
                  frequency: s.frequency || next[idx].frequency,
                  role: (s.mode === 'ap' || s.mode === 'master') ? 'ap' : s.mode === 'sta' ? 'sta' : next[idx].role,
                };
              }
              return next;
            });
          } else {
            setSshStatus(prev => ({ ...prev, [dev.ip]: 'failed' }));
          }
        } catch {
          setSshStatus(prev => ({ ...prev, [dev.ip]: 'failed' }));
        } finally {
          completed++;
          setScanState(s => ({ ...s, current: completed }));
        }
      }));
    }

    setScanState(s => ({ ...s, phase: 'done' }));
  }, [savedDevices]);

  // ── Handler principal: lanza el SSE + dispara la fase de auth al cerrar ──
  const handleScan = useCallback(async () => {
    if (!effectiveLan) return;
    if (scanState.phase !== 'idle') return;

    setScanState({ phase: 'discovering', current: 0, total: 0 });
    setSshStatus({});
    setScanError('');
    setScanResults([]);
    setAllScannedIPs([]);
    setScannedCount(0);
    setDebugMsg('');
    sessionStorage.removeItem(SESSION_SCAN_KEY);

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/node/scan-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeLan: effectiveLan }),
      });
      if (!res.ok || !res.body) throw new Error('Error en el inicio del escaneo asíncrono');

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      let discoveredDevices: ScannedDevice[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          const linesSplit = block.split('\n');
          const eventLine = linesSplit.find(l => l.startsWith('event:'));
          const dataLine = linesSplit.find(l => l.startsWith('data:'));
          if (!eventLine || !dataLine) continue;

          const eventName = eventLine.replace('event:', '').trim();
          const dataCode = dataLine.replace('data:', '').trim();
          if (!dataCode) continue;

          let data: unknown;
          try {
            data = JSON.parse(dataCode);
          } catch (parseErr) {
            console.warn('[scan-stream] malformed JSON chunk, skipping:', parseErr);
            continue;
          }

          if (eventName === 'progress') {
            const d = data as { scanned: number; found?: ScannedDevice[] };
            setScannedCount(d.scanned);
            if (d.found && d.found.length > 0) {
              setScanResults(prev => {
                const map = new Map(prev.map(r => [r.ip, r]));
                d.found!.forEach((dev: ScannedDevice) => map.set(dev.ip, dev));
                return Array.from(map.values());
              });
            }
          } else if (eventName === 'complete') {
            const d = data as { devices?: ScannedDevice[]; total: number };
            discoveredDevices = d.devices || discoveredDevices;
            setScanResults(discoveredDevices);
            setAllScannedIPs(discoveredDevices.map((dev: ScannedDevice) => dev.ip));
            setScannedCount(d.total);
            setDebugMsg(`Escaneadas ${d.total} IPs — ${discoveredDevices.length} encontrados`);
          } else if (eventName === 'error') {
            const d = data as { message?: string };
            throw new Error(d.message);
          }
        }
      }

      readerRef.current = null;

      let creds: ScanCred[] = nodeSshCreds;
      const activeNode2 = activeNodeVrf ? nodes.find(n => n.nombre_vrf === activeNodeVrf) : null;
      if (activeNode2?.ppp_user) {
        try {
          const cr = await fetchWithTimeout(`${API_BASE_URL}/api/node/ssh-creds/get`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pppUser: activeNode2.ppp_user }),
          }, 5_000);
          const cd = await cr.json();
          if (cd.success && Array.isArray(cd.creds) && cd.creds.length > 0) {
            creds = cd.creds.filter((c: ScanCred) => c.user);
            setNodeSshCreds(creds);
          }
        } catch { /* sin creds del nodo → usar nodeSshCreds existentes */ }
      }

      await runAuthPhase(discoveredDevices, creds);
    } catch (err: unknown) {
      readerRef.current?.cancel();
      readerRef.current = null;
      setScanError(err instanceof Error ? err.message : 'Error desconocido');
      setScanState({ phase: 'idle', current: 0, total: 0 });
    }
  }, [effectiveLan, scanState.phase, activeNodeVrf, nodes, nodeSshCreds, setNodeSshCreds, runAuthPhase]);

  const isScanning = scanState.phase === 'discovering' || scanState.phase === 'authenticating';
  const canScan = (scanState.phase === 'idle' || scanState.phase === 'done') && !!effectiveLan;

  return {
    // Estado de scan
    scanResults, setScanResults,
    allScannedIPs,
    scannedCount,
    debugMsg,
    scanError,
    sshStatus, setSshStatus,
    discoveryProgress,
    scanState,

    // Acciones
    handleScan,

    // Computed
    isScanning,
    canScan,
  };
}
