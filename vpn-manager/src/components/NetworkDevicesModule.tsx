import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Cpu, RefreshCw, Loader2, Radio, AlertCircle,
  ShieldCheck, ShieldOff, PlusCircle, Check, X, Wifi, Info,
  Eye, Pencil, Trash2, CheckCircle2, ExternalLink, Router,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { deviceDb } from '../store/deviceDb';
import DeviceCard from './DeviceCard';
import type { ScannedDevice, SavedDevice } from '../types/devices';
import type { NodeInfo } from '../types/api';

const SESSION_SCAN_KEY = 'vpn_scan_results_v1';

// ── Modal agregar / editar credenciales ──────────────────────────────────
interface AddDeviceModalProps {
  device: ScannedDevice;
  node: NodeInfo;
  existing?: Pick<SavedDevice, 'sshUser' | 'sshPass' | 'sshPort' | 'routerPort'>;
  onSave: (d: SavedDevice) => void;
  onClose: () => void;
}

function AddDeviceModal({ device, node, existing, onSave, onClose }: AddDeviceModalProps) {
  const [sshUser,    setSshUser]    = useState(existing?.sshUser    ?? 'ubnt');
  const [sshPass,    setSshPass]    = useState(existing?.sshPass    ?? '');
  const [sshPort,    setSshPort]    = useState(existing?.sshPort    ?? 22);
  const [routerPort, setRouterPort] = useState(existing?.routerPort ?? 8075);

  const deviceId = device.mac ? device.mac.replace(/:/g, '') : device.ip.replace(/\./g, '');

  const handleSave = () => {
    const saved: SavedDevice = {
      id:         deviceId,
      mac:        device.mac,
      ip:         device.ip,
      name:       device.name,
      model:      device.model,
      firmware:   device.firmware,
      role:       device.role,
      parentAp:   device.parentAp,
      essid:      device.essid,
      frequency:  device.frequency,
      nodeId:     node.id,
      nodeName:   node.nombre_nodo,
      sshUser:    sshUser    || undefined,
      sshPass:    sshPass    || undefined,
      sshPort:    sshPort !== 22    ? sshPort    : undefined,
      routerPort: routerPort !== 8075 ? routerPort : undefined,
      addedAt:    Date.now(),
    };
    onSave(saved);
  };

  const isEdit = !!existing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800">{isEdit ? 'Editar dispositivo' : 'Guardar dispositivo'}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{device.name} · {device.model} · {device.ip}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SSH */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
            <Cpu className="w-3 h-3" /><span>SSH — Antena Ubiquiti</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Usuario</label>
              <input value={sshUser} onChange={e => setSshUser(e.target.value)} className="input-field w-full text-xs" placeholder="ubnt" />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Puerto SSH</label>
              <input type="number" value={sshPort} onChange={e => setSshPort(+e.target.value)} className="input-field w-full text-xs" />
            </div>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Clave SSH</label>
            <input type="password" value={sshPass} onChange={e => setSshPass(e.target.value)} className="input-field w-full text-xs" placeholder="contraseña SSH" />
          </div>
        </div>

        {/* Puerto WebUI router */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
            <Wifi className="w-3 h-3" /><span>Router del cliente</span>
          </p>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Puerto WebUI <span className="normal-case font-normal text-slate-300">(acceso en {device.ip}:puerto)</span>
            </label>
            <input type="number" value={routerPort} onChange={e => setRouterPort(+e.target.value)} className="input-field w-full text-xs" />
          </div>
        </div>

        {/* Nodo */}
        <div className="bg-slate-50 rounded-xl p-3 flex items-center space-x-2">
          <Radio className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <div>
            <p className="text-[10px] text-slate-400">Nodo asociado</p>
            <p className="text-xs font-bold text-slate-700">
              {node.nombre_nodo}
              {node.segmento_lan && <span className="font-mono font-normal text-slate-400 ml-1">({node.segmento_lan})</span>}
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all active:scale-[0.98]">
            <Check className="w-4 h-4" />
            <span>{isEdit ? 'Actualizar' : 'Guardar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal para ver DeviceCard ────────────────────────────────────────────
interface DeviceCardModalProps {
  device: SavedDevice;
  onClose: () => void;
  onRemove: () => void;
  onUpdate: (updated: SavedDevice) => void;
}

function DeviceCardModal({ device, onClose, onRemove, onUpdate }: DeviceCardModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-4 py-2.5">
          <span className="text-xs font-bold text-slate-300">Detalle del dispositivo</span>
          <button onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <DeviceCard
          device={device}
          onRemove={() => { onRemove(); onClose(); }}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}

// ── Módulo principal ─────────────────────────────────────────────────────
export default function NetworkDevicesModule() {
  const { credentials, activeNodeVrf, nodes, setNodes } = useVpn();

  const [savedDevices,   setSavedDevices]   = useState<SavedDevice[]>([]);
  const [scanResults,    setScanResults]    = useState<ScannedDevice[]>([]);
  const [allScannedIPs,  setAllScannedIPs]  = useState<string[]>([]);
  const [scannedCount,   setScannedCount]   = useState(0);
  const [debugMsg,       setDebugMsg]       = useState('');
  const [isScanning,     setIsScanning]     = useState(false);
  const [scanError,      setScanError]      = useState('');
  const [selectedNode,   setSelectedNode]   = useState<NodeInfo | null>(null);
  const [manualLan,      setManualLan]      = useState('');
  const [addingDevice,   setAddingDevice]   = useState<ScannedDevice | null>(null);
  const [editingDevice,  setEditingDevice]  = useState<SavedDevice | null>(null);
  const [viewingDevice,  setViewingDevice]  = useState<SavedDevice | null>(null);
  const [savedIds,       setSavedIds]       = useState<Set<string>>(new Set());
  const [isLoadingNodes, setIsLoadingNodes] = useState(false);
  const [toast,          setToast]          = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };

  // Carga inicial: primero DB (savedIds), luego sessionStorage en el mismo batch React
  // para evitar que scan results se muestren antes de que savedIds esté listo (flash).
  useEffect(() => {
    deviceDb.load().then(devices => {
      setSavedDevices(devices);
      setSavedIds(new Set(devices.map(d => d.id)));
      // Restaurar scan previo DENTRO del then() → React 18 batchea ambos setState
      try {
        const cached = sessionStorage.getItem(SESSION_SCAN_KEY);
        if (cached) {
          const { results, allIPs, count, debug } = JSON.parse(cached);
          if (Array.isArray(results) && results.length > 0) {
            setScanResults(results);
            setAllScannedIPs(allIPs ?? []);
            setScannedCount(count ?? 0);
            setDebugMsg(debug ?? '');
          }
        }
      } catch { /* silent */ }
    });
  }, []);

  // Persistir scan en sessionStorage cuando cambia
  useEffect(() => {
    if (scanResults.length > 0) {
      sessionStorage.setItem(SESSION_SCAN_KEY, JSON.stringify({
        results: scanResults, allIPs: allScannedIPs, count: scannedCount, debug: debugMsg,
      }));
    }
  }, [scanResults, allScannedIPs, scannedCount, debugMsg]);

  const loadNodes = useCallback(async () => {
    if (!credentials) return;
    setIsLoadingNodes(true);
    try {
      const res = await fetchWithTimeout('http://localhost:3001/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
      }, 20_000);
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      setNodes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando nodos:', err);
    } finally {
      setIsLoadingNodes(false);
    }
  }, [credentials, setNodes]);

  useEffect(() => {
    if (nodes.length === 0 && credentials) loadNodes();
  }, []); // solo al montar

  useEffect(() => {
    if (activeNodeVrf && nodes.length > 0) {
      const active = nodes.find(n => n.nombre_vrf === activeNodeVrf);
      if (active) {
        setSelectedNode(active);
        if (active.segmento_lan) setManualLan(active.segmento_lan);
      }
    }
  }, [activeNodeVrf, nodes]);

  const persistDevices = async (updated: SavedDevice[]) => {
    setSavedDevices(updated);
    setSavedIds(new Set(updated.map(d => d.id)));
    await deviceDb.save(updated);
  };

  const effectiveLan = manualLan.trim() || selectedNode?.segmento_lan || '';

  const handleScan = async () => {
    if (!effectiveLan) return;
    setIsScanning(true);
    setScanError('');
    setScanResults([]);
    setAllScannedIPs([]);
    setScannedCount(0);
    setDebugMsg('');
    sessionStorage.removeItem(SESSION_SCAN_KEY);
    try {
      const res = await fetchWithTimeout('http://localhost:3001/api/node/scan-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeLan: effectiveLan }),
      }, 90_000);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Error en el escaneo');
      setScanResults(data.devices ?? []);
      setAllScannedIPs(data.allIPs ?? []);
      setScannedCount(data.scanned ?? 0);
      setDebugMsg(data.debug ?? '');
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddDevice = async (device: SavedDevice) => {
    const existingIdx = savedDevices.findIndex(d => d.id === device.id);
    const existingDev = existingIdx >= 0 ? savedDevices[existingIdx] : null;
    // Preservar campos estáticos cacheados (deviceName, lanMac, etc.) al editar
    const merged: SavedDevice = existingDev
      ? { ...existingDev, ...device, addedAt: existingDev.addedAt }
      : device;

    let current = existingIdx >= 0
      ? savedDevices.map((d, i) => i === existingIdx ? merged : d)
      : [...savedDevices, merged];

    await persistDevices(current);
    setAddingDevice(null);
    setEditingDevice(null);

    // Auto-SSH: obtener stats estáticas en segundo plano si hay credenciales
    if (merged.sshUser && merged.sshPass) {
      showToast('Guardado. Conectando SSH para obtener datos…');
      try {
        const res = await fetchWithTimeout('http://localhost:3001/api/device/antenna', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceIP:   merged.ip,
            deviceUser: merged.sshUser,
            devicePass: merged.sshPass,
            devicePort: merged.sshPort ?? 22,
          }),
        }, 20_000);
        const data = await res.json();
        if (data.success && data.stats) {
          const s = data.stats;
          const enriched: SavedDevice = {
            ...merged,
            lastSeen:     Date.now(),
            name:         s.deviceName      || merged.name,
            model:        s.deviceModel     || merged.model,
            firmware:     s.firmwareVersion || merged.firmware,
            mac:          s.wlanMac         || merged.mac,
            essid:        s.essid           ?? merged.essid,
            frequency:    s.frequency       ?? merged.frequency,
            deviceName:   s.deviceName      ?? merged.deviceName,
            lanMac:       s.lanMac          ?? merged.lanMac,
            security:     s.security        ?? merged.security,
            channelWidth: s.channelWidth    ?? merged.channelWidth,
            networkMode:  s.networkMode     ?? merged.networkMode,
            chains:       s.chains          ?? merged.chains,
            apMac:        s.apMac           ?? merged.apMac,
            cachedStats:  s,
          };
          current = current.map(d => d.id === enriched.id ? enriched : d);
          await persistDevices(current);
          showToast('Dispositivo guardado con datos completos');
        } else {
          showToast('Guardado. SSH sin respuesta aún');
        }
      } catch {
        showToast('Guardado. No se pudo conectar por SSH');
      }
    } else {
      showToast(existingDev ? 'Dispositivo actualizado' : 'Dispositivo guardado');
    }
  };

  const handleRemoveDevice = async (id: string) => {
    await persistDevices(savedDevices.filter(d => d.id !== id));
    if (viewingDevice?.id === id) setViewingDevice(null);
  };

  const handleUpdateDevice = async (updated: SavedDevice) => {
    const newList = savedDevices.map(d => d.id === updated.id ? updated : d);
    await persistDevices(newList);
    if (viewingDevice?.id === updated.id) setViewingDevice(updated);
  };

  const isTunnelActive = !!activeNodeVrf;
  const activeNodeName = activeNodeVrf
    ? nodes.find(n => n.nombre_vrf === activeNodeVrf)?.nombre_nodo ?? activeNodeVrf
    : null;
  const canScan = !isScanning && !!effectiveLan;

  // Ocultar de scan los dispositivos ya guardados
  const filteredScan = scanResults.filter(dev => {
    const id = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
    return !savedIds.has(id);
  });

  const devicesByNode = savedDevices.reduce<Record<string, { nodeName: string; devices: SavedDevice[] }>>((acc, d) => {
    if (!acc[d.nodeId]) acc[d.nodeId] = { nodeName: d.nodeName, devices: [] };
    acc[d.nodeId].devices.push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2
          bg-slate-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-indigo-500" />
            <span>Dispositivos de Red</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">Descubre y gestiona equipos Ubiquiti en las LANs remotas</p>
        </div>
        <div className="text-sm text-slate-500">
          <span className="font-bold text-indigo-600">{savedDevices.length}</span> guardados
        </div>
      </div>

      {/* Tunnel status */}
      {isTunnelActive ? (
        <div className="card p-4 border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 flex items-center space-x-3">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/30 shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Túnel activo: <span className="text-emerald-600">{activeNodeName}</span></p>
            <p className="text-xs text-slate-400 mt-0.5">El escaneo se realiza desde este equipo hacia la LAN remota</p>
          </div>
        </div>
      ) : (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-center space-x-3">
          <ShieldOff className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-700">Sin túnel activo</p>
            <p className="text-xs text-amber-600 mt-0.5">Activa el acceso a un nodo en la pestaña "Nodos" para poder escanear en tiempo real</p>
          </div>
        </div>
      )}

      {/* Scanner section */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 flex items-center space-x-2">
            <RefreshCw className="w-4 h-4 text-indigo-500" />
            <span>Escanear LAN del nodo</span>
          </h3>
          <button onClick={loadNodes} disabled={isLoadingNodes}
            className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors disabled:opacity-50">
            {isLoadingNodes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>{isLoadingNodes ? 'Cargando...' : `Recargar nodos (${nodes.length})`}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Nodo</label>
            <select
              value={selectedNode?.id ?? ''}
              onChange={e => {
                const n = nodes.find(x => x.id === e.target.value) ?? null;
                setSelectedNode(n);
                if (n?.segmento_lan) setManualLan(n.segmento_lan);
              }}
              className="input-field w-full text-sm"
            >
              <option value="">{nodes.length === 0 ? 'Cargando nodos...' : 'Seleccionar nodo...'}</option>
              {nodes.map(n => (
                <option key={n.id} value={n.id}>
                  {n.nombre_nodo}{n.segmento_lan ? ` — ${n.segmento_lan}` : ''}{!n.running ? ' (offline)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Subred LAN (CIDR)
            </label>
            <input
              value={manualLan}
              onChange={e => setManualLan(e.target.value)}
              placeholder="ej: 10.5.5.0/24"
              className="input-field w-full text-sm font-mono"
            />
          </div>
        </div>

        <button onClick={handleScan} disabled={!canScan}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all
            ${canScan
              ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:shadow-lg active:scale-[0.98]'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
        >
          {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>{isScanning ? `Escaneando ${effectiveLan}...` : 'Escanear dispositivos'}</span>
        </button>

        {debugMsg && !scanError && (
          <div className="flex items-start space-x-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>{debugMsg}</span>
          </div>
        )}
        {scanError && (
          <div className="flex items-start space-x-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-600">{scanError}</p>
          </div>
        )}
        {!isScanning && scannedCount > 0 && scanResults.length === 0 && !scanError && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
            <p className="text-xs font-semibold text-amber-700">
              Se escanearon {scannedCount} IPs en {effectiveLan} pero ninguna respondió como Ubiquiti airOS
            </p>
            <p className="text-[10px] text-amber-500">
              Verifica que el túnel VRF esté activo en la pestaña "Nodos" y que los equipos tengan HTTP habilitado en puerto 80
            </p>
          </div>
        )}

        {/* Scan results: todos guardados */}
        {scanResults.length > 0 && filteredScan.length === 0 && (
          <div className="flex items-center space-x-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-700">
              Todos los dispositivos encontrados ya están guardados ({scanResults.length})
            </p>
          </div>
        )}

        {/* Scan results TABLE */}
        {filteredScan.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {filteredScan.length} nuevo{filteredScan.length !== 1 ? 's' : ''}
                {scanResults.length - filteredScan.length > 0 &&
                  ` · ${scanResults.length - filteredScan.length} ya guardado${scanResults.length - filteredScan.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-200">
              {/* Header */}
              <div className="grid grid-cols-[52px_1fr_1fr_90px] sm:grid-cols-[52px_1fr_1fr_1fr_90px]
                bg-slate-50 border-b border-slate-200 px-3 py-2
                text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Rol</span>
                <span>IP / MAC</span>
                <span>Nombre / Modelo</span>
                <span className="hidden sm:block">SSID</span>
                <span className="text-right">Acción</span>
              </div>
              {filteredScan.map(dev => {
                const isAp = dev.role === 'ap';
                const freqGhz = dev.frequency ? (dev.frequency / 1000).toFixed(1) : null;
                return (
                  <div key={dev.ip}
                    className="grid grid-cols-[52px_1fr_1fr_90px] sm:grid-cols-[52px_1fr_1fr_1fr_90px]
                      items-center px-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <div>
                      <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md
                        ${isAp ? 'bg-indigo-100 text-indigo-700'
                          : dev.role === 'unknown' ? 'bg-slate-100 text-slate-500'
                          : 'bg-violet-100 text-violet-700'}`}>
                        {isAp ? 'AP' : dev.role === 'unknown' ? '?' : 'CPE'}
                      </span>
                      {freqGhz && (
                        <p className={`text-[9px] font-bold mt-0.5 ${dev.frequency! >= 5000 ? 'text-sky-600' : 'text-amber-600'}`}>
                          {freqGhz}G
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 pr-2">
                      <p className="font-mono text-xs text-slate-700 truncate">{dev.ip}</p>
                      {dev.mac
                        ? <p className="font-mono text-[9px] text-slate-400 truncate">{dev.mac}</p>
                        : <p className="text-[9px] text-amber-500">SSH-only</p>
                      }
                    </div>
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-semibold text-slate-700 truncate">{dev.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{dev.model}</p>
                    </div>
                    <div className="hidden sm:block min-w-0 pr-2">
                      <p className="text-[11px] font-mono text-slate-600 truncate">{dev.essid || '—'}</p>
                    </div>
                    <div className="flex justify-end">
                      {selectedNode ? (
                        <button
                          onClick={() => setAddingDevice(dev)}
                          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold
                            bg-indigo-600 text-white hover:bg-indigo-700 transition-colors active:scale-[0.97] whitespace-nowrap"
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span>Guardar</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 text-right">Sin nodo sel.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Saved devices TABLE grouped by node */}
      {Object.keys(devicesByNode).length > 0 && (
        <div className="space-y-4">
          {Object.entries(devicesByNode).map(([nodeId, { nodeName, devices }]) => (
            <div key={nodeId} className="card overflow-hidden">
              {/* Node header */}
              <div className="flex items-center space-x-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-700">{nodeName}</h3>
                <span className="text-xs text-slate-400">· {devices.length} equipo{devices.length !== 1 ? 's' : ''}</span>
              </div>
              {/* Table header */}
              <div className="grid grid-cols-[72px_1fr_1fr_1fr_auto]
                px-5 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider
                border-b border-slate-100 bg-white">
                <span>Modo</span>
                <span>Nombre / MAC</span>
                <span>IP / Frec.</span>
                <span>SSID / AP</span>
                <span className="text-right">Acciones</span>
              </div>
              {/* Rows */}
              {devices.map(dev => {
                // Prioridad: cachedStats.mode > role escaneado > unknown
                const rawMode = dev.cachedStats?.mode || (dev.role !== 'unknown' ? dev.role : null);
                const isApMode = rawMode === 'ap' || rawMode === 'master';
                const isCpe    = rawMode === 'sta';
                const displayName = dev.deviceName || dev.name;
                const displayMac  = dev.mac || '—';
                const antennaUrl  = `http://${dev.ip}`;
                const routerUrl   = `http://${dev.routerIp || dev.ip}:${dev.routerPort ?? 8075}`;
                return (
                  <div key={dev.id}
                    className="grid grid-cols-[72px_1fr_1fr_1fr_auto]
                      items-center px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    {/* Modo combinado */}
                    <div>
                      {rawMode ? (
                        <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md
                          ${isApMode
                            ? 'bg-indigo-100 text-indigo-700'
                            : isCpe
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-slate-100 text-slate-500'}`}>
                          {isApMode ? 'AP' : isCpe ? 'CPE' : rawMode.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300" title="Abre el detalle y presiona Actualizar">—</span>
                      )}
                    </div>
                    {/* Nombre + MAC */}
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-semibold text-slate-800 truncate" title={displayName}>{displayName}</p>
                      <p className="font-mono text-[9px] text-slate-400 truncate">{displayMac}</p>
                    </div>
                    {/* IP + GHz */}
                    <div className="min-w-0 pr-2">
                      <p className="font-mono text-xs text-slate-600 truncate">{dev.ip}</p>
                      {dev.frequency ? (
                        <p className={`text-[9px] font-bold ${dev.frequency >= 5000 ? 'text-sky-600' : 'text-amber-600'}`}>
                          {(dev.frequency / 1000).toFixed(1)} GHz
                        </p>
                      ) : null}
                    </div>
                    {/* SSID (AP) o AP MAC (CPE) */}
                    <div className="min-w-0 pr-2">
                      {isApMode ? (
                        <>
                          {dev.essid && <p className="font-mono text-[11px] text-slate-600 truncate" title={dev.essid}>{dev.essid}</p>}
                          {dev.security && <p className="text-[9px] text-slate-400">{dev.security}</p>}
                        </>
                      ) : (
                        <>
                          {dev.apMac
                            ? <p className="font-mono text-[10px] text-violet-600 truncate" title={`AP: ${dev.apMac}`}>{dev.apMac}</p>
                            : dev.essid && <p className="font-mono text-[10px] text-slate-500 truncate">{dev.essid}</p>
                          }
                          {dev.lastSeen && (
                            <p className="text-[9px] text-slate-300">{new Date(dev.lastSeen).toLocaleDateString()}</p>
                          )}
                        </>
                      )}
                    </div>
                    {/* Acciones */}
                    <div className="flex items-center justify-end gap-0.5">
                      {/* Abrir antena en web */}
                      <a href={antennaUrl} target="_blank" rel="noopener noreferrer"
                        title={`Abrir antena: ${antennaUrl}`}
                        className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors flex items-center">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {/* Abrir router en web */}
                      <a href={routerUrl} target="_blank" rel="noopener noreferrer"
                        title={`Abrir router: ${routerUrl}`}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center">
                        <Router className="w-3.5 h-3.5" />
                      </a>
                      {/* Ver detalles antena (SSH stats) */}
                      <button onClick={() => setViewingDevice(dev)} title="Ver stats antena"
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingDevice(dev)} title="Editar credenciales"
                        className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleRemoveDevice(dev.id)} title="Eliminar"
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {savedDevices.length === 0 && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Cpu className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 font-medium">Sin dispositivos guardados</p>
          <p className="text-slate-400 text-sm max-w-xs">
            Selecciona un nodo, ingresa su subred LAN y presiona "Escanear dispositivos"
          </p>
        </div>
      )}

      {/* Add modal */}
      {addingDevice && selectedNode && (
        <AddDeviceModal
          device={addingDevice}
          node={selectedNode}
          onSave={handleAddDevice}
          onClose={() => setAddingDevice(null)}
        />
      )}

      {/* Edit modal */}
      {editingDevice && (
        <AddDeviceModal
          device={editingDevice}
          node={nodes.find(n => n.id === editingDevice.nodeId) ?? {
            id: editingDevice.nodeId,
            nombre_nodo: editingDevice.nodeName,
            ppp_user: '', segmento_lan: '', nombre_vrf: '',
            service: '', disabled: false, running: false,
            ip_tunnel: '', uptime: '',
          }}
          existing={{
            sshUser:    editingDevice.sshUser,
            sshPass:    editingDevice.sshPass,
            sshPort:    editingDevice.sshPort,
            routerPort: editingDevice.routerPort,
          }}
          onSave={handleAddDevice}
          onClose={() => setEditingDevice(null)}
        />
      )}

      {/* View modal */}
      {viewingDevice && (
        <DeviceCardModal
          device={viewingDevice}
          onClose={() => setViewingDevice(null)}
          onRemove={() => handleRemoveDevice(viewingDevice.id)}
          onUpdate={handleUpdateDevice}
        />
      )}
    </div>
  );
}
