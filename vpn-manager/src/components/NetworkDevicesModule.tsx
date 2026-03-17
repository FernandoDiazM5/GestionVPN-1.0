import { useState, useEffect, useCallback } from 'react';
import {
  Cpu, RefreshCw, Loader2, Radio, AlertCircle, Signal,
  ShieldCheck, ShieldOff, PlusCircle, Check, X, Wifi, Info,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { deviceDb } from '../store/deviceDb';
import DeviceCard from './DeviceCard';
import type { ScannedDevice, SavedDevice } from '../types/devices';
import type { NodeInfo } from '../types/api';

// ── Modal para agregar credenciales a un dispositivo escaneado ──
interface AddDeviceModalProps {
  device: ScannedDevice;
  node: NodeInfo;
  onSave: (d: SavedDevice) => void;
  onClose: () => void;
}

function AddDeviceModal({ device, node, onSave, onClose }: AddDeviceModalProps) {
  const [sshUser,    setSshUser]    = useState('ubnt');
  const [sshPass,    setSshPass]    = useState('');
  const [sshPort,    setSshPort]    = useState(22);
  const [routerIp,   setRouterIp]   = useState(device.ip);
  const [routerUser, setRouterUser] = useState('admin');
  const [routerPass, setRouterPass] = useState('');
  const [routerPort, setRouterPort] = useState(8075);

  const handleSave = () => {
    const saved: SavedDevice = {
      id:         device.mac.replace(/:/g, ''),
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
      sshUser:    sshUser || undefined,
      sshPass:    sshPass || undefined,
      sshPort:    sshPort !== 22 ? sshPort : undefined,
      routerIp:   routerIp !== device.ip ? routerIp : undefined,
      routerUser: routerUser || undefined,
      routerPass: routerPass || undefined,
      routerPort: routerPort !== 8075 ? routerPort : undefined,
      addedAt:    Date.now(),
    };
    onSave(saved);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800">Guardar dispositivo</h3>
            <p className="text-xs text-slate-400 mt-0.5">{device.name} · {device.model} · {device.ip}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

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

        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
            <Wifi className="w-3 h-3" /><span>Router (detrás de la antena)</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">IP router</label>
              <input value={routerIp} onChange={e => setRouterIp(e.target.value)} className="input-field w-full text-xs" />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Puerto WebUI</label>
              <input type="number" value={routerPort} onChange={e => setRouterPort(+e.target.value)} className="input-field w-full text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Usuario RouterOS</label>
              <input value={routerUser} onChange={e => setRouterUser(e.target.value)} className="input-field w-full text-xs" placeholder="admin" />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Clave RouterOS</label>
              <input type="password" value={routerPass} onChange={e => setRouterPass(e.target.value)} className="input-field w-full text-xs" placeholder="contraseña" />
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 flex items-center space-x-2">
          <Radio className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <div>
            <p className="text-[10px] text-slate-400">Nodo asociado</p>
            <p className="text-xs font-bold text-slate-700">
              {node.nombre_nodo}
              <span className="font-mono font-normal text-slate-400 ml-1">({node.segmento_lan})</span>
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all active:scale-[0.98]">
            <Check className="w-4 h-4" />
            <span>Guardar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Módulo principal ──
export default function NetworkDevicesModule() {
  const { credentials, activeNodeVrf, nodes, setNodes } = useVpn();

  const [savedDevices,  setSavedDevices]  = useState<SavedDevice[]>([]);
  const [scanResults,   setScanResults]   = useState<ScannedDevice[]>([]);
  const [allScannedIPs, setAllScannedIPs] = useState<string[]>([]);
  const [scannedCount,  setScannedCount]  = useState(0);
  const [debugMsg,      setDebugMsg]      = useState('');
  const [isScanning,    setIsScanning]    = useState(false);
  const [scanError,     setScanError]     = useState('');
  const [selectedNode,  setSelectedNode]  = useState<NodeInfo | null>(null);
  const [manualLan,     setManualLan]     = useState('');
  const [addingDevice,  setAddingDevice]  = useState<ScannedDevice | null>(null);
  const [savedIds,      setSavedIds]      = useState<Set<string>>(new Set());
  const [isLoadingNodes, setIsLoadingNodes] = useState(false);

  // Carga dispositivos guardados al montar
  useEffect(() => {
    deviceDb.load().then(devices => {
      setSavedDevices(devices);
      setSavedIds(new Set(devices.map(d => d.id)));
    });
  }, []);

  // Función para cargar nodos desde la API (igual que NodeAccessPanel)
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

  // Auto-cargar nodos al entrar al módulo si aún no se cargaron
  useEffect(() => {
    if (nodes.length === 0 && credentials) {
      loadNodes();
    }
  }, []);  // solo al montar

  // Pre-seleccionar el nodo cuyo VRF está activo
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

  // LAN efectiva: primero manual, luego la del nodo seleccionado
  const effectiveLan = manualLan.trim() || selectedNode?.segmento_lan || '';

  const handleScan = async () => {
    if (!effectiveLan) return;
    setIsScanning(true);
    setScanError('');
    setScanResults([]);
    setAllScannedIPs([]);
    setScannedCount(0);
    setDebugMsg('');

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
    const exists = savedDevices.findIndex(d => d.id === device.id);
    const updated = exists >= 0
      ? savedDevices.map((d, i) => i === exists ? device : d)
      : [...savedDevices, device];
    await persistDevices(updated);
    setAddingDevice(null);
  };

  const handleRemoveDevice = async (id: string) => {
    await persistDevices(savedDevices.filter(d => d.id !== id));
  };

  const handleUpdateDevice = async (updated: SavedDevice) => {
    await persistDevices(savedDevices.map(d => d.id === updated.id ? updated : d));
  };

  const isTunnelActive = !!activeNodeVrf;
  const activeNodeName = activeNodeVrf
    ? nodes.find(n => n.nombre_vrf === activeNodeVrf)?.nombre_nodo ?? activeNodeVrf
    : null;

  const canScan = !isScanning && !!effectiveLan;

  const devicesByNode = savedDevices.reduce<Record<string, { nodeName: string; devices: SavedDevice[] }>>((acc, d) => {
    if (!acc[d.nodeId]) acc[d.nodeId] = { nodeName: d.nodeName, devices: [] };
    acc[d.nodeId].devices.push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-5">

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
          {/* Reload nodes button */}
          <button
            onClick={loadNodes}
            disabled={isLoadingNodes}
            className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors disabled:opacity-50"
          >
            {isLoadingNodes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>{isLoadingNodes ? 'Cargando...' : `Recargar nodos (${nodes.length})`}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Node selector */}
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

          {/* LAN subnet — editable, auto-filled from node */}
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

        <button
          onClick={handleScan}
          disabled={!canScan}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all
            ${canScan
              ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:shadow-lg active:scale-[0.98]'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
        >
          {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>{isScanning ? `Escaneando ${effectiveLan}...` : 'Escanear dispositivos'}</span>
        </button>

        {/* Debug info */}
        {debugMsg && !scanError && (
          <div className="flex items-start space-x-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>{debugMsg}</span>
          </div>
        )}

        {/* Scan error */}
        {scanError && (
          <div className="flex items-start space-x-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-600">{scanError}</p>
          </div>
        )}

        {/* No Ubiquiti found after scan */}
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

        {/* Scan results cards */}
        {scanResults.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              {scanResults.length} Ubiquiti identificados
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {scanResults.map((dev) => {
                const id  = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '_');
                const already = savedIds.has(id);
                const isAp    = dev.role === 'ap';
                const freqGhz = dev.frequency ? (dev.frequency / 1000).toFixed(1) : null;
                const is5g    = dev.frequency >= 5000;
                const sshOnly = !dev.mac;
                return (
                  <div key={dev.ip}
                    className={`relative rounded-2xl border p-4 space-y-3 transition-all
                      ${already ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm'}`}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm
                          ${isAp ? 'bg-indigo-500' : 'bg-violet-500'}`}>
                          {isAp
                            ? <Radio className="w-4 h-4 text-white" />
                            : <Signal className="w-4 h-4 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-800 truncate">{dev.name}</p>
                          <p className="font-mono text-[10px] text-slate-400 truncate">{dev.ip}{dev.mac ? ` · ${dev.mac}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md
                          ${isAp ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700'}`}>
                          {isAp ? 'AP' : 'CPE'}
                        </span>
                        {freqGhz && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md
                            ${is5g ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                            {freqGhz} GHz
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Modelo</p>
                        <p className="font-mono text-slate-700 truncate">{dev.model}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Firmware</p>
                        <p className="font-mono text-slate-700 truncate">{dev.firmware}</p>
                      </div>
                      {dev.essid ? (
                        <div className="col-span-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">SSID</p>
                          <p className="font-mono text-slate-700">{dev.essid}</p>
                        </div>
                      ) : null}
                      {dev.parentAp ? (
                        <div className="col-span-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">AP padre</p>
                          <p className="font-mono text-slate-700 truncate">{dev.parentAp}</p>
                        </div>
                      ) : null}
                    </div>

                    {sshOnly && (
                      <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        Detectado por SSH — HTTP no disponible. MAC desconocida.
                      </p>
                    )}

                    {selectedNode && (
                      <button
                        onClick={() => setAddingDevice(dev)}
                        className={`w-full flex items-center justify-center space-x-2 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.98]
                          ${already
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20'}`}
                      >
                        {already
                          ? <><Check className="w-3.5 h-3.5" /><span>Actualizar</span></>
                          : <><PlusCircle className="w-3.5 h-3.5" /><span>Guardar dispositivo</span></>}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Saved devices grouped by node */}
      {Object.keys(devicesByNode).length > 0 && (
        <div className="space-y-4">
          {Object.entries(devicesByNode).map(([, { nodeName, devices }]) => (
            <div key={nodeName}>
              <div className="flex items-center space-x-2 mb-3">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-600">{nodeName}</h3>
                <span className="text-xs text-slate-400">· {devices.length} equipo{devices.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {devices.map(dev => (
                  <DeviceCard
                    key={dev.id}
                    device={dev}
                    onRemove={() => handleRemoveDevice(dev.id)}
                    onUpdate={handleUpdateDevice}
                  />
                ))}
              </div>
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

      {addingDevice && selectedNode && (
        <AddDeviceModal
          device={addingDevice}
          node={selectedNode}
          onSave={handleAddDevice}
          onClose={() => setAddingDevice(null)}
        />
      )}
    </div>
  );
}
