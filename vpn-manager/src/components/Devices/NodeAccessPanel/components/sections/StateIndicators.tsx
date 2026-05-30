import { AlertCircle, ShieldCheck, ShieldOff, Clock, Bell } from 'lucide-react';
import { TUNNEL_TIMEOUT_MS } from '../../../../../context';
import CountdownDisplay from '../shared/CountdownDisplay';

interface StateIndicatorsProps {
  errorMsg: string;
  activeNodeVrf: string | null;
  activeNodeName: string | null;
  tunnelExpiry: number | null;
  showRenewalWarn: boolean;
  onRenew: () => void;
  onRevokeAll: () => void;
  isRevoking: boolean;
  setTunnelExpiry: (value: number) => void;
}

export default function StateIndicators({
  errorMsg,
  activeNodeVrf,
  activeNodeName,
  tunnelExpiry,
  showRenewalWarn,
  onRenew,
  onRevokeAll,
  isRevoking,
  setTunnelExpiry,
}: StateIndicatorsProps) {
  return (
    <>
      {/* ── Error ── */}
      {errorMsg && (
        <div className="card p-4 flex items-start space-x-3 border-red-200 bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* ── Túnel activo ── */}
      {activeNodeVrf && (
        <>
          <div className="card p-4 border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/30">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Acceso abierto: <span className="text-emerald-600">{activeNodeName}</span>
                </p>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-xs text-slate-500 font-mono">{activeNodeVrf}</span>
                  {tunnelExpiry && (
                    <span className="text-xs font-bold text-amber-600 flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <CountdownDisplay expiry={tunnelExpiry} />
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {showRenewalWarn && (
                <button onClick={onRenew}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-500/30 animate-pulse transition-all">
                  <Bell className="w-3.5 h-3.5" />
                  <span>Renovar acceso</span>
                </button>
              )}
              <button
                onClick={onRevokeAll}
                disabled={isRevoking}
                className="bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl
                           shadow-md shadow-rose-500/25 active:scale-[0.98] transition-all flex items-center space-x-2"
              >
                <ShieldOff className="w-4 h-4" />
                <span>{isRevoking ? 'Revocando...' : 'Revocar Todo'}</span>
              </button>
            </div>
          </div>
          {showRenewalWarn && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold">
              <Bell className="w-3.5 h-3.5 animate-pulse shrink-0" />
              <span>El acceso expirará en menos de 2 minutos. Haz clic en "Renovar acceso" para extenderlo 30 minutos más sin interrumpir la conexión.</span>
            </div>
          )}
        </>
      )}
    </>
  );
}
