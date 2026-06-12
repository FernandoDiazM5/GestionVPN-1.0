// ============================================================
//  NetworkDevicesModule — orquestador del módulo "Dispositivos"
//
//  Tras FASE 8 del refactor: solo orquesta hooks + componentes,
//  sin lógica de scan/filtro/tabla. Cada responsabilidad vive en:
//
//    hooks/useDeviceScan     → escaneo SSE + auth SSH
//    hooks/useDeviceList     → search + filter + sort
//    hooks/useColumnPrefs    → visibilidad + ancho + gridTemplate
//    hooks/useDeviceLibrary  → savedDevices CRUD + toast
//
//    components/ScanControls         → selector subred + botón
//    components/ScanProgressBanner   → progreso + error + empty
//    components/DeviceFilters        → search + SSID
//    components/DeviceTable          → header + filas memoizadas
//    components/DeviceTableRow       → fila individual (memo)
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  CheckCircle2, Cpu, ShieldCheck, ShieldOff, RefreshCw, Radio, Download, Save, Loader2,
} from 'lucide-react';

import { useVpn } from '../../../context';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../../../types/devices';
import type { NodeInfo } from '../../../types/api';

import { AddDeviceModal } from './components/AddDeviceModal';
import { DeviceCardModal } from './components/DeviceCardModal';
import { SshDataModal } from './components/SshDataModal';
import { ColumnPicker } from './components/ColumnPicker';
import { exportScanToCsv } from './utils/exportCsv';
import { ScanControls } from './components/ScanControls';
import { ScanProgressBanner } from './components/ScanProgressBanner';
import { DeviceFilters } from './components/DeviceFilters';
import { DeviceTable } from './components/DeviceTable';
import M5FullInfoModal from '../../Common/M5FullInfoModal';

import { SESSION_SCAN_KEY } from './constants';
import type { ScanCred } from './types';

import { useDeviceScan } from './hooks/useDeviceScan';
import { useDeviceList } from './hooks/useDeviceList';
import { useColumnPrefs } from './hooks/useColumnPrefs';
import { useDeviceLibrary } from './hooks/useDeviceLibrary';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function NetworkDevicesModule() {
  const { credentials, activeNodeVrf, nodes, setNodes } = useVpn();

  // ── Estado puramente UI (modales + selección de nodo) ─────────────
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [manualLan, setManualLan] = useState('');
  const [addingDevice, setAddingDevice] = useState<ScannedDevice | null>(null);
  const [editingDevice, setEditingDevice] = useState<SavedDevice | null>(null);
  const [viewingDevice, setViewingDevice] = useState<SavedDevice | null>(null);
  const [viewingRawDevice, setViewingRawDevice] = useState<ScannedDevice | null>(null);
  const [m5DetailDevice, setM5DetailDevice] = useState<ScannedDevice | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [nodeSshCreds, setNodeSshCreds] = useState<ScanCred[]>([]);

  // ── Derivados básicos del estado externo ──────────────────────────
  const activeNode = activeNodeVrf ? nodes.find(n => n.nombre_vrf === activeNodeVrf) ?? null : null;
  const effectiveLan = manualLan.trim() || selectedNode?.segmento_lan || '';

  // ── Hooks especializados ──────────────────────────────────────────
  const colPrefs = useColumnPrefs();

  // Necesitamos savedDevices ANTES del scan (runAuthPhase usa creds saved).
  // Inicializamos library con stubs que se reasignan después del scan; el
  // ciclo se contiene porque setScanResults/setSshStatus son estables (setters).
  const scanRef = useRef<ReturnType<typeof useDeviceScan> | null>(null);
  const library = useDeviceLibrary({
    nodesLength: nodes.length,
    setScanResults: (updater) => scanRef.current?.setScanResults(updater),
    setSshStatus: (updater) => scanRef.current?.setSshStatus(updater),
    setAddingDevice,
  });

  const scan = useDeviceScan({
    activeNodeVrf, nodes, effectiveLan,
    savedDevices: library.savedDevices,
    nodeSshCreds, setNodeSshCreds,
  });
  // Asignar el ref en effect (no durante render — anti-pattern en strict mode R19).
  // Seguro porque los wrappers de `library` solo se invocan dentro de handlers de
  // eventos (post-mount), nunca durante el render inicial.
  useEffect(() => { scanRef.current = scan; });

  const list = useDeviceList({ scanResults: scan.scanResults, savedIds: library.savedIds });

  // ── Carga inicial de nodos ────────────────────────────────────────
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-seleccionar el nodo activo + autocompletar su subred. Es un efecto de
  // SINCRONIZACIÓN de estado derivado (prop externo del context → state local) y
  // condicional, así que no se puede expresar como useMemo.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (activeNodeVrf && nodes.length > 0) {
      const active = nodes.find(n => n.nombre_vrf === activeNodeVrf);
      if (active) {
        setSelectedNode(active);
        const subnets = (active.lan_subnets && active.lan_subnets.length > 0)
          ? active.lan_subnets
          : (active.segmento_lan ? [active.segmento_lan] : []);
        if (subnets.length > 0) setManualLan(subnets[0]);
      }
    }
  }, [activeNodeVrf, nodes]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reset scan results cuando cambia el nodo seleccionado (otro origen).
  // NO incluimos `scan` en deps: es un objeto que se recrea cada render, lo que
  // dispararía el effect constantemente. Los setters de React son estables, así
  // que extraerlos a variables locales evita la dep falsa.
  const prevSelectedNodeIdRef = useRef<string | null>(null);
  const { setScanResults: resetScanResults, setSshStatus: resetSshStatus } = scan;
  useEffect(() => {
    const newId = selectedNode?.id ?? null;
    if (prevSelectedNodeIdRef.current !== null && newId !== prevSelectedNodeIdRef.current) {
      resetScanResults([]);
      resetSshStatus({});
      setNodeSshCreds([]);
      try { sessionStorage.removeItem(SESSION_SCAN_KEY); } catch { /* ignore */ }
    }
    prevSelectedNodeIdRef.current = newId;
  }, [selectedNode, resetScanResults, resetSshStatus]);

  const availableSubnets: string[] = useMemo(() => {
    if (!activeNode) return [];
    const subnets = (activeNode.lan_subnets && activeNode.lan_subnets.length > 0)
      ? activeNode.lan_subnets
      : (activeNode.segmento_lan ? [activeNode.segmento_lan] : []);
    return [...new Set(subnets)];
  }, [activeNode]);

  // ── Handlers de fila (cierran sobre setters del orquestador) ──────
  // Desestructuramos `scan` y `library` para depender SOLO de las funciones
  // internas (memoizadas con useCallback dentro de cada hook). Los objetos
  // `scan` y `library` se recrean en cada render, así que usar `[scan]` o
  // `[library]` como dep dispararía effects/handlers en cada repintado.
  const { setScanResults } = scan;
  const { handleRemoveDevice, handleUpdateDevice, showToast, handleDirectSave, handleAddDevice } = library;

  const toggleExpand = useCallback((ip: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip); else next.add(ip);
      return next;
    });
  }, []);

  // Candidatos para "Guardar todos con stats": filas visibles que tienen
  // SSH OK y aún no están guardadas. Se calcula sobre `sortedRows` (lo
  // visible tras filtros) para que el botón refleje lo que el usuario ve.
  const bulkSaveCandidates = useMemo(() => {
    return list.sortedRows.filter(r =>
      !r.isSaved && scan.sshStatus[r.dev.ip] === 'success' && !!r.dev.cachedStats
    );
  }, [list.sortedRows, scan.sshStatus]);

  const [bulkSaving, setBulkSaving] = useState(false);
  const handleBulkSave = useCallback(async () => {
    if (!selectedNode || bulkSaveCandidates.length === 0 || bulkSaving) return;
    if (bulkSaveCandidates.length > 5) {
      const ok = window.confirm(
        `Vas a guardar ${bulkSaveCandidates.length} dispositivos en la biblioteca local del nodo ${selectedNode.nombre_nodo}. ¿Continuar?`
      );
      if (!ok) return;
    }
    setBulkSaving(true);
    // Promise.allSettled — si uno falla, los demás siguen. handleDirectSave
    // es idempotente, podríamos relanzar si quisiéramos retry. Por ahora
    // solo contamos ok/fail.
    const results = await Promise.allSettled(
      bulkSaveCandidates.map(r => handleDirectSave(r.dev, selectedNode))
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    setBulkSaving(false);
    if (failed > 0) {
      showToast(`Guardados ${results.length - failed}. ${failed} fallaron.`);
    } else {
      showToast(`Guardados ${results.length} dispositivos`);
    }
  }, [selectedNode, bulkSaveCandidates, bulkSaving, handleDirectSave, showToast]);

  const handleSyncToSaved = useCallback((dev: ScannedDevice, savedDev: SavedDevice) => {
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
  }, [handleUpdateDevice, showToast]);

  const handleOpenScanView = useCallback((dev: ScannedDevice) => {
    const devId = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
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
  }, [selectedNode]);

  const handleRefreshStats = useCallback((ip: string, freshStats: AntennaStats) => {
    setScanResults(prev => prev.map(r => r.ip === ip ? { ...r, cachedStats: freshStats } : r));
  }, [setScanResults]);

  const handleRemoveDeviceUnified = useCallback(async (id: string) => {
    await handleRemoveDevice(id);
    if (viewingDevice?.id === id) setViewingDevice(null);
  }, [handleRemoveDevice, viewingDevice]);

  const handleUpdateDeviceUnified = useCallback(async (updated: SavedDevice) => {
    await handleUpdateDevice(updated);
    if (viewingDevice?.id === updated.id) setViewingDevice(updated);
  }, [handleUpdateDevice, viewingDevice]);

  // ── Derivados de UI ────────────────────────────────────────────────
  const isTunnelActive = !!activeNodeVrf;
  const activeNodeName = activeNodeVrf
    ? nodes.find(n => n.nombre_vrf === activeNodeVrf)?.nombre_nodo ?? activeNodeVrf
    : null;

  return (
    <div className="space-y-5">

      {library.toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2
          bg-slate-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{library.toast}</span>
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
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{library.savedDevices.length}</span> guardados
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

        <ScanControls
          isTunnelActive={isTunnelActive}
          activeNode={activeNode}
          availableSubnets={availableSubnets}
          manualLan={manualLan}
          setManualLan={setManualLan}
          nodeSshCreds={nodeSshCreds}
          effectiveLan={effectiveLan}
          canScan={scan.canScan}
          isScanning={scan.isScanning}
          onScan={scan.handleScan}
        />

        <ScanProgressBanner
          scanState={scan.scanState}
          discoveryProgress={scan.discoveryProgress}
          effectiveLan={effectiveLan}
          debugMsg={scan.debugMsg}
          scanError={scan.scanError}
          scannedCount={scan.scannedCount}
          scanResultsCount={scan.scanResults.length}
        />

        {/* Estado vacío: skeleton mientras escanea, empty card cuando ocioso */}
        {list.scanRows.length === 0 && (
          scan.isScanning ? (
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
          ) : !scan.scanError && scan.scannedCount === 0 ? (
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
                    ? `Pulsa "Escanear dispositivos" para descubrir equipos Ubiquiti en ${effectiveLan || 'la subred'}.`
                    : 'Activa el acceso a un nodo en la pestaña "Nodos" para escanear la LAN remota.'}
                </p>
              </div>
            </div>
          ) : null
        )}

        {list.scanRows.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span>
                  {list.scanRows.length} dispositivo{list.scanRows.length !== 1 ? 's' : ''}
                </span>
                {list.scanRows.filter(r => r.dev.cachedStats).length > 0 && (
                  <>
                    <span className="text-slate-200">·</span>
                    <span className="text-emerald-500">
                      {list.scanRows.filter(r => r.dev.cachedStats).length} autenticados
                    </span>
                  </>
                )}
                {list.scanRows.filter(r => r.isSaved).length > 0 && (
                  <>
                    <span className="text-slate-200">·</span>
                    <span className="text-indigo-500">
                      {list.scanRows.filter(r => r.isSaved).length} guardados
                    </span>
                  </>
                )}
              </p>
              <div className="flex items-center gap-1.5">
                {/* Bulk save — solo aparece si hay candidatos visibles con SSH OK */}
                {bulkSaveCandidates.length > 0 && selectedNode && (
                  <button
                    onClick={handleBulkSave}
                    disabled={bulkSaving}
                    title={`Guardar los ${bulkSaveCandidates.length} dispositivos visibles con SSH OK en la biblioteca del nodo`}
                    aria-label={`Guardar ${bulkSaveCandidates.length} dispositivos con stats`}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-[0.97] disabled:opacity-50"
                  >
                    {bulkSaving
                      ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" />
                      : <Save className="w-3.5 h-3.5" />}
                    <span>Guardar {bulkSaveCandidates.length}</span>
                  </button>
                )}
                <button
                  onClick={() => exportScanToCsv(list.sortedRows, selectedNode?.nombre_nodo)}
                  disabled={list.sortedRows.length === 0}
                  title="Exportar la tabla visible (con filtros aplicados) a CSV"
                  aria-label="Exportar a CSV"
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-500"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar</span>
                </button>
                <ColumnPicker visibleCols={colPrefs.visibleCols} onChange={colPrefs.saveVisibleCols} />
              </div>
            </div>

            <DeviceFilters
              searchQuery={list.searchQuery}
              setSearchQuery={list.setSearchQuery}
              filterSSID={list.filterSSID}
              setFilterSSID={list.setFilterSSID}
              filterRole={list.filterRole}
              setFilterRole={list.setFilterRole}
              uniqueSSIDs={list.uniqueSSIDs}
              filteredCount={list.sortedRows.length}
              totalCount={list.scanRows.length}
            />

            <DeviceTable
              sortedRows={list.sortedRows}
              activeConfigCols={colPrefs.activeConfigCols}
              gridTemplate={colPrefs.gridTemplate}
              minTableWidth={colPrefs.minTableWidth}
              sortConfig={list.sortConfig}
              toggleSort={list.toggleSort}
              startResize={colPrefs.startResize}
              sshStatus={scan.sshStatus}
              expandedRows={expandedRows}
              toggleExpand={toggleExpand}
              savedDevices={library.savedDevices}
              selectedNode={selectedNode}
              onOpenM5Detail={setM5DetailDevice}
              onSyncToSaved={handleSyncToSaved}
              onOpenSavedView={setViewingDevice}
              onOpenScanView={handleOpenScanView}
              onDirectSave={handleDirectSave}
              onOpenAddModal={setAddingDevice}
              onRefreshStats={handleRefreshStats}
            />
          </div>
        )}
      </div>

      {/* ── Modales ─────────────────────────────────────────────── */}
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
          onSave={(d) => { handleAddDevice(d); setEditingDevice(null); }}
          onClose={() => setEditingDevice(null)}
        />
      )}

      {viewingDevice && (
        <DeviceCardModal
          device={viewingDevice}
          onClose={() => setViewingDevice(null)}
          onRemove={() => handleRemoveDeviceUnified(viewingDevice.id)}
          onUpdate={handleUpdateDeviceUnified}
        />
      )}

      {m5DetailDevice && (
        <M5FullInfoModal dev={m5DetailDevice} onClose={() => setM5DetailDevice(null)} />
      )}
    </div>
  );
}
