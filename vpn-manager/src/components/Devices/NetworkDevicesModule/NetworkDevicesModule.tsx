import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react';
import { useVpn } from '../../../context';
import { deviceDb, credCache } from '../../../store/deviceDb';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { apiFetch } from '../../../utils/apiClient';
import type { ScannedDevice, SavedDevice } from '../../../types/devices';
import type { NodeInfo } from '../../../types/api';
import {
  CheckCircle2, Cpu, ShieldCheck, ShieldOff, RefreshCw, Loader2, AlertCircle, Radio, KeyRound, Search, Info,
  ChevronDown, ChevronRight, GripVertical, Activity, Eye, PlusCircle, Check, X
} from 'lucide-react';

// Componentes
import { AddDeviceModal } from './components/AddDeviceModal';
import { DeviceCardModal } from './components/DeviceCardModal';
import { DeviceStatusPanel } from './components/DeviceStatusPanel';
import { SshDataModal } from './components/SshDataModal';
import { ColumnPicker } from './components/ColumnPicker';
import M5FullInfoModal from '../../Common/M5FullInfoModal';

// Constantes y utilidades
import { SESSION_SCAN_KEY, COLS_STORAGE_KEY, estimateIpCount, ipInCidr } from './constants';
import { COLUMN_DEFS } from './utils/columns';
import type { ColumnDef, SshAuthStatus, ScanCred } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function NetworkDevicesModule() {
  const { credentials, activeNodeVrf, nodes, setNodes } = useVpn();

  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [scanResults, setScanResults] = useState<ScannedDevice[]>([]);
  const [allScannedIPs, setAllScannedIPs] = useState<string[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [debugMsg, setDebugMsg] = useState('');
  const [scanError, setScanError] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [manualLan, setManualLan] = useState('');
  const [addingDevice, setAddingDevice] = useState<ScannedDevice | null>(null);
  const [editingDevice, setEditingDevice] = useState<SavedDevice | null>(null);
  const [viewingDevice, setViewingDevice] = useState<SavedDevice | null>(null);
  const [viewingRawDevice, setViewingRawDevice] = useState<ScannedDevice | null>(null);
  const [m5DetailDevice, setM5DetailDevice] = useState<ScannedDevice | null>(null);

  const [scanState, setScanState] = useState<{
    phase: 'idle' | 'discovering' | 'authenticating' | 'done';
    current: number;
    total: number;
  }>({ phase: 'idle', current: 0, total: 0 });

  const [sshStatus, setSshStatus] = useState<Record<string, SshAuthStatus>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(COLS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { }
    return COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key);
  });

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState('');
  const [discoveryProgress, setDiscoveryProgress] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSSID, setFilterSSID] = useState('');

  const [nodeSshCreds, setNodeSshCreds] = useState<ScanCred[]>([]);

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  useEffect(() => {
    return () => { readerRef.current?.cancel(); };
  }, []);

  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      setColWidths(prev => ({ ...prev, [r.key]: Math.max(50, r.startW + delta) }));
    };
    const onUp = () => { resizingRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const saveVisibleCols = (cols: string[]) => {
    setVisibleCols(cols);
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(cols)); } catch { }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };

  const toggleSort = (key: string) => {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const lastActiveNodeRef = useRef<string | null>(activeNodeVrf);
  useEffect(() => {
    if (activeNodeVrf !== null && activeNodeVrf !== lastActiveNodeRef.current) {
      if (lastActiveNodeRef.current !== null) {
        setScanResults([]);
        setAllScannedIPs([]);
        setScannedCount(0);
        setScanState({ phase: 'idle', current: 0, total: 0 });
        sessionStorage.removeItem(SESSION_SCAN_KEY);
        if (readerRef.current) {
          readerRef.current.cancel().catch(() => { });
          readerRef.current = null;
        }
      }
      lastActiveNodeRef.current = activeNodeVrf;
    }
  }, [activeNodeVrf]);

  useEffect(() => {
    deviceDb.load().then(devices => {
      setSavedDevices(devices);
      setSavedIds(new Set(devices.map(d => d.id)));
      try {
        const cached = sessionStorage.getItem(SESSION_SCAN_KEY);
        if (cached) {
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
        }
      } catch { }
    });
  }, []);

  const nodesLengthRef = useRef(nodes.length);
  useEffect(() => {
    const prev = nodesLengthRef.current;
    nodesLengthRef.current = nodes.length;
    if (prev > nodes.length) {
      deviceDb.load().then(devices => {
        setSavedDevices(devices);
        setSavedIds(new Set(devices.map(d => d.id)));
      });
    }
  }, [nodes.length]);

  const loadNodes = useCallback(async () => {
    if (!credentials) return;
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }, 20_000);
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      setNodes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando nodos:', err);
    }
  }, [credentials, setNodes]);

  useEffect(() => {
    if (nodes.length === 0 && credentials) loadNodes();
  }, []);

  useEffect(() => {
    if (activeNodeVrf && nodes.length > 0) {
      const active = nodes.find(n => n.nombre_vrf === activeNodeVrf);
      if (active) {
        setSelectedNode(active);
        const subnets = (active.lan_subnets && active.lan_subnets.length > 0) ? active.lan_subnets : (active.segmento_lan ? [active.segmento_lan] : []);
        if (subnets.length > 0) setManualLan(subnets[0]);
      }
    }
  }, [activeNodeVrf, nodes]);

  const prevSelectedNodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    const newId = selectedNode?.id ?? null;
    if (prevSelectedNodeIdRef.current !== null && newId !== prevSelectedNodeIdRef.current) {
      setScanResults([]);
      setAllScannedIPs([]);
      setSshStatus({});
      setNodeSshCreds([]);
      setScannedCount(0);
      setScanState({ phase: 'idle', current: 0, total: 0 });
      try { sessionStorage.removeItem(SESSION_SCAN_KEY); } catch { }
    }
    prevSelectedNodeIdRef.current = newId;
  }, [selectedNode]);

  const activeNode = activeNodeVrf ? nodes.find(n => n.nombre_vrf === activeNodeVrf) ?? null : null;
  const availableSubnets: string[] = activeNode
    ? (() => {
      const subnets = (activeNode.lan_subnets && activeNode.lan_subnets.length > 0) ? activeNode.lan_subnets : (activeNode.segmento_lan ? [activeNode.segmento_lan] : []);
      return [...new Set(subnets)];
    })()
    : [];

  const effectiveLan = manualLan.trim() || selectedNode?.segmento_lan || '';

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

  const runAuthPhase = async (devices: ScannedDevice[], baseCreds: ScanCred[]) => {
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
          let foundStats: any = null;

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
            } catch {
            }
          }

          if (foundStats) {
            const s = foundStats;
            setSshStatus(prev => ({ ...prev, [dev.ip]: 'success' }));
            await credCache.save(devId, foundUser!, foundPass!);

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
  };

  const handleScan = async () => {
    if (!effectiveLan) return;
    if (scanState.phase !== 'idle') return;

    setScanState({ phase: 'discovering', current: 0, total: 0 });
    setSshStatus({});
    setExpandedRows(new Set());
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
        } catch { }
      }

      await runAuthPhase(discoveredDevices, creds);
    } catch (err: unknown) {
      readerRef.current?.cancel();
      readerRef.current = null;
      setScanError(err instanceof Error ? err.message : 'Error desconocido');
      setScanState({ phase: 'idle', current: 0, total: 0 });
    }
  };

  const handleAddDevice = async (device: SavedDevice) => {
    const existingIdx = savedDevices.findIndex(d => d.id === device.id);
    const existingDev = existingIdx >= 0 ? savedDevices[existingIdx] : null;
    const merged: SavedDevice = existingDev
      ? { ...existingDev, ...device, addedAt: existingDev.addedAt }
      : device;

    const current = existingIdx >= 0
      ? savedDevices.map((d, i) => i === existingIdx ? merged : d)
      : [...savedDevices, merged];

    setSavedDevices(current);
    setSavedIds(new Set(current.map(d => d.id)));
    await deviceDb.saveSingle(merged);
    setAddingDevice(null);
    setEditingDevice(null);

    if (merged.sshUser && merged.sshPass && !merged.cachedStats) {
      showToast('Guardado. Conectando SSH para obtener datos…');
      try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/api/device/antenna`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceIP: merged.ip, deviceUser: merged.sshUser,
            devicePass: merged.sshPass, devicePort: merged.sshPort ?? 22,
          }),
        }, 20_000);
        const d = await res.json();
        if (d.success && d.stats) {
          const s = d.stats;
          const enriched: SavedDevice = {
            ...merged, lastSeen: Date.now(),
            name: s.deviceName || merged.name, model: s.deviceModel || merged.model,
            firmware: s.firmwareVersion || merged.firmware, mac: s.wlanMac || merged.mac,
            essid: s.essid ?? merged.essid, frequency: s.frequency ?? merged.frequency,
            deviceName: s.deviceName ?? merged.deviceName, lanMac: s.lanMac ?? merged.lanMac,
            security: s.security ?? merged.security, channelWidth: s.channelWidth ?? merged.channelWidth,
            networkMode: s.networkMode ?? merged.networkMode, chains: s.chains ?? merged.chains,
            apMac: s.apMac ?? merged.apMac, cachedStats: s,
          };
          setSavedDevices(prev => prev.map(d => d.id === enriched.id ? enriched : d));
          await deviceDb.saveSingle(enriched);

          setScanResults(prev => {
            const next = [...prev];
            const idx = next.findIndex(r => r.ip === merged.ip);
            if (idx !== -1) {
              next[idx] = {
                ...next[idx],
                sshUser: merged.sshUser,
                sshPass: merged.sshPass,
                sshPort: merged.sshPort,
                cachedStats: s,
                name: s.deviceName || next[idx].name,
                model: s.deviceModel || next[idx].model,
                firmware: s.firmwareVersion || next[idx].firmware,
                mac: s.wlanMac || next[idx].mac,
                essid: s.essid ?? next[idx].essid,
                frequency: s.frequency ?? next[idx].frequency,
                role: (s.mode === 'ap' || s.mode === 'master') ? 'ap' : s.mode === 'sta' ? 'sta' : next[idx].role,
              };
            }
            return next;
          });
          setSshStatus(prev => ({ ...prev, [merged.ip]: 'success' }));

          showToast('Dispositivo guardado con datos completos');
        } else {
          showToast('Guardado. SSH sin respuesta aún');
        }
      } catch {
        showToast('Guardado. No se pudo conectar por SSH');
      }
    } else {
      showToast(existingDev
        ? 'Dispositivo actualizado'
        : merged.cachedStats ? 'Dispositivo guardado (con estadísticas)' : 'Dispositivo guardado');
    }
  };

  const handleRemoveDevice = async (id: string) => {
    setSavedDevices(prev => prev.filter(d => d.id !== id));
    setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    await deviceDb.removeSingle(id);
    if (viewingDevice?.id === id) setViewingDevice(null);
  };

  const handleUpdateDevice = async (updated: SavedDevice) => {
    setSavedDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
    await deviceDb.saveSingle(updated);
    if (viewingDevice?.id === updated.id) setViewingDevice(updated);
  };

  const isTunnelActive = !!activeNodeVrf;
  const activeNodeName = activeNodeVrf
    ? nodes.find(n => n.nombre_vrf === activeNodeVrf)?.nombre_nodo ?? activeNodeVrf
    : null;
  const canScan = (scanState.phase === 'idle' || scanState.phase === 'done') && !!effectiveLan;
  const isScanning = scanState.phase === 'discovering' || scanState.phase === 'authenticating';

  const scanRows = scanResults.map(dev => {
    const id = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
    return { dev, isSaved: savedIds.has(id), devId: id };
  });

  const uniqueSSIDs = useMemo(() =>
    [...new Set(scanRows.map(({ dev }) => dev.cachedStats?.essid ?? dev.essid).filter(Boolean) as string[])],
    [scanRows]
  );

  const filteredRows = useMemo(() => {
    return scanRows.filter(({ dev }) => {
      const ssid = (dev.cachedStats?.essid ?? dev.essid ?? '').toLowerCase();
      const name = (dev.cachedStats?.deviceName ?? dev.name ?? '').toLowerCase();
      const ip = (dev.ip || '').toLowerCase();
      const mac = (dev.cachedStats?.wlanMac ?? dev.mac ?? '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || ip.includes(q) || name.includes(q) || ssid.includes(q) || mac.includes(q);
      const matchesSSID = !filterSSID || ssid === filterSSID.toLowerCase();
      return matchesSearch && matchesSSID;
    });
  }, [scanRows, searchQuery, filterSSID]);

  const sortedRows = useMemo(() => {
    if (!sortConfig) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      let va: any, vb: any;
      switch (sortConfig.key) {
        case 'ip': va = a.dev.ip; vb = b.dev.ip; break;
        case 'name': va = a.dev.cachedStats?.deviceName ?? a.dev.name;
          vb = b.dev.cachedStats?.deviceName ?? b.dev.name; break;
        case 'essid': va = a.dev.cachedStats?.essid ?? a.dev.essid ?? '';
          vb = b.dev.cachedStats?.essid ?? b.dev.essid ?? ''; break;
        case 'signal': va = a.dev.cachedStats?.signal ?? -999;
          vb = b.dev.cachedStats?.signal ?? -999; break;
        case 'ccq': va = a.dev.cachedStats?.ccq ?? -1;
          vb = b.dev.cachedStats?.ccq ?? -1; break;
        case 'txPower': va = a.dev.cachedStats?.txPower ?? 0;
          vb = b.dev.cachedStats?.txPower ?? 0; break;
        case 'uptime': va = a.dev.cachedStats?.uptimeStr ?? '';
          vb = b.dev.cachedStats?.uptimeStr ?? ''; break;
        default: return 0;
      }
      if (va < vb) return sortConfig.dir === 'asc' ? -1 : 1;
      if (va > vb) return sortConfig.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredRows, sortConfig]);

  const activeConfigCols = visibleCols
    .map(k => COLUMN_DEFS.find(c => c.key === k))
    .filter(Boolean) as ColumnDef[];

  const minTableWidth = [40, 54, 148, 120, ...activeConfigCols.map(c => parseInt(c.width.match(/\d+/)?.[0] || '80') || 80), 32, 180].reduce((a, b) => a + b, 0);

  const gridTemplate = [
    '40px',
    '54px',
    '140px',
    'minmax(100px,1fr)',
    ...activeConfigCols.map(c => colWidths[c.key] != null ? `${colWidths[c.key]}px` : c.width),
    '32px',
    '180px',
  ].join(' ');

  const handleDirectSave = async (dev: ScannedDevice, node: NodeInfo) => {
    if (node.segmento_lan && !ipInCidr(dev.ip, node.segmento_lan)) {
      setAddingDevice(dev);
      return;
    }
    const deviceId = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
    const s = dev.cachedStats;
    const rawMode = s?.mode || dev.role;
    const roleNorm: 'ap' | 'sta' | 'unknown' =
      rawMode === 'ap' || rawMode === 'master' ? 'ap' : rawMode === 'sta' ? 'sta' : 'unknown';
    const saved: SavedDevice = {
      id: deviceId,
      mac: s?.wlanMac || dev.mac,
      ip: dev.ip,
      name: s?.deviceName || dev.name,
      model: s?.deviceModel || dev.model,
      firmware: s?.firmwareVersion || dev.firmware,
      role: roleNorm,
      parentAp: dev.parentAp,
      essid: s?.essid ?? dev.essid,
      frequency: s?.frequency ?? dev.frequency,
      nodeId: node.id,
      nodeName: node.nombre_nodo,
      sshUser: dev.sshUser,
      sshPass: dev.sshPass,
      sshPort: dev.sshPort !== 22 ? dev.sshPort : undefined,
      deviceName: s?.deviceName,
      lanMac: s?.lanMac,
      security: s?.security,
      channelWidth: s?.channelWidth,
      networkMode: s?.networkMode,
      chains: s?.chains,
      apMac: s?.apMac,
      cachedStats: s,
      addedAt: Date.now(),
      lastSeen: Date.now(),
    };
    await handleAddDevice(saved);
  };

  return (
    <div className="space-y-5">

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2
          bg-slate-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-indigo-500" />
            <span>Dispositivos de Red</span>
          </h2>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Descubre y gestiona equipos Ubiquiti en las LANs remotas</p>
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{savedDevices.length}</span> guardados
        </div>
      </div>

      {isTunnelActive ? (
        <div className="card p-4 border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-sky-500/10 flex items-center space-x-3">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/30 shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Túnel activo: <span className="text-emerald-600 dark:text-emerald-400">{activeNodeName}</span></p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">El escaneo se realiza desde este equipo hacia la LAN remota</p>
          </div>
        </div>
      ) : (
        <div className="card p-4 border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 flex items-center space-x-3">
          <ShieldOff className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Sin túnel activo</p>
            <p className="text-xs text-amber-600 dark:text-amber-300/80 mt-0.5">Activa el acceso a un nodo en la pestaña "Nodos" para poder escanear en tiempo real</p>
          </div>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-2">
          <RefreshCw className="w-4 h-4 text-indigo-500" />
          <span>Escanear LAN del nodo</span>
        </h3>

        {isTunnelActive && activeNode ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30 rounded-xl">
              <Radio className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{activeNode.nombre_nodo}</p>
                <p className="text-2xs font-mono text-slate-400 dark:text-slate-500 truncate">{activeNode.nombre_vrf}</p>
              </div>
            </div>

            <div>
              <label className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">
                Subred LAN a escanear
                {availableSubnets.length > 1 && (
                  <span className="ml-1.5 normal-case font-normal text-slate-300">({availableSubnets.length} disponibles)</span>
                )}
              </label>
              {availableSubnets.length > 1 ? (
                <select
                  value={manualLan}
                  onChange={e => setManualLan(e.target.value)}
                  className="input-field w-full text-sm font-mono"
                >
                  {availableSubnets.map((s, idx) => (
                    <option key={`${s}-${idx}`} value={s}>{s} ({estimateIpCount(s)} hosts)</option>
                  ))}
                </select>
              ) : availableSubnets.length === 1 ? (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-xl">
                  <span className="font-mono text-sm font-bold text-sky-600 dark:text-sky-400">{availableSubnets[0]}</span>
                  <span className="text-2xs text-slate-400 dark:text-slate-500 ml-1">· {estimateIpCount(availableSubnets[0])} hosts</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-600">No hay subredes configuradas en este nodo</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <label className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">
              Subred LAN (CIDR) — manual
            </label>
            <input
              value={manualLan}
              onChange={e => setManualLan(e.target.value)}
              placeholder="ej: 10.5.5.0/24"
              className="input-field w-full text-sm font-mono"
            />
            <p className="text-2xs text-slate-400 dark:text-slate-500 mt-1">Activa un túnel en la pestaña Nodos para autocompletar la subred.</p>
          </div>
        )}

        {isTunnelActive && activeNode && (
          <div className="border-t border-slate-100 pt-3 mt-1 flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${nodeSshCreds.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              {nodeSshCreds.length > 0
                ? <span>SSH: <strong>{nodeSshCreds.map(c => c.user).join(', ')}</strong> · {nodeSshCreds.length} credencial{nodeSshCreds.length > 1 ? 'es' : ''}</span>
                : <span>Sin credenciales SSH — configúralas en el nodo (ícono <KeyRound className="w-3 h-3 inline" />)</span>
              }
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={handleScan} disabled={!canScan}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all
              ${canScan
                ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:shadow-lg active:scale-[0.98]'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
          >
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>{isScanning ? `Escaneando ${effectiveLan}...` : 'Escanear dispositivos'}</span>
          </button>
        </div>

        {scanState.phase !== 'idle' && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center text-[11px] font-bold text-slate-600 uppercase tracking-widest">
              <span className="flex items-center space-x-2">
                {scanState.phase === 'done' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                )}
                <span>
                  {scanState.phase === 'discovering' ? 'Buscando dispositivos en la red...' :
                    scanState.phase === 'authenticating' ? 'Probando accesos SSH y extrayendo datos...' :
                      'Escaneo finalizado exitosamente'}
                </span>
              </span>
              {scanState.phase === 'discovering' && (
                <span className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md font-mono">
                  {discoveryProgress} / {estimateIpCount(effectiveLan)} IPs
                </span>
              )}
              {scanState.phase === 'authenticating' && (
                <span className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md font-mono">
                  {scanState.current} / {scanState.total} dispositivos
                </span>
              )}
            </div>

            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden relative">
              {scanState.phase === 'discovering' && (
                <div
                  className="h-full transition-all duration-150 ease-out bg-indigo-500"
                  style={{ width: `${(discoveryProgress / Math.max(1, estimateIpCount(effectiveLan))) * 100}%` }}
                />
              )}
              {scanState.phase === 'authenticating' && (
                <div
                  className="h-full transition-all duration-300 ease-out shadow-sm bg-indigo-500"
                  style={{ width: `${(scanState.current / Math.max(1, scanState.total)) * 100}%` }}
                />
              )}
              {scanState.phase === 'done' && (
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: '100%' }} />
              )}
            </div>
          </div>
        )}

        {debugMsg && !scanError && (
          <div className="flex items-start space-x-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>{debugMsg}</span>
          </div>
        )}
        {scanError && (
          <div className="flex items-start space-x-2 p-3 bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30 rounded-xl">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-600 dark:text-rose-300">{scanError}</p>
          </div>
        )}
        {!isScanning && scannedCount > 0 && scanResults.length === 0 && !scanError && (
          <div className="p-3 bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 rounded-xl space-y-1.5">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Se escanearon {scannedCount} IPs en {effectiveLan} pero ninguna respondió como Ubiquiti airOS
            </p>
            <p className="text-2xs text-amber-500 dark:text-amber-300/80">
              Verifica que el túnel VRF esté activo en la pestaña "Nodos" y que los equipos tengan HTTP habilitado en puerto 80
            </p>
          </div>
        )}

        {/* Estado: escaneando (skeleton) o idle (aún sin escanear) */}
        {scanRows.length === 0 && (
          isScanning ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <div className="skeleton w-5 h-5 rounded-md shrink-0" />
                  <div className="skeleton h-4 w-12 rounded-full" />
                  <div className="skeleton h-3 w-28" />
                  <div className="skeleton h-3 w-40 hidden sm:block" />
                  <div className="skeleton h-3 w-14 ml-auto" />
                </div>
              ))}
            </div>
          ) : !scanError && scannedCount === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 py-12 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
                <Radio className="w-7 h-7 text-indigo-400" />
              </div>
              <div>
                <p className="text-slate-600 dark:text-slate-300 font-semibold">
                  {isTunnelActive ? 'Listo para escanear' : 'Sin túnel activo'}
                </p>
                <p className="text-2xs text-slate-400 dark:text-slate-500 max-w-xs mt-0.5">
                  {isTunnelActive
                    ? `Pulsa “Escanear dispositivos” para descubrir equipos Ubiquiti en ${effectiveLan || 'la subred'}.`
                    : 'Activa el acceso a un nodo en la pestaña “Nodos” para escanear la LAN remota.'}
                </p>
              </div>
            </div>
          ) : null
        )}

        {scanRows.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span>
                  {scanRows.length} dispositivo{scanRows.length !== 1 ? 's' : ''}
                </span>
                {scanRows.filter(r => r.dev.cachedStats).length > 0 && (
                  <>
                    <span className="text-slate-200">·</span>
                    <span className="text-emerald-500">
                      {scanRows.filter(r => r.dev.cachedStats).length} autenticados
                    </span>
                  </>
                )}
                {scanRows.filter(r => r.isSaved).length > 0 && (
                  <>
                    <span className="text-slate-200">·</span>
                    <span className="text-indigo-500">
                      {scanRows.filter(r => r.isSaved).length} guardados
                    </span>
                  </>
                )}
              </p>
              <ColumnPicker visibleCols={visibleCols} onChange={saveVisibleCols} />
            </div>

            <div className="flex flex-wrap gap-2 px-1 py-2 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar IP, nombre, MAC..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-xs">✕</button>
                )}
              </div>
              {uniqueSSIDs.length > 0 && (
                <select
                  value={filterSSID}
                  onChange={e => setFilterSSID(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600"
                >
                  <option value="">Todos los AP</option>
                  {uniqueSSIDs.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
              {(searchQuery || filterSSID) && (
                <span className="text-xs text-slate-400">
                  {sortedRows.length} de {scanRows.length} dispositivos
                </span>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
              <div style={{ minWidth: `${minTableWidth}px` }}>

                <div
                  className="bg-slate-100 border-b border-slate-200 text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider rounded-tl-xl rounded-tr-xl dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                  style={{ display: 'grid', gridTemplateColumns: gridTemplate }}
                >
                  <div className="px-3 py-3 text-center">SSH</div>
                  <div className="px-3 py-3">Rol</div>
                  <div
                    className="px-3 py-3 cursor-pointer select-none flex items-center gap-1 hover:text-slate-700"
                    onClick={() => toggleSort('ip')}
                  >
                    IP / MAC
                    {sortConfig?.key === 'ip' && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                  <div
                    className="px-3 py-3 cursor-pointer select-none flex items-center gap-1 hover:text-slate-700"
                    onClick={() => toggleSort('name')}
                  >
                    Nombre / Modelo
                    {sortConfig?.key === 'name' && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                  {activeConfigCols.map(col => (
                    <div
                      key={col.key}
                      className="px-3 py-3 min-w-0 overflow-hidden select-none flex items-center gap-1 hover:text-slate-700 relative group"
                    >
                      <span className="cursor-pointer flex items-center gap-1 flex-1 min-w-0 truncate" onClick={() => toggleSort(col.key)}>
                        {col.label}
                        {sortConfig?.key === col.key && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
                      </span>
                      <span
                        title="Arrastra para redimensionar"
                        className="cursor-col-resize opacity-0 group-hover:opacity-60 hover:!opacity-100 text-slate-400 shrink-0 select-none"
                        onMouseDown={e => {
                          e.preventDefault();
                          const currentW = colWidths[col.key] ?? (parseInt(col.width) || 80);
                          resizingRef.current = { key: col.key, startX: e.clientX, startW: currentW };
                        }}
                      >
                        <GripVertical className="w-3 h-3" />
                      </span>
                    </div>
                  ))}
                  <div className="px-3 py-3" />
                  <div className="px-3 py-3 text-right">Acción</div>
                </div>

                {sortedRows.map(({ dev, isSaved, devId }, rowIdx) => {
                  const hasStats = !!dev.cachedStats;
                  const isExpanded = expandedRows.has(dev.ip);
                  const rawMode = dev.cachedStats?.mode || dev.role;
                  const isAp = rawMode === 'ap' || rawMode === 'master';
                  const isSta = rawMode === 'sta';
                  const freq = dev.cachedStats?.frequency ?? dev.frequency;
                  const freqGhz = freq ? (freq / 1000).toFixed(1) : null;
                  const displayName = dev.cachedStats?.deviceName ?? (dev.name && dev.name !== dev.ip ? dev.name : null);
                  const displayModel = dev.cachedStats?.deviceModel || dev.model;
                  const displayMac = dev.cachedStats?.wlanMac || dev.mac;

                  return (
                    <Fragment key={dev.ip}>
                      <div
                        style={{ display: 'grid', gridTemplateColumns: gridTemplate }}
                        className={`items-center border-b transition-colors
                        ${isSaved
                            ? `${rowIdx % 2 === 0 ? 'bg-indigo-50/20' : 'bg-indigo-50/40'} hover:bg-indigo-50/70 border-indigo-100`
                            : hasStats
                              ? `${rowIdx % 2 === 0 ? 'bg-emerald-50/25' : 'bg-emerald-50/50'} hover:bg-emerald-50/70 border-emerald-100`
                              : `${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-slate-50/80 border-slate-100`}
                        ${isExpanded ? 'border-b-indigo-200' : ''}`}
                      >
                        <div className="px-2 py-2.5 flex items-center justify-center">
                          {sshStatus[dev.ip] === 'pending' && (
                            <Loader2 className="w-3.5 h-3.5 text-slate-300 animate-spin" />
                          )}
                          {sshStatus[dev.ip] === 'success' && (
                            <div
                              title={`SSH exitoso: ${dev.sshUser}`}
                              className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center border border-emerald-200"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            </div>
                          )}
                          {sshStatus[dev.ip] === 'failed' && (
                            <div
                              title="Sin acceso SSH"
                              className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center border border-slate-200"
                            >
                              <X className="w-3 h-3 text-slate-300" />
                            </div>
                          )}
                          {!sshStatus[dev.ip] && <div className="w-5 h-5" />}
                        </div>

                        <div className="px-3 py-2.5">
                          {(isAp || isSta) ? (
                            <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md
                            ${isAp ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700'}`}>
                              {isAp ? 'AP' : 'CPE'}
                            </span>
                          ) : rawMode && rawMode !== 'unknown' ? (
                            <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                              {String(rawMode).toUpperCase()}
                            </span>
                          ) : (
                            <span
                              className="text-[10px] text-slate-300"
                              title="Modo no detectado"
                            >—</span>
                          )}
                          {freqGhz && (
                            <p className={`text-[9px] font-bold mt-0.5 ${freq! >= 5000 ? 'text-sky-600' : 'text-amber-600'}`}>
                              {freqGhz}G
                            </p>
                          )}
                        </div>

                        <div className="px-3 py-3 min-w-0 pr-3">
                          <a
                            href={`http://${dev.ip}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={`Abrir http://${dev.ip}`}
                            className="font-mono text-sm font-semibold text-slate-700 hover:text-sky-600 hover:underline truncate block"
                          >{dev.ip}</a>
                          {displayMac
                            ? <p className="font-mono text-[9px] text-slate-400 truncate">{displayMac}</p>
                            : <p className="text-[9px] text-amber-500">SSH-only</p>
                          }
                        </div>

                        <div className="px-3 py-3 min-w-0 pr-3">
                          {displayName && displayName !== dev.ip
                            ? <p className="text-sm font-bold text-slate-700 truncate" title={displayName}>{displayName}</p>
                            : <p className="text-sm font-semibold text-slate-400 truncate font-mono" title={dev.ip}>{dev.ip}</p>
                          }
                          <p className="text-[10px] text-slate-400 truncate" title={displayModel}>{displayModel || '—'}</p>
                        </div>

                        {activeConfigCols.map(col => (
                          <div key={col.key} className="px-3 py-3 flex items-center text-sm">
                            {col.render(dev)}
                          </div>
                        ))}

                        <div className="px-1 py-2.5 flex items-center justify-center">
                          {hasStats && (
                            <button
                              onClick={() => setExpandedRows(prev => {
                                const next = new Set(prev);
                                if (next.has(dev.ip)) next.delete(dev.ip);
                                else next.add(dev.ip);
                                return next;
                              })}
                              title={isExpanded ? 'Ocultar detalle' : 'Ver estadísticas completas'}
                              className={`p-1 rounded-md transition-colors
                              ${isExpanded
                                  ? 'text-indigo-600 bg-indigo-100 hover:bg-indigo-200'
                                  : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                            >
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronRight className="w-3.5 h-3.5" />
                              }
                            </button>
                          )}
                        </div>

                        <div className="px-3 py-3 flex items-center justify-end gap-1.5">
                          {hasStats && (
                            <button
                              onClick={() => setM5DetailDevice(dev)}
                              title="Ver estado completo del dispositivo (airOS)"
                              className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition-all"
                            >
                              <Activity className="w-2.5 h-2.5" />
                              <span>Informe</span>
                            </button>
                          )}
                          {hasStats && (
                            <button
                              onClick={() => {
                                if (isSaved) {
                                  const savedDev = savedDevices.find(s => s.id === devId);
                                  if (savedDev) {
                                    const updated: SavedDevice = {
                                      ...savedDev,
                                      cachedStats: dev.cachedStats,
                                      name: dev.cachedStats?.deviceName || savedDev.name,
                                      model: dev.cachedStats?.deviceModel || savedDev.model,
                                      firmware: dev.cachedStats?.firmwareVersion || savedDev.firmware,
                                      mac: dev.cachedStats?.wlanMac || savedDev.mac,
                                      essid: dev.cachedStats?.essid ?? savedDev.essid,
                                      frequency: dev.cachedStats?.frequency ?? savedDev.frequency,
                                      lastSeen: Date.now(),
                                    };
                                    handleUpdateDevice(updated);
                                    showToast('Stats actualizadas en el dispositivo guardado');
                                  }
                                }
                              }}
                              disabled={!isSaved}
                              title={isSaved ? "Sincronizar estadísticas frescas al dispositivo guardado" : "Guarda el dispositivo para sincronizar"}
                              className={`flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${isSaved ? 'bg-sky-50 text-sky-600 hover:bg-sky-100 border-sky-200' : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'}`}
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              <span>Sync</span>
                            </button>
                          )}

                          {(hasStats || isSaved) && (
                            <button
                              onClick={() => {
                                if (isSaved) {
                                  const savedDev = savedDevices.find(s => s.id === devId);
                                  if (savedDev) setViewingDevice(savedDev);
                                } else {
                                  setViewingDevice({
                                    id: devId,
                                    mac: dev.mac,
                                    ip: dev.ip,
                                    name: dev.name,
                                    model: dev.model,
                                    firmware: dev.firmware,
                                    role: dev.role === 'unknown' ? 'ap' : dev.role,
                                    essid: dev.essid,
                                    frequency: dev.frequency,
                                    sshUser: dev.sshUser,
                                    sshPass: dev.sshPass,
                                    sshPort: dev.sshPort,
                                    cachedStats: dev.cachedStats,
                                    nodeId: '',
                                    nodeName: selectedNode?.nombre_nodo || '',
                                    addedAt: Date.now(),
                                    is_active: true,
                                  } as SavedDevice);
                                }
                              }}
                              title={isSaved ? "Ver ficha guardada" : "Ver datos del dispositivo"}
                              className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition-all"
                            >
                              <Eye className="w-2.5 h-2.5" />
                              <span>Ficha</span>
                            </button>
                          )}

                          {!isSaved && selectedNode ? (
                            sshStatus[dev.ip] === 'success' && dev.sshUser ? (
                              <button
                                onClick={() => handleDirectSave(dev, selectedNode)}
                                title="Guardar con las credenciales SSH ya validadas"
                                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-[0.97] whitespace-nowrap"
                              >
                                <Check className="w-3 h-3" />
                                <span>Guardar</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => setAddingDevice(dev)}
                                title="Guardar dispositivo — ingresar credenciales SSH manualmente"
                                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all active:scale-[0.97] whitespace-nowrap"
                              >
                                <PlusCircle className="w-3 h-3" />
                                <span>Guardar</span>
                              </button>
                            )
                          ) : !isSaved ? (
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">Sin nodo</span>
                          ) : null}
                        </div>
                      </div>

                      {isExpanded && (
                        <DeviceStatusPanel
                          dev={dev}
                          onRefresh={(freshStats) => {
                            setScanResults(prev => prev.map(r =>
                              r.ip === dev.ip ? { ...r, cachedStats: freshStats } : r
                            ));
                          }}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>


      {viewingRawDevice && (
        <SshDataModal dev={viewingRawDevice} onClose={() => setViewingRawDevice(null)} />
      )}

      {addingDevice && selectedNode && (
        <AddDeviceModal
          device={addingDevice}
          node={selectedNode}
          onSave={handleAddDevice}
          onClose={() => setAddingDevice(null)}
        />
      )}

      {editingDevice && (
        <AddDeviceModal
          device={editingDevice}
          node={nodes.find(n => n.id === editingDevice.nodeId) ?? {
            id: editingDevice.nodeId,
            nombre_nodo: editingDevice.nodeName,
            ppp_user: '', segmento_lan: '', nombre_vrf: '',
            service: 'sstp' as const, disabled: false, running: false,
            ip_tunnel: '', uptime: '',
          }}
          existing={{
            sshUser: editingDevice.sshUser,
            sshPass: editingDevice.sshPass,
            sshPort: editingDevice.sshPort,
            routerPort: editingDevice.routerPort,
          }}
          onSave={handleAddDevice}
          onClose={() => setEditingDevice(null)}
        />
      )}

      {viewingDevice && (
        <DeviceCardModal
          device={viewingDevice}
          onClose={() => setViewingDevice(null)}
          onRemove={() => handleRemoveDevice(viewingDevice.id)}
          onUpdate={handleUpdateDevice}
        />
      )}

      {m5DetailDevice && (
        <M5FullInfoModal dev={m5DetailDevice} onClose={() => setM5DetailDevice(null)} />
      )}
    </div>
  );
}
