import { Users, UserPlus, RefreshCw, Bell, X, WifiOff } from 'lucide-react';
import { useVpn } from '../../../context';
import type { WgPeer } from '../../../types/api';
import {
  useToasts,
  useServerSettings,
  useWireGuardState,
  useWireGuardPeers,
} from '../../Devices/NodeAccessPanel/hooks';
import { NuevoAdmin } from '../../Devices/NodeAccessPanel/modals';
import AdminPeersManager from './components/AdminPeersManager';
import UsersTable from './components/UsersTable';

const VPS_IP = '192.168.21.60';

export default function UserManagementPanel() {
  const { credentials } = useVpn();
  const { toasts, setToasts } = useToasts();
  const serverSettings = useServerSettings();
  const wgState = useWireGuardState();

  const {
    serverPublicKey, setServerPublicKey, serverListenPort, setServerListenPort,
    serverEndpointIP, setServerEndpointIP,
  } = serverSettings;

  const {
    wgPeers, setWgPeers, loadingWg, setLoadingWg, wgError, setWgError,
    showNuevoAdmin, setShowNuevoAdmin, peersExpanded, setPeersExpanded,
    peerColors, setPeerColors, colorPickerAddr, setColorPickerAddr,
    editingPeerId, setEditingPeerId, editingPeerName, setEditingPeerName,
    savingPeerName, setSavingPeerName, copiedPeerId, setCopiedPeerId, wgLoadedRef,
  } = wgState;

  const { loadWgPeers, savePeerColor, savePeerName, copyWgConfig } = useWireGuardPeers({
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

  // Solo administradores humanos (excluye el VPS)
  const adminPeers = wgPeers.filter(p => p.allowedAddress !== VPS_IP);

  const startEdit = (peer: WgPeer) => { setEditingPeerId(peer.id); setEditingPeerName(peer.name); setColorPickerAddr(null); };

  return (
    <div className="space-y-5">
      {/* ── Cabecera ── */}
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span>Gestión de Usuarios</span>
          </h2>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
            Administra el acceso de los administradores a la red y monitorea su actividad
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowNuevoAdmin(true)}
            className="btn-success px-4 py-2.5 flex items-center gap-2 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Administrador</span>
          </button>
          <button
            onClick={loadWgPeers}
            disabled={loadingWg}
            className="btn-outline px-4 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loadingWg ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* ── Error de conexión ── */}
      {wgError && !loadingWg && (
        <div className="card p-4 border-rose-200 bg-rose-50 flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-rose-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-rose-700">Router no alcanzable</p>
            <p className="text-2xs text-rose-600">{wgError}</p>
          </div>
          <button onClick={loadWgPeers}
            className="text-xs font-semibold text-rose-700 bg-rose-100 hover:bg-rose-200 px-3 py-1.5 rounded-lg transition-colors shrink-0">
            Reintentar
          </button>
        </div>
      )}

      {/* ── Acceso administrador (bloque movido desde Nodos) ── */}
      <AdminPeersManager
        adminPeers={adminPeers}
        loadingWg={loadingWg}
        peerColors={peerColors}
        serverEndpointIP={serverEndpointIP}
        setServerEndpointIP={setServerEndpointIP}
        serverListenPort={serverListenPort}
        setServerListenPort={setServerListenPort}
        peersExpanded={peersExpanded}
        setPeersExpanded={setPeersExpanded}
        colorPickerAddr={colorPickerAddr}
        setColorPickerAddr={setColorPickerAddr}
        editingPeerId={editingPeerId}
        setEditingPeerId={setEditingPeerId}
        editingPeerName={editingPeerName}
        setEditingPeerName={setEditingPeerName}
        savingPeerName={savingPeerName}
        copiedPeerId={copiedPeerId}
        onSavePeerColor={savePeerColor}
        onSavePeerName={savePeerName}
        onCopyConfig={copyWgConfig}
      />

      {/* ── Tabla de usuarios ── */}
      <UsersTable
        peers={adminPeers}
        peerColors={peerColors}
        editingPeerId={editingPeerId}
        editingPeerName={editingPeerName}
        savingPeerName={savingPeerName}
        copiedPeerId={copiedPeerId}
        onStartEdit={startEdit}
        onCancelEdit={() => setEditingPeerId(null)}
        onChangeEditName={setEditingPeerName}
        onSavePeerName={savePeerName}
        onCopyConfig={copyWgConfig}
      />

      {/* ── Modal nuevo administrador ── */}
      {showNuevoAdmin && (
        <NuevoAdmin
          peers={wgPeers}
          onClose={() => setShowNuevoAdmin(false)}
          onSuccess={(newPeer) => { setWgPeers(prev => [...prev, newPeer]); setShowNuevoAdmin(false); }}
        />
      )}

      {/* ── Toasts ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end">
          {toasts.map(t => (
            <div key={t.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold max-w-xs animate-in slide-in-from-right-4 duration-300
                ${t.type === 'warn' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
              <Bell className="w-4 h-4 shrink-0" />
              <span>{t.text}</span>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-1 opacity-70 hover:opacity-100" aria-label="Cerrar">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
