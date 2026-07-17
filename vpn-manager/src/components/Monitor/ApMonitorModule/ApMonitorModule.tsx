import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Radio,
  CheckCircle2, WifiOff,
  AlertTriangle,
} from 'lucide-react';
import AsyncQueryState from '../../Common/AsyncQueryState';
import M5FullInfoModal from '../../Common/M5FullInfoModal';
import ConfirmModal from '../../Common/ConfirmModal';
import { useVpn } from '../../../context';

import ApGroupCard from './components/ApGroupCard';
import DeviceCardModal from './components/modals/DeviceCardModal';
import MoveToNodeModal from './components/modals/MoveToNodeModal';
import CpeDetailModal from './components/modals/CpeDetailModal';
import ApDetailModal from './components/modals/ApDetailModal';
import SshRevealModal from './components/modals/SshRevealModal';
import TunnelInactiveModal from './components/modals/TunnelInactiveModal';
import MonitorHeader from './components/MonitorHeader';

import { useApMonitorLogic } from './hooks/useApMonitorLogic';
import { usePolling } from './hooks/usePolling';
import { useApPollEvents } from './hooks/useApPollEvents';

export default function ApMonitorModule() {
  const { nodes, activeNodeVrf, tunnelExpiry, setActiveModule } = useVpn();
  const tunnelActive = activeNodeVrf !== null && tunnelExpiry !== null && tunnelExpiry > Date.now();
  const activeNode = useMemo(() => nodes.find(n => n.nombre_vrf === activeNodeVrf) ?? null, [nodes, activeNodeVrf]);
  const activeNodeName = activeNode?.nombre_nodo ?? null;

  const logic = useApMonitorLogic(nodes, activeNodeName);
  const polling = usePolling(logic.devices, activeNodeName, logic.notifyTunnelInactive);
  const { pingWatch, seedFromDb, ingestApPoll } = polling;

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
      setExpandedAps(new Set());
    }
  }, [activeNodeName]);

  // E1/Etapa 2: en vez del "burst" de SSH del navegador al montar, ahora
  //   (a) avisamos al backend que estamos mirando (heartbeat → apPollJob),
  //   (b) sembramos el estado desde la BD (cpes.last_stats), y
  //   (c) recibimos actualizaciones en vivo por SSE ('ap-poll').
  // El SSH a antenas vive en el backend (§43). El sync manual sigue disponible.
  useEffect(() => {
    pingWatch();
    const t = setInterval(pingWatch, 30_000);
    return () => clearInterval(t);
  }, [pingWatch]);

  useEffect(() => { seedFromDb(); }, [seedFromDb]);

  const apPollConnectionStatus = useApPollEvents(ingestApPoll, true);

  const toggleAp = (apId: string) => {
    setExpandedAps(prev => {
      const next = new Set(prev);
      if (next.has(apId)) next.delete(apId); else next.add(apId);
      return next;
    });
  };

  // B1: los contadores reflejan la vista filtrada (no el inventario total),
  // para que el header coincida con lo que realmente se muestra abajo.
  const visibleApIds = useMemo(
    () => new Set(logic.filteredGroups.flatMap(g => g.aps.map(a => a.id))),
    [logic.filteredGroups],
  );
  const totalAps = logic.filteredGroups.reduce((s, g) => s + g.aps.length, 0);
  const totalCpes = Object.entries(polling.pollResults).reduce(
    (s, [id, r]) => (visibleApIds.has(id) ? s + r.stations.length : s), 0);

  // E7: frescura global = poll más reciente entre los APs visibles.
  const lastPolledAt = useMemo(() => {
    let m = 0;
    for (const [id, r] of Object.entries(polling.pollResults)) {
      if (visibleApIds.has(id) && r.polledAt > m) m = r.polledAt;
    }
    return m;
  }, [polling.pollResults, visibleApIds]);

  // Tick de UI (solo refresca la etiqueta "hace Xs"; no hace SSH).
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // E7: sincroniza CPEs de TODOS los APs visibles con credenciales.
  // Disparo MANUAL (botón) → permitido por §43. Persiste historial (saveCount).
  const syncableAps = useMemo(
    () => logic.filteredGroups.flatMap(g => g.aps).filter(ap => ap.sshUser && (ap.sshPass || ap.hasSshPass)),
    [logic.filteredGroups],
  );
  const syncAllVisible = () => {
    syncableAps.forEach((ap, i) => setTimeout(() => polling.pollApDirect(ap.id, true), i * 600));
  };

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

      <MonitorHeader
        nodeCount={logic.filteredGroups.length}
        apCount={totalAps}
        cpeCount={totalCpes}
        nodeFilter={logic.nodeFilter}
        search={logic.apSearch}
        connectionStatus={apPollConnectionStatus}
        lastPolledAt={lastPolledAt}
        canSync={syncableAps.length > 0}
        reloading={logic.loading}
        onFilterChange={logic.setNodeFilter}
        onSearchChange={logic.setApSearch}
        onSync={syncAllVisible}
        onReload={() => { void logic.loadDevices(); polling.seedFromDb(); }}
      />

      {(logic.loading || logic.loadError) && (
        <AsyncQueryState
          loading={logic.loading}
          error={logic.loadError}
          onRetry={() => { void logic.loadDevices(); }}
          loadingLabel="Cargando equipos..."
          skeletonRows={4}
        >
          <div />
        </AsyncQueryState>
      )}

      {!logic.loading && !logic.loadError && logic.nodeGroups.length === 0 && (
        <div className="card border-dashed border-2 border-slate-200 dark:border-slate-700 py-16 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center">
            <Radio className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <p className="text-slate-600 dark:text-slate-300 font-semibold">Sin APs guardados</p>
            <p className="text-slate-500 dark:text-slate-500 text-sm mt-1 max-w-sm">
              Ve a la pestaña <strong>Escanear</strong>, agrega dispositivos con rol "AP" y vuelve aquí para monitorearlos.
            </p>
          </div>
        </div>
      )}

      {!logic.loading && !logic.loadError && logic.nodeFilter === 'active' && !tunnelActive && logic.filteredGroups.length === 0 && (
        <div className="card p-8 text-center text-slate-500 dark:text-slate-400">
          <WifiOff className="w-8 h-8 mx-auto mb-3 text-amber-400" />
          <p className="font-semibold text-slate-600 dark:text-slate-300">Sin túnel VPN activo</p>
          <p className="text-sm mt-1">Conéctate a un nodo para ver sus APs en tiempo real</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => setActiveModule('nodes')} className="btn-primary btn-sm">
              Conectar a un nodo
            </button>
            <button onClick={() => logic.setNodeFilter('all')} className="btn-outline btn-sm">
              Ver todos los nodos
            </button>
          </div>
        </div>
      )}

      {!logic.loading && !logic.loadError && logic.filteredGroups.map(group => (
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
          onApSync={apId => polling.pollApDirect(apId, true)}
          onApDelete={dev => logic.handleDeleteDev(dev)}
          onApMove={dev => logic.setMovingDevice(dev)}
          onApRevealSsh={dev => logic.handleRevealSsh(dev)}
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
          onTunnelInactive={logic.notifyTunnelInactive}
        />
      )}

      {logic.apDetailDev && (
        <ApDetailModal
          dev={logic.apDetailDev}
          onClose={() => logic.setApDetailDev(null)}
          onTunnelInactive={logic.notifyTunnelInactive}
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
          onRemove={() => {
            if (logic.viewingApDevice) {
              logic.handleDeleteDev(logic.viewingApDevice);
            }
          }}
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

      {logic.revealSsh && (
        <SshRevealModal data={logic.revealSsh} onClose={() => logic.setRevealSsh(null)} />
      )}

      {logic.tunnelAlert && (
        <TunnelInactiveModal
          message={logic.tunnelAlert.message}
          onClose={() => logic.setTunnelAlert(null)}
          onGoActivate={() => { logic.setTunnelAlert(null); setActiveModule('nodes'); }}
        />
      )}

      <ConfirmModal
        isOpen={!!logic.deleteTarget}
        title="Eliminar equipo"
        message={`¿Eliminar ${logic.deleteTarget?.cachedStats?.deviceName ?? logic.deleteTarget?.name ?? logic.deleteTarget?.ip ?? ''}? Se quitará del monitor.`}
        confirmLabel="Eliminar"
        onConfirm={logic.confirmDeleteDev}
        onCancel={() => logic.setDeleteTarget(null)}
      />
    </div>
  );
}
