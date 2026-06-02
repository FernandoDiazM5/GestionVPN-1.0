import { Bell, X } from 'lucide-react';
import { useVpn, TUNNEL_TIMEOUT_MS } from '../../../context';
import { deviceDb } from '../../../store/deviceDb';
import { cpeCache } from '../../../store/cpeCache';
import { useWorkspaceSession } from '../../../context/WorkspaceSession';
import { isPlatformAdmin } from '../../../utils/permissions';

// ── Modales (importados desde ./modals)
import {
  NuevoNodo,
  EditarNodo,
  EliminarNodo,
  BatchCsvModal,
  ScriptModal,
  HistoryModal,
  TagModal,
} from './modals';

// ── Componentes (nuevos)
import {
  ControlBar,
  StateIndicators,
  WireGuardSection,
  NodesListSection,
} from './components';

// ── Custom Hooks
import {
  useToasts,
  useNodeModals,
  useNodeTags,
  useServerSettings,
  useWireGuardState,
  useNodeState,
  useNodeFetching,
  useWireGuardPeers,
} from './hooks';

export default function NodeAccessPanel() {
  const vpnContext = useVpn();
  const { credentials, nodes, setNodes, activeNodeVrf, tunnelExpiry, setTunnelExpiry, deactivateAllNodes, removeNodeFromState, isReady } = vpnContext;

  // ── Inicializar Hooks
  const { toasts, setToasts, addToast } = useToasts();
  const nodeModals = useNodeModals();
  const { nodeTags, saveNodeTags } = useNodeTags();
  const serverSettings = useServerSettings();
  const wgState = useWireGuardState();
  const nodeState = useNodeState();

  // Extraer valores del nodeState para compatibilidad con JSX
  const { isLoading, setIsLoading, hasLoaded, setHasLoaded, errorMsg, setErrorMsg, isRevoking, setIsRevoking, showRenewalWarn, setShowRenewalWarn, prevRunningRef, pollingRef } = nodeState;

  // Extraer valores del serverSettings
  const { globalServerIP, setGlobalServerIP, editingGlobalIP, setEditingGlobalIP, serverPublicKey, setServerPublicKey, serverListenPort, setServerListenPort, serverEndpointIP, setServerEndpointIP } = serverSettings;

  // Extraer valores del wgState (solo lo necesario para detectar el VPS;
  // la gestión de administradores vive ahora en la pestaña Usuarios)
  const { wgPeers, setWgPeers, loadingWg, setLoadingWg, wgError, setWgError, setPeerColors, setColorPickerAddr, setEditingPeerId, setEditingPeerName, editingPeerName, setSavingPeerName, savingPeerName, setCopiedPeerId, wgLoadedRef } = wgState;

  // Extraer valores del nodeModals
  const { showNuevoNodo, setShowNuevoNodo, showBatchCsv, setShowBatchCsv, editNode, setEditNode, deleteNode, setDeleteNode, scriptNode, setScriptNode, historyNode, setHistoryNode, tagNode, setTagNode } = nodeModals;

  // ── Constantes
  const VPS_IP = '192.168.21.60';

  // ── Inicializar hooks de lógica compleja
  const { fetchNodes, handleLoadNodes } = useNodeFetching({
    credentials,
    isReady,
    hasLoaded,
    setHasLoaded,
    setNodes,
    setIsLoading,
    setErrorMsg,
    setShowRenewalWarn,
    tunnelExpiry,
    prevRunningRef,
    pollingRef,
    addToast,
  });

  const { loadWgPeers } = useWireGuardPeers({
    credentials,
    wgLoadedRef,
    setWgPeers,
    setPeerColors,
    setServerPublicKey,
    setServerListenPort,
    setServerEndpointIP,
    setLoadingWg,
    setWgError,
    setColorPickerAddr,
    setEditingPeerId,
    setEditingPeerName,
    setSavingPeerName,
    setCopiedPeerId,
    serverEndpointIP,
    serverListenPort,
    serverPublicKey,
    editingPeerName,
    savingPeerName,
  });

  const exportCsv = () => {
    const header = 'Nombre,VRF,Red LAN,IP Túnel,Usuario PPP,Estado';
    const csvRows = nodes.map(n => [
      `"${n.nombre_nodo}"`, n.nombre_vrf || '',
      `"${(n.lan_subnets?.join(';') || n.segmento_lan || '')}"`,
      n.ip_tunnel || '', n.ppp_user,
      n.running ? 'Conectado' : 'Desconectado',
    ].join(','));
    const blob = new Blob([[header, ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nodos-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleRevokeAll = async () => {
    setIsRevoking(true);
    await deactivateAllNodes();
    setIsRevoking(false);
  };


  const activeNodeName = activeNodeVrf
    ? nodes.find(n => n.nombre_vrf === activeNodeVrf)?.nombre_nodo ?? activeNodeVrf
    : null;

  // ── Estado del VPS (infraestructura del router core) ──
  // Solo lo ve el Administrador: el VPS/WireGuard del servidor es plataforma,
  // no le compete a un moderador (que ni siquiera ve sus peers de gestión aquí).
  const { session } = useWorkspaceSession();
  const showCoreInfra = isPlatformAdmin(session);
  const vpsPeer = wgPeers.find(p => p.allowedAddress === VPS_IP);
  const vpsWgActive = !!vpsPeer?.active;
  const mangleActive = !!activeNodeVrf;



  return (
    <div className="space-y-5">
      {/* ── ControlBar ── */}
      <ControlBar
        globalServerIP={globalServerIP}
        editingGlobalIP={editingGlobalIP}
        setGlobalServerIP={setGlobalServerIP}
        setEditingGlobalIP={setEditingGlobalIP}
        onNewNode={() => setShowNuevoNodo(true)}
        onBatchCsv={() => setShowBatchCsv(true)}
        onRefresh={handleLoadNodes}
        isLoading={isLoading}
        hasLoaded={hasLoaded}
      />

      {/* ── StateIndicators ── */}
      <StateIndicators
        errorMsg={errorMsg}
        activeNodeVrf={activeNodeVrf}
        activeNodeName={activeNodeName}
        tunnelExpiry={tunnelExpiry}
        showRenewalWarn={showRenewalWarn}
        onRenew={() => setTunnelExpiry(Date.now() + TUNNEL_TIMEOUT_MS)}
        onRevokeAll={handleRevokeAll}
        isRevoking={isRevoking}
      />

      {/* ── WireGuardSection (VPS/core) — solo Administrador de plataforma ── */}
      {showCoreInfra && (
        <WireGuardSection
          vpsPeer={vpsPeer}
          vpsWgActive={vpsWgActive}
          mangleActive={mangleActive}
          activeNodeVrf={activeNodeVrf}
          loadingWg={loadingWg}
          wgError={wgError}
          onLoadWgPeers={loadWgPeers}
        />
      )}

      {/* ── NodesListSection ── */}
      <NodesListSection
        nodes={nodes}
        hasLoaded={hasLoaded}
        nodeTags={nodeTags}
        onExportCsv={exportCsv}
        onEditNode={setEditNode}
        onDeleteNode={setDeleteNode}
        onScriptNode={setScriptNode}
        onRenameNode={(node, newName) => setNodes(prev => prev.map(n => n.ppp_user === node.ppp_user ? { ...n, nombre_nodo: newName } : n))}
        onHistoryNode={setHistoryNode}
        onTagClick={setTagNode}
        onRefreshNodes={fetchNodes}
        isLoading={isLoading}
      />

      {showNuevoNodo && (
        <NuevoNodo
          onClose={() => setShowNuevoNodo(false)}
          onSuccess={() => { setShowNuevoNodo(false); handleLoadNodes(); }}
        />
      )}
      {deleteNode && (
        <EliminarNodo
          node={deleteNode}
          onClose={() => setDeleteNode(null)}
          onSuccess={(deletedDeviceIds: string[]) => {
            const pppUser = deleteNode.ppp_user;
            setDeleteNode(null);
            removeNodeFromState(pppUser);
            // Limpiar devices huérfanos de SQLite + cache IndexedDB de CPEs
            deviceDb.cleanupOrphans().catch(() => { });
            if (deletedDeviceIds.length > 0) {
              deviceDb.removeByIds(deletedDeviceIds).catch(() => { });
            }
            cpeCache.clear().catch(() => { });
          }}
        />
      )}
      {editNode && (
        <EditarNodo
          node={editNode}
          onClose={() => setEditNode(null)}
          onSuccess={(newLabel) => {
            if (newLabel) {
              setNodes(prev => prev.map(n => n.id === editNode.id ? { ...n, nombre_nodo: newLabel } : n));
            }
            setEditNode(null);
            handleLoadNodes();
          }}
        />
      )}
      {scriptNode && (
        <ScriptModal node={scriptNode} onClose={() => setScriptNode(null)} />
      )}
      {showBatchCsv && (
        <BatchCsvModal nodes={nodes} onClose={() => setShowBatchCsv(false)} onSuccess={() => { setShowBatchCsv(false); handleLoadNodes(); }} />
      )}
      {historyNode && (
        <HistoryModal node={historyNode} onClose={() => setHistoryNode(null)} />
      )}
      {tagNode && (
        <TagModal
          node={tagNode}
          currentTags={nodeTags[tagNode.ppp_user] || []}
          onSave={(tags) => saveNodeTags(tagNode.ppp_user, tags)}
          onClose={() => setTagNode(null)}
        />
      )}

      {/* ── Toast notifications ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end">
          {toasts.map(t => (
            <div key={t.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold max-w-xs animate-in slide-in-from-right-4 duration-300
                ${t.type === 'warn' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
              <Bell className="w-4 h-4 shrink-0" />
              <span>{t.text}</span>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-1 opacity-70 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
