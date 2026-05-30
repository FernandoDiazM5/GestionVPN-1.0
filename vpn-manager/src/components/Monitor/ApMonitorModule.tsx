import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Radio, Wifi, RefreshCw, Loader2, X,
  CheckCircle2, Activity, Clock,
  Server, Users, ZapOff, WifiOff,
  Search,
  AlertTriangle,
} from 'lucide-react';
import DeviceCard from '../Common/DeviceCard';
import M5FullInfoModal from '../Common/M5FullInfoModal';
import { useVpn } from '../../context/VpnContext';
import type { SavedDevice } from '../../types/devices';

import ApGroupCard from './components/ApGroupCard';
import DeviceCardModal from './components/modals/DeviceCardModal';
import MoveToNodeModal from './components/modals/MoveToNodeModal';
import CpeDetailModal from './components/modals/CpeDetailModal';
import ApDetailModal from './components/modals/ApDetailModal';

import { useApMonitorLogic } from './hooks/useApMonitorLogic';
import { usePolling } from './hooks/usePolling';

export default function ApMonitorModule() {
  const { nodes, activeNodeVrf, tunnelExpiry } = useVpn();
  const tunnelActive = activeNodeVrf !== null && tunnelExpiry !== null && tunnelExpiry > Date.now();
  const activeNode = useMemo(() => nodes.find(n => n.nombre_vrf === activeNodeVrf) ?? null, [nodes, activeNodeVrf]);
  const activeNodeName = activeNode?.nombre_nodo ?? null;

  const logic = useApMonitorLogic(nodes, activeNodeName);
  const polling = usePolling(logic.devices, activeNodeName);

  const [expandedAps, setExpandedAps] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('apMonitorExpandedAps');
      if (saved) return new Set(JSON.parse(saved));
    } catch(e) {}
    return new Set();
  });

  useEffect(() => {
    sessionStorage.setItem('apMonitorExpandedAps', JSON.stringify([...expandedAps]));
  }, [expandedAps]);

  const expandedApsRef = useRef(expandedAps);
  const prevActiveNodeNameRef = useRef<string | null>(null);

  useEffect(() => { expandedApsRef.current = expandedAps; }, [expandedAps]);

  useEffect(() => {
    const prevName = prevActiveNodeNameRef.current;
    prevActiveNodeNameRef.current = activeNodeName;
    if (prevName !== null && activeNodeName === null) {
      Object.values(polling.pollTimers.current).forEach(clearTimeout);
      polling.pollTimers.current = {};
      setExpandedAps(new Set());
      polling.autoPolledRef.current = false;
    }
  }, [activeNodeName]);

  useEffect(() => {
    polling.pollIntervalRef.current = polling.pollInterval;
    localStorage.setItem('vpn_ap_poll_ms', polling.pollInterval.toString());

    if (polling.pollInterval > 0) {
      expandedAps.forEach(apId => {
        if (!polling.pollTimers.current[apId]) polling.pollApDirect(apId);
      });
    } else {
      Object.keys(polling.pollTimers.current).forEach(apId => {
        clearTimeout(polling.pollTimers.current[apId]); delete polling.pollTimers.current[apId];
      });
    }
    Object.keys(polling.pollTimers.current).forEach(apId => {
      if (!expandedAps.has(apId)) { clearTimeout(polling.pollTimers.current[apId]); delete polling.pollTimers.current[apId]; }
    });
  }, [expandedAps, polling.pollApDirect, polling.pollInterval]);

  useEffect(() => () => {
    Object.values(polling.pollTimers.current).forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const currentDevices = polling.pollResultsRef.current;
    if (logic.devices.length === 0 || polling.autoPolledRef.current) return;
    polling.autoPolledRef.current = true;

    const apDevices = logic.devices.filter(d => d.role !== 'sta');
    const apsToInit = apDevices.filter(ap => {
      const hasCreds = ap.sshUser && (ap.sshPass || ap.hasSshPass);
      const pr = polling.pollResultsRef.current[ap.id];
      const isFresh = pr?.polledAt && (Date.now() - pr.polledAt < 300_000);
      return hasCreds && !isFresh;
    });
    const initTimers = apsToInit.map((dev, i) =>
      setTimeout(() => polling.pollApDirect(dev.id, false), i * 600)
    );
    return () => initTimers.forEach(clearTimeout);
  }, [logic.devices.length, polling.pollApDirect, activeNodeName]);

  const toggleAp = (apId: string) => {
    setExpandedAps(prev => {
      const next = new Set(prev);
      if (next.has(apId)) next.delete(apId); else next.add(apId);
      return next;
    });
  };

  const totalAps = logic.nodeGroups.reduce((s, g) => s + g.aps.length, 0);
  const totalCpes = Object.values(polling.pollResults).reduce((s, r) => s + r.stations.length, 0);

  return (
    <div className="space-y-5">
      {logic.toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-none">
          {logic.toast.type === 'error'
            ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          <span>{logic.toast.msg}</span>
        </div>
      )}

      <div className="card p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            <span>Monitor de APs</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Monitoreo en tiempo real — APs de la pestaña Equipos, agrupados por nodo
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-right text-sm text-slate-500">
            <span className="font-bold text-indigo-600">{logic.nodeGroups.length}</span> nodos ·{' '}
            <span className="font-bold text-indigo-600">{totalAps}</span> APs ·{' '}
            <span className="font-bold text-violet-600">{totalCpes}</span> CPEs live
          </div>
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-xs shrink-0">
            <button
              onClick={() => logic.setNodeFilter('active')}
              title="Nodos activos"
              className={`flex items-center gap-1 px-2 py-1.5 font-bold transition-colors
                ${logic.nodeFilter === 'active'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              <CheckCircle2 className="w-3 h-3" />
              <span className="text-[10px]">Activos</span>
            </button>
            <button
              onClick={() => logic.setNodeFilter('inactive')}
              title="Nodos inactivos"
              className={`flex items-center gap-1 px-2 py-1.5 font-bold border-x border-slate-200 transition-colors
                ${logic.nodeFilter === 'inactive'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              <ZapOff className="w-3 h-3" />
              <span className="text-[10px]">Inactivos</span>
            </button>
            <button
              onClick={() => logic.setNodeFilter('all')}
              title="Todos los nodos"
              className={`flex items-center gap-1 px-2 py-1.5 font-bold transition-colors
                ${logic.nodeFilter === 'all'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              <Users className="w-3 h-3" />
              <span className="text-[10px]">Todos</span>
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={logic.apSearch} onChange={e => logic.setApSearch(e.target.value)}
              placeholder="Buscar AP…"
              className="pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-44"
            />
            {logic.apSearch && <button onClick={() => logic.setApSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <div className="flex items-center gap-1.5 border border-slate-200 rounded-xl px-2 bg-white">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={polling.pollInterval}
              onChange={e => polling.setPollInterval(Number(e.target.value))}
              className="text-xs bg-transparent focus:outline-none text-slate-600 font-medium py-2 appearance-none pr-4"
              style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="none" viewBox="0 0 24 24" stroke="%2394a3b8" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '0.8rem' }}
            >
              <option value={0}>Auto-poll Off</option>
              <option value={15000}>15s</option>
              <option value={30000}>30s</option>
              <option value={60000}>1m</option>
              <option value={120000}>2m</option>
              <option value={300000}>5m</option>
            </select>
          </div>
          <button onClick={() => {
            Object.values(polling.pollTimers.current).forEach(clearTimeout);
            polling.pollTimers.current = {};
            polling.autoPolledRef.current = false;
            logic.loadDevices();
          }} disabled={logic.loading}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors disabled:opacity-50"
            title="Recargar lista de equipos">
            {logic.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Online</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Parcial / Errores</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400" /> Conectando…</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Sin datos</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {polling.pollInterval > 0 ? `Poll cada ${polling.pollInterval/1000}s (expandido)` : 'Auto-poll desactivado'}</span>
      </div>

      {logic.loading && (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      )}

      {!logic.loading && logic.nodeGroups.length === 0 && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Radio className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <p className="text-slate-500 font-medium">Sin APs guardados</p>
            <p className="text-slate-400 text-sm mt-1">
              Ve a la pestaña <strong>Escanear</strong>, agrega dispositivos con rol "AP" y vuelve aquí para monitorearlos.
            </p>
          </div>
        </div>
      )}

      {!logic.loading && logic.nodeFilter === 'active' && !tunnelActive && logic.filteredGroups.length === 0 && (
        <div className="card p-8 text-center text-slate-400">
          <WifiOff className="w-8 h-8 mx-auto mb-3 text-amber-400" />
          <p className="font-semibold text-slate-600">Sin túnel VPN activo</p>
          <p className="text-sm mt-1">Conéctate a un nodo para ver sus APs en tiempo real</p>
        </div>
      )}

      {!logic.loading && logic.filteredGroups.map(group => (
        <ApGroupCard
          key={group.nodeId}
          group={group}
          expandedAps={expandedAps}
          pollResults={polling.pollResults}
          activeNodeName={activeNodeName}
          tunnelActive={tunnelActive}
          onToggleAp={toggleAp}
          onCpeDetail={(mac, ip, dev) => {
            if (!dev) return;
            logic.setCpeDetailTarget({
              mac,
              apId: dev.id,
              ip,
              sshPort: dev.sshPort ?? 22,
              sshUser: dev.sshUser ?? '',
              sshPass: dev.sshPass ?? '',
            });
          }}
          onApDetail={dev => logic.setApDetailDev(dev)}
          onM5Detail={dev => logic.setM5DetailDevice(dev)}
          onApView={dev => logic.setViewingApDevice(dev)}
          onApSync={apId => polling.pollApDirect(apId, true, true)}
          onApDelete={dev => logic.handleDeleteDev(dev)}
          onApMove={dev => logic.setMovingDevice(dev)}
        />
      ))}

      {logic.cpeDetailTarget && (
        <CpeDetailModal
          mac={logic.cpeDetailTarget.mac}
          apId={logic.cpeDetailTarget.apId}
          cpeIp={logic.cpeDetailTarget.ip}
          sshPort={logic.cpeDetailTarget.sshPort}
          sshUser={logic.cpeDetailTarget.sshUser}
          sshPass={logic.cpeDetailTarget.sshPass}
          onClose={() => logic.setCpeDetailTarget(null)}
        />
      )}

      {logic.apDetailDev && (
        <ApDetailModal
          dev={logic.apDetailDev}
          onClose={() => logic.setApDetailDev(null)}
          onSave={stats => {
            if (logic.apDetailDev) {
              logic.handleSaveApDetail(logic.apDetailDev, stats);
              logic.setApDetailDev(null);
            }
          }}
        />
      )}

      {logic.m5DetailDevice && (
        <M5FullInfoModal dev={logic.m5DetailDevice} onClose={() => logic.setM5DetailDevice(null)} />
      )}

      {logic.viewingApDevice && (
        <DeviceCardModal
          device={logic.viewingApDevice}
          onClose={() => logic.setViewingApDevice(null)}
          onRemove={() => logic.handleDeleteDev(logic.viewingApDevice)}
          onUpdate={logic.handleUpdateApDevice}
        />
      )}

      {logic.movingDevice && (
        <MoveToNodeModal
          device={logic.movingDevice}
          nodes={nodes}
          knownNames={[...new Set(logic.devices.map(d => d.nodeName).filter(Boolean))]}
          onConfirm={logic.handleMoveConfirm}
          onClose={() => logic.setMovingDevice(null)}
        />
      )}
    </div>
  );
}
