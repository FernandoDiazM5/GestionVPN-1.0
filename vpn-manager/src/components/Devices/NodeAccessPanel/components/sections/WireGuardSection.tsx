import { AlertCircle, Server, WifiOff } from 'lucide-react';
import type { WgPeer } from '../../../../../types/api';
import { VPS_IP } from '../../../../../config';

interface WireGuardSectionProps {
  vpsPeer: WgPeer | undefined;
  vpsWgActive: boolean;
  mangleActive: boolean;
  activeNodeVrf: string | null;
  loadingWg: boolean;
  wgError: string | null;
  onLoadWgPeers: () => void;
}

export default function WireGuardSection({
  vpsPeer,
  vpsWgActive,
  mangleActive,
  activeNodeVrf,
  loadingWg,
  wgError,
  onLoadWgPeers,
}: WireGuardSectionProps) {
  return (
    <>
      {/* ── Error de conexión al router ── */}
      {wgError && !loadingWg && (
        <div className="card p-4 border-rose-200 bg-rose-50 flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-rose-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-rose-700">Router no alcanzable</p>
            <p className="text-2xs text-rose-600">{wgError}</p>
          </div>
          <button
            onClick={onLoadWgPeers}
            className="text-xs font-semibold text-rose-700 bg-rose-100 hover:bg-rose-200 px-3 py-1.5 rounded-lg transition-colors shrink-0 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 dark:text-rose-300"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── VPS no encontrado ── */}
      {!vpsPeer && !loadingWg && !wgError && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-700">VPS no encontrado en peers WireGuard</p>
            <p className="text-2xs text-amber-600">Se esperaba un peer con <span className="font-mono">{VPS_IP}</span>. Verifica la configuración del servidor.</p>
          </div>
        </div>
      )}

      {/* ── VPS (Principal) ── */}
      {vpsPeer && (
        <div
          className={`card p-4 border transition-colors ${
            vpsWgActive && mangleActive
              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
              : vpsWgActive
                ? 'border-sky-200 bg-sky-50/50 dark:border-sky-500/30 dark:bg-sky-500/10'
                : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'
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
                  <span className="text-2xs font-bold px-1.5 py-0.5 rounded-md bg-slate-900/5 text-slate-600 font-mono">
                    {VPS_IP}
                  </span>
                  <span
                    className={`text-2xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
                      vpsWgActive
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-700/50 dark:text-slate-500'
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
                    className={`text-2xs font-semibold flex items-center gap-1 ${
                      mangleActive ? 'text-emerald-600' : 'text-slate-500 dark:text-slate-400'
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
                    <span className="text-2xs text-slate-500">
                      →<span className="font-semibold text-slate-700 ml-1">Nodo activo</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span
              className={`text-2xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg shrink-0 ${
                vpsWgActive && mangleActive
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                  : vpsWgActive
                    ? 'bg-sky-100 text-sky-700 border border-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/30'
                    : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
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
    </>
  );
}
