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
  ArrowRight, Bookmark, CheckCircle2, Cpu, ShieldCheck, ShieldOff, RefreshCw, Radio, Save, Loader2, MapPin, RotateCcw, Sparkles, History,
} from 'lucide-react';

import { useVpn } from '../../../context';
import { credCache } from '../../../store/deviceDb';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../../../types/devices';
import type { NodeInfo } from '../../../types/api';

import { AddDeviceModal } from './components/AddDeviceModal';
import { ColumnPicker } from './components/ColumnPicker';
import { ExportMenu } from './components/ExportMenu';
import { ScanControls } from './components/ScanControls';
import { ScanProgressBanner } from './components/ScanProgressBanner';
import { DeviceFilters } from './components/DeviceFilters';
import { DeviceTable } from './components/DeviceTable';
import M5FullInfoModal from '../../Common/M5FullInfoModal';
import ConfirmModal from '../../Common/ConfirmModal';
import { Button, EmptyState, PageHeader } from '../../Common/ui';
import type { ExportMetadata } from './utils/exportShared';

import { ipInCidr, SESSION_SCAN_KEY } from './constants';

import { useDeviceScan } from './hooks/useDeviceScan';
import { useDeviceList } from './hooks/useDeviceList';
import { useColumnPrefs } from './hooks/useColumnPrefs';
import { useDeviceLibrary } from './hooks/useDeviceLibrary';
import { useScanPreferences } from './hooks/useScanPreferences';
import { useWorkspaceSession } from '../../../context/WorkspaceSession';
import { useNodeInventory } from '../../../query/nodeInventory';
import { useAirOsAi } from './hooks/useAirOsAi';
import { useNodeSshCredentials } from './hooks/useNodeSshCredentials';
import { AirOsAiDialog } from './components/AirOsAiDialog';
import { AirOsAiHistoryDialog } from './components/AirOsAiHistoryDialog';

export default function NetworkDevicesModule() {
  const { credentials, activeNodeVrf, nodes, setNodes, setActiveModule } = useVpn();
  const { session } = useWorkspaceSession();
  const nodeInventory = useNodeInventory(!!credentials);
  const airOsAi = useAirOsAi(session?.role === 'OWNER' && !session.platform_admin);

  // ── Preferencias persistentes (§40) ───────────────────────────────
  // Almacén ÚNICO: columnas + anchos + sort + filtros + búsqueda + subred.
  // Migra silenciosamente desde las claves viejas v1/v2 la primera vez.
  const prefs = useScanPreferences();

  // ── Estado puramente UI (modales + selección de nodo) ─────────────
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [addingDevice, setAddingDevice] = useState<ScannedDevice | null>(null);
  const [m5DetailDevice, setM5DetailDevice] = useState<ScannedDevice | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAiHistory, setShowAiHistory] = useState(false);

  // ── Derivados básicos del estado externo ──────────────────────────
  const activeNode = activeNodeVrf ? nodes.find(n => n.nombre_vrf === activeNodeVrf) ?? null : null;
  const nodeCredentials = useNodeSshCredentials(activeNode);

  // Fallback: si `selectedNode` aún no se hidrató (el useEffect de sync se
  // dispara post-mount, y a veces VpnContext rehidrata activeNodeVrf más
  // tarde), usar `activeNode` como destino efectivo para guardar / mostrar.
  // Esto evita el caso "celda Acción vacía" que aparecía cuando había
  // túnel activo pero `selectedNode` seguía siendo null — el botón Guardar
  // requiere `selectedNode` para asociar el dispositivo al nodo correcto.
  const effectiveNode = selectedNode ?? activeNode;
  const effectiveLan = prefs.manualLan.trim() || effectiveNode?.segmento_lan || '';

  // ── Hooks especializados ──────────────────────────────────────────
  const colPrefs = useColumnPrefs({
    visibleCols: prefs.visibleCols,
    colWidths: prefs.colWidths,
    setColWidths: prefs.setColWidths,
  });

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
    activeNodeVrf, effectiveLan,
    savedDevices: library.savedDevices,
    nodeSshCreds: nodeCredentials.creds,
  });
  // Asignar el ref en effect (no durante render — anti-pattern en strict mode R19).
  // Seguro porque los wrappers de `library` solo se invocan dentro de handlers de
  // eventos (post-mount), nunca durante el render inicial.
  useEffect(() => { scanRef.current = scan; });

  const list = useDeviceList({
    scanResults: scan.scanResults,
    savedIds: library.savedIds,
    searchQuery: prefs.searchQuery,
    setSearchQuery: prefs.setSearchQuery,
    filterSSID: prefs.filterSSID,
    setFilterSSID: prefs.setFilterSSID,
    filterRole: prefs.filterRole,
    setFilterRole: prefs.setFilterRole,
    sortConfig: prefs.sortConfig,
    setSortConfig: prefs.setSortConfig,
  });

  // ── Carga inicial de nodos ────────────────────────────────────────
  useEffect(() => {
    if (nodeInventory.data) setNodes(nodeInventory.data);
  }, [nodeInventory.data, setNodes]);

  // Auto-seleccionar el nodo activo + autocompletar su subred. Es un efecto de
  // SINCRONIZACIÓN de estado derivado (prop externo del context → state local) y
  // condicional, así que no se puede expresar como useMemo.
  //
  // §40: si el usuario ya tenía persistida una subred MANUAL válida para alguna
  // de las opciones del nodo activo, la respetamos. Si no, autocompletamos con
  // la primera opción del nodo.
  const { setManualLan } = prefs;
  const persistedLanRef = useRef(prefs.manualLan);
  useEffect(() => {
    if (activeNodeVrf && nodes.length > 0) {
      const active = nodes.find(n => n.nombre_vrf === activeNodeVrf);
      if (active) {
        setSelectedNode(active);
        const subnets = (active.lan_subnets && active.lan_subnets.length > 0)
          ? active.lan_subnets
          : (active.segmento_lan ? [active.segmento_lan] : []);
        if (subnets.length > 0) {
          const persisted = persistedLanRef.current;
          // Solo respeta la persistida si pertenece a este nodo (evita "contaminar"
          // un nodo nuevo con la subred de otro). En caso contrario auto-completa.
          if (persisted && subnets.includes(persisted)) {
            // ya está bien — no escribimos
          } else {
            setManualLan(subnets[0]);
          }
        }
      }
    }
  }, [activeNodeVrf, nodes, setManualLan]);

  // §42-2: selección manual del usuario para bulk save. Declarado ANTES del
  // useEffect que limpia al cambiar de nodo. Se mantiene en memoria (no en
  // localStorage — debería resetearse entre sesiones).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

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
      // §42-2: la selección de bulk save también se limpia al cambiar de nodo
      // — los devIds del nodo anterior no aplican aquí y dejarlos confunde.
      setSelectedIds(new Set());
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

  const savedCredentialCount = useMemo(() => library.savedDevices.filter(device =>
    (device.hasSshPass || !!device.sshPass) && (!effectiveLan || ipInCidr(device.ip, effectiveLan))
  ).length, [library.savedDevices, effectiveLan]);

  // ── Handlers de fila (cierran sobre setters del orquestador) ──────
  // Desestructuramos `scan` y `library` para depender SOLO de las funciones
  // internas (memoizadas con useCallback dentro de cada hook). Los objetos
  // `scan` y `library` se recrean en cada render, así que usar `[scan]` o
  // `[library]` como dep dispararía effects/handlers en cada repintado.
  const { setScanResults } = scan;
  const { handleUpdateDevice, showToast, handleDirectSave, handleAddDevice } = library;

  const toggleExpand = useCallback((ip: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip); else next.add(ip);
      return next;
    });
  }, []);

  // §42 fix: el AP sólo conoce a sus clientes por MAC+IP en wstalist. Para
  // mostrar el nombre del CPE en "Estaciones conectadas" cruzamos con los
  // datos del scan — todos los dispositivos de la LAN ya fueron escaneados y
  // tienen su `deviceName`. También priorizamos savedDevices porque ahí el
  // operador puede haber editado el nombre humano.
  const stationNamesByMac = useMemo(() => {
    const m = new Map<string, string>();
    const norm = (mac: string) => mac.toUpperCase().replace(/[:-]/g, '');
    // Saved primero (con menor prioridad) — luego scanResults los sobreescribe
    // si trae datos más frescos del último scan.
    for (const sd of library.savedDevices) {
      if (sd.mac && sd.name) m.set(norm(sd.mac), sd.name);
    }
    for (const r of scan.scanResults) {
      const name = r.cachedStats?.deviceName || (r.name && r.name !== r.ip ? r.name : null);
      const mac = r.cachedStats?.wlanMac || r.mac;
      if (mac && name) m.set(norm(mac), name);
    }
    return m;
  }, [scan.scanResults, library.savedDevices]);

  // Metadatos derivados para el menú Exportar — pasados a CSV/JSON/XLSX/PDF
  // por igual para que el archivo lleve nodo + subred + contadores coherentes.
  const exportMeta: ExportMetadata = useMemo(() => ({
    nodeName: effectiveNode?.nombre_nodo ?? null,
    subnet: effectiveLan || null,
    scannedAt: new Date(),
    totalCount: list.sortedRows.length,
    withStatsCount: list.sortedRows.filter(r => r.dev.cachedStats).length,
    savedCount: list.sortedRows.filter(r => r.isSaved).length,
  }), [effectiveNode, effectiveLan, list.sortedRows]);

  // Candidatos visibles para bulk save: filas que tienen SSH OK y aún no
  // están guardadas. Antes (§38) el botón guardaba a TODOS automáticamente;
  // desde §42 el usuario elige cuáles vía el checkbox por fila.
  const visibleCandidates = useMemo(() => {
    return list.sortedRows.filter(r =>
      !r.isSaved && scan.sshStatus[r.dev.ip] === 'success' && !!r.dev.cachedStats
    );
  }, [list.sortedRows, scan.sshStatus]);

  // El set "vivo" para el bulk save: la intersección entre lo que el usuario
  // marcó y lo que sigue siendo candidato visible (puede haberse guardado por
  // otra vía después de marcarse).
  const bulkSaveSelection = useMemo(() => {
    if (selectedIds.size === 0) return [] as typeof visibleCandidates;
    return visibleCandidates.filter(r => selectedIds.has(r.devId));
  }, [visibleCandidates, selectedIds]);

  // Setters de React son estables, pero los listamos en deps para satisfacer
  // al React Compiler (regla react-hooks/preserve-manual-memoization).
  const handleToggleSelected = useCallback((devId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(devId)) next.delete(devId);
      else next.add(devId);
      return next;
    });
  }, [setSelectedIds]);

  const handleSelectAllVisibleCandidates = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const c of visibleCandidates) next.add(c.devId);
      return next;
    });
  }, [visibleCandidates, setSelectedIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  const [bulkSaving, setBulkSaving] = useState(false);
  const handleBulkSave = useCallback(async () => {
    if (!effectiveNode || bulkSaveSelection.length === 0 || bulkSaving) return;
    if (bulkSaveSelection.length > 5) {
      const ok = window.confirm(
        `Vas a guardar ${bulkSaveSelection.length} dispositivos seleccionados en la biblioteca local del nodo ${effectiveNode.nombre_nodo}. ¿Continuar?`
      );
      if (!ok) return;
    }
    setBulkSaving(true);
    // Promise.allSettled — si uno falla, los demás siguen. handleDirectSave
    // es idempotente, podríamos relanzar si quisiéramos retry. Por ahora
    // solo contamos ok/fail.
    const results = await Promise.allSettled(
      bulkSaveSelection.map(r => handleDirectSave(r.dev, effectiveNode))
    );
    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    const failed = results.length - succeeded;
    setBulkSaving(false);
    // Limpia los ids guardados con éxito (los fallidos se mantienen seleccionados
    // por si el usuario quiere reintentar).
    setSelectedIds(prev => {
      const next = new Set(prev);
      bulkSaveSelection.forEach((r, idx) => {
        const result = results[idx];
        if (result.status === 'fulfilled' && result.value === true) next.delete(r.devId);
      });
      return next;
    });
    if (failed > 0) {
      showToast(`Guardados ${succeeded}. ${failed} fallaron y permanecen seleccionados.`);
    } else {
      showToast(`Guardados ${succeeded} dispositivos`);
    }
  }, [effectiveNode, bulkSaveSelection, bulkSaving, handleDirectSave, showToast, setSelectedIds]);

  const handleSyncToSaved = useCallback(async (dev: ScannedDevice, savedDev: SavedDevice) => {
    const cachedCredential = dev.sshPass === undefined ? await credCache.getForDevice(dev) : null;
    const scannedPass = dev.sshPass !== undefined ? dev.sshPass : cachedCredential?.pass;
    const updated: SavedDevice = {
      ...savedDev,
      sshUser: dev.sshUser || cachedCredential?.user || savedDev.sshUser,
      sshPass: scannedPass !== undefined ? scannedPass : savedDev.sshPass,
      sshPort: dev.sshPort ?? cachedCredential?.port ?? savedDev.sshPort,
      cachedStats: dev.cachedStats,
      name: dev.cachedStats?.deviceName || savedDev.name,
      model: dev.cachedStats?.deviceModel || savedDev.model,
      firmware: dev.cachedStats?.firmwareVersion || savedDev.firmware,
      mac: dev.cachedStats?.wlanMac || savedDev.mac,
      essid: dev.cachedStats?.essid ?? savedDev.essid,
      frequency: dev.cachedStats?.frequency ?? savedDev.frequency,
      lastSeen: Date.now(),
    };
    const updatedOk = await handleUpdateDevice(updated);
    if (updatedOk) showToast('Stats actualizadas en el dispositivo guardado');
  }, [handleUpdateDevice, showToast]);

  const handleRefreshStats = useCallback((ip: string, freshStats: AntennaStats) => {
    setScanResults(prev => prev.map(r => r.ip === ip ? { ...r, cachedStats: freshStats } : r));
  }, [setScanResults]);

  // ── Derivados de UI ────────────────────────────────────────────────
  const isTunnelActive = !!activeNodeVrf;
  const activeNodeName = activeNodeVrf
    ? nodes.find(n => n.nombre_vrf === activeNodeVrf)?.nombre_nodo ?? activeNodeVrf
    : null;
  const goToSites = useCallback(() => setActiveModule('nodes'), [setActiveModule]);
  const goToSavedDevices = useCallback(() => setActiveModule('monitor'), [setActiveModule]);

  return (
    <div className="space-y-5">

      {library.toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2
          bg-slate-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{library.toast}</span>
        </div>
      )}

      <PageHeader
        title="Buscar equipos"
        description="Busca y administra equipos conectados a tus sitios remotos"
        icon={Cpu}
        titleId="network-devices-title"
        aside={<div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{library.savedDevices.length}</span> equipo{library.savedDevices.length !== 1 ? 's' : ''} guardado{library.savedDevices.length !== 1 ? 's' : ''}
        </div>}
      />

      {isTunnelActive ? (
        <div className="card p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <p className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sitio conectado</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">{activeNodeName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Red: <span className="font-mono">{effectiveLan || 'Sin configurar'}</span></p>
            </div>
          </div>
          <div className="inline-flex self-start items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30 sm:self-auto">
            <ShieldCheck className="h-3.5 w-3.5" />
            Conexión activa
          </div>
        </div>
      ) : (
        <EmptyState
          icon={ShieldOff}
          title="Conéctate a un sitio para comenzar"
          description="Selecciona un sitio y activa la conexión para buscar equipos en su red. Tus equipos guardados permanecerán disponibles."
          actions={<>
            <Button onClick={goToSites} variant="primary" size="md" trailingIcon={ArrowRight} className="w-full sm:w-40">Ir a Sitios</Button>
            <Button onClick={goToSavedDevices} variant="outline" size="md" leadingIcon={Bookmark} className="w-full sm:w-40">Ver guardados</Button>
          </>}
        />
      )}

      {isTunnelActive && (
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-2">
          <RefreshCw className="w-4 h-4 text-indigo-500" />
          <span>Buscar equipos en este sitio</span>
        </h3>

        <ScanControls
          isTunnelActive={isTunnelActive}
          activeNode={activeNode}
          availableSubnets={availableSubnets}
          manualLan={prefs.manualLan}
          setManualLan={prefs.setManualLan}
          nodeSshCreds={nodeCredentials.creds}
          credentialsStatus={nodeCredentials.status}
          credentialsError={nodeCredentials.error}
          savedCredentialCount={savedCredentialCount}
          onReloadCredentials={nodeCredentials.reload}
          effectiveLan={effectiveLan}
          canScan={scan.canScan && nodeCredentials.status !== 'loading'}
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
                  Todo listo para buscar
                </p>
                <p className="text-2xs text-slate-500 dark:text-slate-500 max-w-xs mt-0.5">
                  Pulsa “Buscar equipos” para descubrir dispositivos Ubiquiti en {effectiveLan || 'la red seleccionada'}.
                </p>
              </div>
            </div>
          ) : null
        )}

        {list.scanRows.length > 0 && (
          <div>
            <div className="mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>
                  {list.scanRows.length} dispositivo{list.scanRows.length !== 1 ? 's' : ''}
                </span>
                {list.scanRows.filter(r => r.dev.cachedStats).length > 0 && (
                  <span className="text-emerald-500">
                    {list.scanRows.filter(r => r.dev.cachedStats).length} autenticados
                  </span>
                )}
                {list.scanRows.filter(r => r.isSaved).length > 0 && (
                  <span className="text-indigo-500">
                    {list.scanRows.filter(r => r.isSaved).length} guardados
                  </span>
                )}
              </p>
              <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end sm:gap-1.5">
                {/* §42-2: Bulk save — opera SOLO sobre lo que el usuario marcó
                    con los checkbox de fila. Antes guardaba todo lo visible. */}
                {bulkSaveSelection.length > 0 && effectiveNode && (
                  <button
                    onClick={handleBulkSave}
                    disabled={bulkSaving}
                    title={`Guardar los ${bulkSaveSelection.length} dispositivos seleccionados en la biblioteca del nodo`}
                    aria-label={`Guardar ${bulkSaveSelection.length} dispositivos seleccionados`}
                    className="btn-success btn-sm col-span-2 flex min-h-11 w-full items-center justify-center space-x-1.5 sm:w-auto"
                  >
                    {bulkSaving
                      ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" />
                      : <Save className="w-3.5 h-3.5" />}
                    <span>Guardar {bulkSaveSelection.length}</span>
                  </button>
                )}
                {airOsAi.available && list.sortedRows.some(row => !!row.dev.cachedStats) && (
                  <button
                    onClick={() => airOsAi.requestNetwork(
                      list.sortedRows.map(row => row.dev),
                      {
                        subnet: effectiveLan || undefined,
                        roleFilter: prefs.filterRole || undefined,
                        ssidFilter: prefs.filterSSID || undefined,
                        searchApplied: !!prefs.searchQuery.trim(),
                        visibleCount: list.sortedRows.length,
                      },
                    )}
                    title="Analizar con Gemini únicamente los equipos visibles que tienen datos AirOS"
                    className="btn-secondary btn-sm col-span-2 flex min-h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap border-violet-200 text-violet-700 hover:bg-violet-50 sm:w-auto dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Analizar red visible</span>
                  </button>
                )}
                {airOsAi.available && (
                  <button
                    onClick={() => setShowAiHistory(true)}
                    title="Ver análisis AirOS guardados"
                    aria-label="Abrir historial de análisis AirOS"
                    className="btn-outline btn-icon min-h-11 w-full min-w-11 text-violet-700 sm:w-11 dark:text-violet-300"
                  >
                    <History className="h-4 w-4" />
                  </button>
                )}
                <ExportMenu
                  rows={list.sortedRows}
                  meta={exportMeta}
                  visibleColumnKeys={prefs.visibleCols}
                  disabled={list.sortedRows.length === 0}
                />
                <ColumnPicker visibleCols={prefs.visibleCols} onChange={prefs.setVisibleCols} />
                <button
                  onClick={() => setShowResetConfirm(true)}
                  title="Resetear preferencias de la tabla (columnas, orden, filtros)"
                  aria-label="Resetear preferencias de la tabla"
                  className="flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 sm:w-11 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400">
                  <RotateCcw className="w-4 h-4" />
                </button>
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
              savingIds={library.savingIds}
              selectedNode={effectiveNode}
              selectedIds={selectedIds}
              onToggleSelected={handleToggleSelected}
              onSelectAllVisibleCandidates={handleSelectAllVisibleCandidates}
              onClearSelection={handleClearSelection}
              visibleCandidateCount={visibleCandidates.length}
              stationNamesByMac={stationNamesByMac}
              onOpenM5Detail={setM5DetailDevice}
              onSyncToSaved={handleSyncToSaved}
              onDirectSave={handleDirectSave}
              onOpenAddModal={setAddingDevice}
              onRefreshStats={handleRefreshStats}
            />
          </div>
        )}
      </div>
      )}

      {/* ── Modales ─────────────────────────────────────────────── */}
      {addingDevice && effectiveNode && (
        <AddDeviceModal
          device={addingDevice}
          node={effectiveNode}
          onSave={handleAddDevice}
          onClose={() => setAddingDevice(null)}
        />
      )}

      {m5DetailDevice && (
        <M5FullInfoModal
          dev={m5DetailDevice}
          onClose={() => setM5DetailDevice(null)}
          onAnalyzeWithAi={airOsAi.available ? () => airOsAi.requestDevice(m5DetailDevice) : undefined}
        />
      )}

      <AirOsAiDialog controller={airOsAi} />
      <AirOsAiHistoryDialog open={showAiHistory && airOsAi.available} onClose={() => setShowAiHistory(false)} type="NETWORK" />

      <ConfirmModal
        isOpen={showResetConfirm}
        title="Resetear preferencias"
        message="Se restablecerán columnas, anchos, orden y filtros de la tabla a los valores por defecto. Los dispositivos guardados no se tocan."
        confirmLabel="Resetear"
        onConfirm={() => { prefs.resetPrefs(); setShowResetConfirm(false); }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}
