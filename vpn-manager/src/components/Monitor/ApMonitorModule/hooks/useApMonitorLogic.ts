import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { SavedDevice, AntennaStats } from '../../../../types/devices';
import type { NodeInfo } from '../../../../types/api';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import { deviceDb } from '../../../../store/deviceDb';
import type { NodeGroup } from '../utils/types';

export function useApMonitorLogic(nodes: NodeInfo[], activeNodeName: string | null) {
  const [devices, setDevices] = useState<SavedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [apSearch, setApSearch] = useState('');
  const [nodeFilter, setNodeFilter] = useState<'active' | 'inactive' | 'all'>('active');

  const [cpeDetailTarget, setCpeDetailTarget] = useState<{
    mac: string; apId: string; ip: string | null;
    sshPort: number; sshUser: string; sshPass: string;
  } | null>(null);
  const [apDetailDev, setApDetailDev] = useState<SavedDevice | null>(null);
  const [m5DetailDevice, setM5DetailDevice] = useState<SavedDevice | null>(null);
  const [viewingApDevice, setViewingApDevice] = useState<SavedDevice | null>(null);
  const [movingDevice, setMovingDevice] = useState<SavedDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedDevice | null>(null);
  // D: revelar la clave SSH guardada del AP (la que autenticó la antena). La
  // clave vive cifrada en el backend; se pide bajo clic explícito a /reveal-ssh.
  const [revealSsh, setRevealSsh] = useState<{ apName: string; user: string; pass: string; port: number } | null>(null);

  const devicesRef = useRef(devices);
  const nodesRef = useRef(nodes);

  useEffect(() => { devicesRef.current = devices; }, [devices]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const toastTimer2 = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer2.current);
    toastTimer2.current = setTimeout(() => setToast(null), 4000);
  };

  const nodeGroups: NodeGroup[] = useMemo(() => {
    const apDevices = devices.filter(d => d.role !== 'sta');
    const staDevices = devices.filter(d => d.role === 'sta');
    const map = new Map<string, NodeGroup>();

    for (const d of apDevices) {
      const groupKey = d.nodeName || d.nodeId;
      const node = nodes.find(n => n.nombre_nodo === groupKey);
      const groupName = node?.nombre_nodo || d.nodeName || d.nodeId;
      if (!map.has(groupKey)) map.set(groupKey, { nodeId: d.nodeId, nodeName: groupName, aps: [], stas: [] });
      map.get(groupKey)!.aps.push(d);
    }

    for (const d of staDevices) {
      const groupKey = d.nodeName || d.nodeId;
      const node = nodes.find(n => n.nombre_nodo === groupKey);
      const groupName = node?.nombre_nodo || d.nodeName || d.nodeId;
      if (!map.has(groupKey)) map.set(groupKey, { nodeId: d.nodeId, nodeName: groupName, aps: [], stas: [] });
      map.get(groupKey)!.stas.push(d);
    }

    return [...map.values()];
  }, [devices, nodes]);

  const filteredGroups: NodeGroup[] = useMemo(() => {
    let groups = nodeGroups;

    if (nodeFilter === 'active') {
      groups = groups.filter(g => !!activeNodeName && g.nodeName === activeNodeName);
    } else if (nodeFilter === 'inactive') {
      groups = groups.filter(g => !activeNodeName || g.nodeName !== activeNodeName);
    }

    if (!apSearch.trim()) return groups;
    const q = apSearch.toLowerCase();
    return groups.map(g => ({
      ...g,
      aps: g.aps.filter(d =>
        (d.cachedStats?.deviceName ?? d.name ?? '').toLowerCase().includes(q) ||
        (d.ip || '').toLowerCase().includes(q) ||
        (d.model ?? '').toLowerCase().includes(q) ||
        (d.cachedStats?.essid ?? d.essid ?? '').toLowerCase().includes(q)
      ),
      stas: g.stas.filter(d =>
        (d.name ?? '').toLowerCase().includes(q) ||
        (d.ip || '').toLowerCase().includes(q) ||
        (d.model ?? '').toLowerCase().includes(q) ||
        (d.mac ?? '').toLowerCase().includes(q)
      ),
    })).filter(g => g.aps.length > 0 || g.stas.length > 0);
  }, [nodeGroups, apSearch, nodeFilter, activeNodeName]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const devs = await deviceDb.load();
      setDevices(devs);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const nodesLenRef = useRef(nodes.length);
  useEffect(() => {
    const prev = nodesLenRef.current;
    nodesLenRef.current = nodes.length;
    if (prev > 0 && nodes.length < prev) {
      loadDevices();
    }
  }, [nodes.length, loadDevices]);

  // B5: el borrado abre un ConfirmModal del sistema (antes window.confirm).
  const handleDeleteDev = (dev: SavedDevice) => setDeleteTarget(dev);

  const confirmDeleteDev = async () => {
    const dev = deleteTarget;
    if (!dev) return;
    setDeleteTarget(null);
    setDevices(prev => prev.filter(d => d.id !== dev.id));
    if (viewingApDevice?.id === dev.id) setViewingApDevice(null);
    if (apDetailDev?.id === dev.id) setApDetailDev(null);
    await deviceDb.removeSingle(dev.id);
    showToast('Equipo eliminado');
  };

  const handleUpdateApDevice = async (updated: SavedDevice) => {
    setDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
    await deviceDb.saveSingle(updated);
    if (viewingApDevice?.id === updated.id) setViewingApDevice(updated);
  };

  const handleMoveConfirm = async (nodeId: string, nodeName: string) => {
    if (!movingDevice) return;
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/db/devices/${movingDevice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, nodeName }),
      }, 10_000);
      const data = await res.json();
      if (data.success) {
        setDevices(prev => prev.map(d => d.id === movingDevice.id ? { ...d, nodeId, nodeName } : d));
        showToast(`Movido a ${nodeName}`);
        setMovingDevice(null);
      } else {
        showToast('Error al mover dispositivo', 'error');
      }
    } catch {
      showToast('Error al mover dispositivo', 'error');
    }
  };

  const handleRevealSsh = async (dev: SavedDevice) => {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/ap-monitor/reveal-ssh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apId: dev.id }),
      }, 10_000);
      const data = await res.json();
      if (data.success) {
        setRevealSsh({
          apName: dev.cachedStats?.deviceName ?? dev.name ?? dev.ip,
          user: data.user, pass: data.pass, port: data.port,
        });
      } else {
        showToast(data.message || 'No se pudo obtener la clave SSH', 'error');
      }
    } catch {
      showToast('No se pudo obtener la clave SSH', 'error');
    }
  };

  const handleSaveApDetail = async (dev: SavedDevice, newStats: AntennaStats) => {
    const updated: SavedDevice = { ...dev, cachedStats: { ...(dev.cachedStats ?? {}), ...newStats } };
    await deviceDb.saveSingle(updated);
    setDevices(prev => prev.map(d => d.id === dev.id ? updated : d));
    showToast('Datos del AP guardados');
  };

  useEffect(() => () => {
    clearTimeout(toastTimer2.current);
  }, []);

  return {
    devices,
    setDevices,
    loading,
    toast,
    setToast,
    showToast,
    apSearch,
    setApSearch,
    nodeFilter,
    setNodeFilter,
    cpeDetailTarget,
    setCpeDetailTarget,
    apDetailDev,
    setApDetailDev,
    m5DetailDevice,
    setM5DetailDevice,
    viewingApDevice,
    setViewingApDevice,
    movingDevice,
    setMovingDevice,
    deleteTarget,
    setDeleteTarget,
    revealSsh,
    setRevealSsh,
    handleRevealSsh,
    confirmDeleteDev,
    nodeGroups,
    filteredGroups,
    loadDevices,
    handleDeleteDev,
    handleUpdateApDevice,
    handleMoveConfirm,
    handleSaveApDetail,
  };
}
