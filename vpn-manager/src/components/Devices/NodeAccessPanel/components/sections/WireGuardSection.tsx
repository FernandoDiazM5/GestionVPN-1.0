import { AlertCircle, RefreshCw, Loader2, Server, Wifi, UserPlus, Pencil, Copy, Check, X, WifiOff } from 'lucide-react';
import type { WgPeer } from '../../../../../types/api';

const VPS_IP = '192.168.21.60';

interface WireGuardSectionProps {
  // VPS state
  vpsPeer: WgPeer | undefined;
  vpsWgActive: boolean;
  mangleActive: boolean;
  activeNodeVrf: string | null;

  // Admin peers
  wgPeers: WgPeer[];
  adminPeers: WgPeer[];
  loadingWg: boolean;
  wgError: string;
  peerColors: Record<string, string>;

  // Server config
  globalServerIP: string;
  serverPublicKey: string;
  serverListenPort: string;
  serverEndpointIP: string;
  setServerEndpointIP: (ip: string) => void;
  setServerListenPort: (port: string) => void;

  // Peer editing state
  peersExpanded: boolean;
  setPeersExpanded: (value: boolean) => void;
  colorPickerAddr: string | null;
  setColorPickerAddr: (addr: string | null) => void;
  editingPeerId: string | null;
  setEditingPeerId: (id: string | null) => void;
  editingPeerName: string;
  setEditingPeerName: (name: string) => void;
  savingPeerName: boolean;
  copiedPeerId: string | null;

  // Handlers
  onLoadWgPeers: () => void;
  onAddAdmin: () => void;
  onSavePeerColor: (addr: string, color: string) => void;
  onSavePeerName: (peer: WgPeer) => void;
  onCopyConfig: (peer: WgPeer) => void;
}

const PEER_COLOR_PALETTE = ['#6366f1', '#10b981', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#64748b'];

export default function WireGuardSection({
  vpsPeer,
  vpsWgActive,
  mangleActive,
  activeNodeVrf,
  wgPeers,
  adminPeers,
  loadingWg,
  wgError,
  peerColors,
  serverPublicKey,
  serverListenPort,
  serverEndpointIP,
  setServerEndpointIP,
  setServerListenPort,
  peersExpanded,
  setPeersExpanded,
  colorPickerAddr,
  setColorPickerAddr,
  editingPeerId,
  setEditingPeerId,
  editingPeerName,
  setEditingPeerName,
  savingPeerName,
  copiedPeerId,
  onLoadWgPeers,
  onAddAdmin,
  onSavePeerColor,
  onSavePeerName,
  onCopyConfig,
}: WireGuardSectionProps) {
  return (
    <>
      {/* ── Error de conexión al router ── */}
      {wgError && !loadingWg && (
        <div className="card p-4 border-red-200 bg-red-50 flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-red-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-red-700">Router no alcanzable</p>
            <p className="text-[11px] text-red-600">{wgError}</p>
          </div>
          <button
            onClick={onLoadWgPeers}
            className="text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── VPS (Principal) ── */}
      {!vpsPeer && !loadingWg && !wgError && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-700">VPS no encontrado en peers WireGuard</p>
            <p className="text-[11px] text-amber-600">Se esperaba un peer con <span className="font-mono">{VPS_IP}</span>. Verifica la configuración del servidor.</p>
          </div>
        </div>
      )}
      {vpsPeer && (
        <div
          className={`card p-4 border transition-colors ${
            vpsWgActive && mangleActive
              ? 'border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50'
              : vpsWgActive
                ? 'border-sky-200 bg-sky-50/50'
                : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md shrink-0 ${
                  vpsWgActive && mangleActive
                    ? 'bg-emerald-500 shadow-emerald-500/30'
                    : vpsWgActive
                      ? 'bg-sky-400 shadow-sky-400/30'
                      : 'bg-slate-400 shadow-slate-400/20'
                }`}
              >
                <Server className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-800">VPS (Principal)</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-900/5 text-slate-600 font-mono">
                    {VPS_IP}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
                      vpsWgActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        vpsWgActive && mangleActive
                          ? 'bg-emerald-500 animate-pulse'
                          : vpsWgActive
                            ? 'bg-sky-400'
                            : 'bg-slate-400'
                      }`}
                    />
                    <span>WG {vpsWgActive ? 'activo' : 'inactivo'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className={`text-[11px] font-semibold flex items-center gap-1 ${
                      mangleActive ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    {mangleActive
                      ? <>Mangle aplicado: <span className="font-mono">{activeNodeVrf}</span></>
                      : 'Sin mangle activo'}
                  </span>
                  {mangleActive && (
                    <span className="text-[11px] text-slate-500">
                      →<span className="font-semibold text-slate-700 ml-1">Nodo activo</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg shrink-0 ${
                vpsWgActive && mangleActive
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : vpsWgActive
                    ? 'bg-sky-100 text-sky-700 border border-sky-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              {vpsWgActive && mangleActive
                ? 'Enrutando'
                : vpsWgActive
                  ? 'En espera'
                  : 'Sin conexión'}
            </span>
          </div>
        </div>
      )}

      {/* ── Admin IP (WireGuard peers) ── */}
      <div className="card p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-600">IP Administrador</span>
            {adminPeers.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                {adminPeers.filter(p => p.active).length}/{adminPeers.length} activos
              </span>
            )}
            {loadingWg && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={onLoadWgPeers} disabled={loadingWg} title="Actualizar lista"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingWg ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onAddAdmin}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition-colors">
              <UserPlus className="w-3 h-3" /><span>Nuevo</span>
            </button>
            {adminPeers.length > 0 && (
              <button onClick={() => setPeersExpanded(!peersExpanded)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors">
                <span>{peersExpanded ? 'Contraer' : 'Ver todos'}</span>
                <span className={`transition-transform ${peersExpanded ? 'rotate-180' : ''}`}>▾</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsed: administradores humanos (solo lectura) */}
        {!peersExpanded && (
          <div className="flex items-center flex-wrap gap-2 mt-3">
            {adminPeers.length === 0 && !loadingWg && (
              <span className="text-xs text-slate-400 italic">No hay administradores configurados</span>
            )}
            {adminPeers.map(peer => {
              const color = peerColors[peer.allowedAddress];
              return (
                <div
                  key={peer.id}
                  style={color ? { borderColor: color } : undefined}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all
                    ${peer.active
                      ? 'bg-white text-slate-700 border-slate-200'
                      : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                >
                  {color
                    ? <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    : <Wifi className={`w-3.5 h-3.5 ${peer.active ? '' : 'opacity-50'}`} />}
                  <span>{peer.name}</span>
                  <span className="font-mono text-[10px] opacity-70">{peer.allowedAddress}</span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      peer.active
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {peer.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Expanded: solo activos, con selector de color y copiar config */}
        {peersExpanded && (
          <div className="mt-4 space-y-3">
            {/* Endpoint config */}
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Endpoint servidor:</span>
              <input value={serverEndpointIP}
                onChange={e => { setServerEndpointIP(e.target.value); localStorage.setItem('wg_endpoint_ip', e.target.value); }}
                placeholder="IP pública del servidor"
                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
              <span className="text-slate-400 font-bold text-xs">:</span>
              <input value={serverListenPort} onChange={e => setServerListenPort(e.target.value)}
                placeholder="Puerto"
                className="w-20 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
            </div>

            {adminPeers.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-4">Sin administradores configurados</p>
            )}

            {adminPeers.map(peer => {
              const color = peerColors[peer.allowedAddress];
              const showPicker = colorPickerAddr === peer.allowedAddress;
              const isEditing = editingPeerId === peer.id;
              return (
                <div key={peer.id} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className={`flex items-center gap-3 px-3 py-2.5 ${peer.active ? 'bg-white' : 'bg-slate-50'}`}>
                    {/* Color dot / picker trigger */}
                    <button onClick={() => { setColorPickerAddr(showPicker ? null : peer.allowedAddress); setEditingPeerId(null); }}
                      title="Cambiar color"
                      className="w-5 h-5 rounded-full shrink-0 border-2 border-white shadow ring-1 ring-slate-200 transition-transform hover:scale-110"
                      style={{ backgroundColor: color || '#94a3b8' }} />

                    {/* Nombre editable / info */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input autoFocus value={editingPeerName} onChange={e => setEditingPeerName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') onSavePeerName(peer); if (e.key === 'Escape') setEditingPeerId(null); }}
                            className="flex-1 px-2 py-1 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 font-semibold" />
                          <button onClick={() => onSavePeerName(peer)} disabled={savingPeerName}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50">
                            {savingPeerName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </button>
                          <button onClick={() => setEditingPeerId(null)} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <p className={`text-xs font-bold truncate ${peer.active ? 'text-slate-700' : 'text-slate-400'}`}>{peer.name}</p>
                          <button onClick={() => { setEditingPeerId(peer.id); setEditingPeerName(peer.name); setColorPickerAddr(null); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-opacity">
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                      <p className="font-mono text-[10px] text-slate-500">{peer.allowedAddress}</p>
                    </div>

                    {/* Estado */}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0
                      ${peer.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {peer.active ? 'Activo' : 'Inactivo'}
                    </span>

                    {/* Copiar config WG */}
                    <button onClick={() => onCopyConfig(peer)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors shrink-0
                        ${copiedPeerId === peer.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200'}`}>
                      {copiedPeerId === peer.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPeerId === peer.id ? '¡Copiado!' : 'Config WG'}</span>
                    </button>
                  </div>

                  {/* Color picker */}
                  {showPicker && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-t border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 shrink-0">Color:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {PEER_COLOR_PALETTE.map(c => (
                          <button key={c} onClick={() => onSavePeerColor(peer.allowedAddress, c)}
                            className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                            style={{ backgroundColor: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
                        ))}
                        {color && (
                          <button onClick={() => onSavePeerColor(peer.allowedAddress, '')}
                            className="text-[10px] text-slate-400 hover:text-slate-600 ml-1">✕ quitar</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
