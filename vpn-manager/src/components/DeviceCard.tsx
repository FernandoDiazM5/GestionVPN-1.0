import { useState } from 'react';
import {
  Wifi, WifiOff, Radio, Router, Signal, Trash2,
  RefreshCw, Loader2, Eye, EyeOff, ExternalLink, Save,
  Activity, MonitorSpeaker,
} from 'lucide-react';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { SavedDevice, AntennaStats, WifiInterface, WifiSecurityProfile } from '../types/devices';

interface DeviceCardProps {
  device: SavedDevice;
  onRemove: () => void;
  onUpdate: (updated: SavedDevice) => void;
}

function SignalBar({ value, max = -40, min = -95 }: { value: number; max?: number; min?: number }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const color = pct > 60 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCell({ label, value, unit = '' }: { label: string; value?: number | string | null; unit?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-2.5">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-mono text-sm font-bold ${value !== undefined && value !== null ? 'text-slate-700' : 'text-slate-300'}`}>
        {value !== undefined && value !== null ? `${value}${unit}` : '—'}
      </p>
    </div>
  );
}

export default function DeviceCard({ device, onRemove, onUpdate }: DeviceCardProps) {
  const [activeTab, setActiveTab] = useState<'antenna' | 'router'>('antenna');

  // Antenna tab state
  const [antennaStats, setAntennaStats]     = useState<AntennaStats | null>(null);
  const [isLoadingAntenna, setIsLoadingAntenna] = useState(false);
  const [antennaError, setAntennaError]     = useState('');

  // Router tab state
  const [wifiInterfaces, setWifiInterfaces] = useState<WifiInterface[]>([]);
  const [wifiProfiles, setWifiProfiles]     = useState<WifiSecurityProfile[]>([]);
  const [isLoadingWifi, setIsLoadingWifi]   = useState(false);
  const [wifiError, setWifiError]           = useState('');
  const [showWifiPass, setShowWifiPass]     = useState<Record<string, boolean>>({});

  // WiFi edit state
  const [editingIface, setEditingIface]     = useState<string | null>(null);
  const [newSsid, setNewSsid]               = useState('');
  const [newWpa2Key, setNewWpa2Key]         = useState('');
  const [isSavingWifi, setIsSavingWifi]     = useState(false);
  const [wifiSaveMsg, setWifiSaveMsg]       = useState('');

  const handleLoadAntenna = async () => {
    if (!device.sshUser || !device.sshPass) {
      setAntennaError('Sin credenciales SSH — edita el dispositivo para agregarlas');
      return;
    }
    setIsLoadingAntenna(true);
    setAntennaError('');
    try {
      const res = await fetchWithTimeout('http://localhost:3001/api/device/antenna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIP:   device.ip,
          deviceUser: device.sshUser,
          devicePass: device.sshPass,
          devicePort: device.sshPort ?? 22,
        }),
      }, 20_000);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Error obteniendo stats');
      setAntennaStats(data.stats);
      onUpdate({ ...device, lastSeen: Date.now() });
    } catch (err: unknown) {
      setAntennaError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoadingAntenna(false);
    }
  };

  const handleLoadWifi = async () => {
    const rIp = device.routerIp || device.ip;
    if (!device.routerUser) {
      setWifiError('Sin credenciales de router — edita el dispositivo para agregarlas');
      return;
    }
    setIsLoadingWifi(true);
    setWifiError('');
    setWifiSaveMsg('');
    try {
      const res = await fetchWithTimeout('http://localhost:3001/api/device/wifi/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerIP: rIp, routerUser: device.routerUser, routerPass: device.routerPass ?? '' }),
      }, 20_000);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Error obteniendo WiFi');
      setWifiInterfaces(data.interfaces);
      setWifiProfiles(data.profiles);
    } catch (err: unknown) {
      setWifiError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoadingWifi(false);
    }
  };

  const handleSaveWifi = async (iface: WifiInterface) => {
    const rIp = device.routerIp || device.ip;
    const profile = wifiProfiles.find(p => p.name === iface.securityProfile);
    setIsSavingWifi(true);
    setWifiSaveMsg('');
    try {
      const res = await fetchWithTimeout('http://localhost:3001/api/device/wifi/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routerIP:   rIp,
          routerUser: device.routerUser,
          routerPass: device.routerPass ?? '',
          ifaceId:    iface.id,
          ssid:       newSsid || undefined,
          profileId:  profile?.id,
          wpa2Key:    newWpa2Key || undefined,
        }),
      }, 20_000);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Error guardando');
      setWifiSaveMsg('✓ Configuración guardada correctamente');
      setEditingIface(null);
      setNewSsid('');
      setNewWpa2Key('');
      await handleLoadWifi();
    } catch (err: unknown) {
      setWifiSaveMsg(`✗ ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsSavingWifi(false);
    }
  };

  const roleColor  = device.role === 'ap' ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700';
  const roleLabel  = device.role === 'ap' ? 'AP' : device.role === 'sta' ? 'CPE' : '?';

  return (
    <div className="card flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
            ${device.role === 'ap' ? 'bg-indigo-500' : 'bg-violet-500'}`}>
            {device.role === 'ap'
              ? <Radio className="w-4 h-4 text-white" />
              : <Signal className="w-4 h-4 text-white" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
              <h3 className="font-bold text-slate-800 text-sm truncate">{device.name}</h3>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${roleColor}`}>{roleLabel}</span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono truncate">{device.model} · {device.firmware}</p>
          </div>
        </div>
        <button onClick={onRemove} className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-rose-50 rounded-lg transition-colors shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Info row */}
      <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span className="font-mono text-slate-600">{device.ip}</span>
        <span className="font-mono text-slate-400">{device.mac}</span>
        <span className="text-indigo-600 font-semibold truncate">{device.nodeName}</span>
        {device.frequency ? <span className="text-sky-600">{(device.frequency / 1000).toFixed(1)} GHz</span> : null}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        <button
          onClick={() => setActiveTab('antenna')}
          className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors
            ${activeTab === 'antenna' ? 'text-indigo-600 border-b-2 border-indigo-500 bg-indigo-50/60' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
        >
          <MonitorSpeaker className="w-3.5 h-3.5" />
          <span>Antena</span>
        </button>
        <button
          onClick={() => setActiveTab('router')}
          className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors
            ${activeTab === 'router' ? 'text-indigo-600 border-b-2 border-indigo-500 bg-indigo-50/60' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
        >
          <Router className="w-3.5 h-3.5" />
          <span>Router</span>
        </button>
      </div>

      {/* ── ANTENA TAB ── */}
      {activeTab === 'antenna' && (
        <div className="p-4 space-y-3 flex-1">
          <button
            onClick={handleLoadAntenna}
            disabled={isLoadingAntenna}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl text-xs font-bold
              bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {isLoadingAntenna ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>{isLoadingAntenna ? 'Conectando SSH...' : antennaStats ? 'Actualizar' : 'Leer stats'}</span>
          </button>

          {antennaError && (
            <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{antennaError}</p>
          )}

          {antennaStats && !antennaStats.raw && (
            <div className="space-y-2">
              {/* Signal bar */}
              {antennaStats.signal !== undefined && antennaStats.signal !== null && (
                <div className="bg-slate-50 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Señal</span>
                    <span className="font-mono text-sm font-bold text-slate-700">{antennaStats.signal} dBm</span>
                  </div>
                  <SignalBar value={antennaStats.signal} />
                </div>
              )}
              {/* CCQ bar */}
              {antennaStats.ccq !== undefined && antennaStats.ccq !== null && (
                <div className="bg-slate-50 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">CCQ</span>
                    <span className="font-mono text-sm font-bold text-slate-700">{antennaStats.ccq}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${antennaStats.ccq > 60 ? 'bg-emerald-500' : antennaStats.ccq > 30 ? 'bg-amber-400' : 'bg-rose-500'}`}
                      style={{ width: `${antennaStats.ccq}%` }}
                    />
                  </div>
                </div>
              )}
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2">
                <StatCell label="Ruido"    value={antennaStats.noiseFloor} unit=" dBm" />
                <StatCell label="TX Rate"  value={antennaStats.txRate}     unit=" Mbps" />
                <StatCell label="RX Rate"  value={antennaStats.rxRate}     unit=" Mbps" />
                <StatCell label="Distancia" value={antennaStats.distance}  unit=" m" />
                <StatCell label="TX Power" value={antennaStats.txPower}    unit=" dBm" />
                <StatCell label="Frec."    value={antennaStats.frequency}  unit=" MHz" />
              </div>
              {/* AirMax */}
              {antennaStats.airmaxEnabled !== undefined && (
                <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">AirMax</span>
                  <div className="flex items-center space-x-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${antennaStats.airmaxEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {antennaStats.airmaxEnabled ? 'Activo' : 'Inactivo'}
                    </span>
                    {antennaStats.airmaxCapacity !== null && antennaStats.airmaxCapacity !== undefined && (
                      <span className="text-[10px] font-mono text-slate-600">Cap: {antennaStats.airmaxCapacity}%</span>
                    )}
                    {antennaStats.airmaxQuality !== null && antennaStats.airmaxQuality !== undefined && (
                      <span className="text-[10px] font-mono text-slate-600">Q: {antennaStats.airmaxQuality}%</span>
                    )}
                  </div>
                </div>
              )}
              {/* Station list (AP mode) */}
              {antennaStats.stations && antennaStats.stations.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                    <Activity className="w-3 h-3" />
                    <span>Estaciones conectadas ({antennaStats.stations.length})</span>
                  </p>
                  <div className="bg-slate-900 rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase">MAC</th>
                          <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase">Signal</th>
                          <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase">CCQ</th>
                          <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase">TX/RX</th>
                        </tr>
                      </thead>
                      <tbody>
                        {antennaStats.stations.map((sta, i) => (
                          <tr key={i} className="border-t border-slate-800">
                            <td className="px-3 py-1.5 font-mono text-[10px] text-emerald-400">{sta.mac}</td>
                            <td className="px-2 py-1.5 font-mono text-[10px] text-slate-300">{sta.signal ?? '—'}</td>
                            <td className="px-2 py-1.5 font-mono text-[10px] text-slate-300">{sta.ccq ?? '—'}%</td>
                            <td className="px-2 py-1.5 font-mono text-[10px] text-slate-300">{sta.txRate ?? '—'}/{sta.rxRate ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {antennaStats?.raw && (
            <pre className="text-[10px] text-amber-400 bg-slate-900 rounded-xl p-3 overflow-auto max-h-[160px]">
              {antennaStats.raw}
            </pre>
          )}

          {!antennaStats && !isLoadingAntenna && !antennaError && (
            <p className="text-center text-slate-400 text-xs py-4">Presiona "Leer stats" para conectar via SSH</p>
          )}
        </div>
      )}

      {/* ── ROUTER TAB ── */}
      {activeTab === 'router' && (
        <div className="p-4 space-y-3 flex-1">
          {/* WebUI link */}
          <a
            href={`http://${device.routerIp || device.ip}:${device.routerPort ?? 8075}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl text-xs font-bold
              bg-slate-800 text-white hover:bg-slate-700 transition-all active:scale-[0.98]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir interfaz web :{device.routerPort ?? 8075}</span>
          </a>

          {/* WiFi management */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Wifi className="w-3 h-3" />
                <span>Gestión WiFi</span>
              </p>
              <button
                onClick={handleLoadWifi}
                disabled={isLoadingWifi}
                className="flex items-center space-x-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50"
              >
                {isLoadingWifi ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                <span>{wifiInterfaces.length > 0 ? 'Actualizar' : 'Cargar WiFi'}</span>
              </button>
            </div>

            {wifiError && (
              <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{wifiError}</p>
            )}
            {wifiSaveMsg && (
              <p className={`text-[11px] px-3 py-2 rounded-lg border ${wifiSaveMsg.startsWith('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                {wifiSaveMsg}
              </p>
            )}

            {wifiInterfaces.map(iface => {
              const profile = wifiProfiles.find(p => p.name === iface.securityProfile);
              const isEditing = editingIface === iface.id;
              return (
                <div key={iface.id} className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {iface.disabled
                        ? <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                        : <Wifi className="w-3.5 h-3.5 text-emerald-500" />}
                      <span className="text-xs font-bold text-slate-700">{iface.name}</span>
                    </div>
                    <button
                      onClick={() => {
                        if (isEditing) { setEditingIface(null); return; }
                        setEditingIface(iface.id);
                        setNewSsid(iface.ssid);
                        setNewWpa2Key(profile?.wpa2Key ?? '');
                        setWifiSaveMsg('');
                      }}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline"
                    >
                      {isEditing ? 'Cancelar' : 'Editar'}
                    </button>
                  </div>

                  {!isEditing ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-[10px] text-slate-400">SSID</span>
                        <span className="text-[11px] font-mono font-bold text-slate-700">{iface.ssid || '—'}</span>
                      </div>
                      {profile && (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-400">Clave WiFi</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[11px] font-mono text-slate-700">
                              {showWifiPass[iface.id] ? (profile.wpa2Key || '—') : '••••••••'}
                            </span>
                            <button
                              onClick={() => setShowWifiPass(p => ({ ...p, [iface.id]: !p[iface.id] }))}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              {showWifiPass[iface.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Nuevo SSID</label>
                        <input
                          value={newSsid}
                          onChange={e => setNewSsid(e.target.value)}
                          className="input-field w-full text-xs"
                          placeholder={iface.ssid}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Clave WPA2</label>
                        <input
                          type="password"
                          value={newWpa2Key}
                          onChange={e => setNewWpa2Key(e.target.value)}
                          className="input-field w-full text-xs"
                          placeholder="Nueva clave (mín. 8 caracteres)"
                        />
                      </div>
                      <button
                        onClick={() => handleSaveWifi(iface)}
                        disabled={isSavingWifi || (!newSsid && !newWpa2Key)}
                        className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl text-xs font-bold
                          bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
                      >
                        {isSavingWifi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>{isSavingWifi ? 'Guardando...' : 'Guardar cambios'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {!isLoadingWifi && wifiInterfaces.length === 0 && !wifiError && (
              <p className="text-center text-slate-400 text-xs py-3">Presiona "Cargar WiFi" para ver la configuración</p>
            )}
          </div>

          {/* Router credentials display */}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Credenciales guardadas</p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">SSH User:</span>{' '}
                <span className="font-mono text-slate-600">{device.sshUser || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400">Router User:</span>{' '}
                <span className="font-mono text-slate-600">{device.routerUser || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400">Router IP:</span>{' '}
                <span className="font-mono text-slate-600">{device.routerIp || device.ip}</span>
              </div>
              <div>
                <span className="text-slate-400">Puerto Web:</span>{' '}
                <span className="font-mono text-slate-600">{device.routerPort ?? 8075}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
