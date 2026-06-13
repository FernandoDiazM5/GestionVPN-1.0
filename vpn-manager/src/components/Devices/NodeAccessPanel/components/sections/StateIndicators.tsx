import { AlertCircle, ShieldCheck, ShieldOff, Bell } from 'lucide-react';
import { AnimatedCountdown } from '../shared';

interface StateIndicatorsProps {
  errorMsg: string;
  activeNodeVrf: string | null;
  activeNodeName: string | null;
  tunnelExpiry: number | null;
  showRenewalWarn: boolean;
  onRenew: () => void;
  onRevokeAll: () => void;
  isRevoking: boolean;
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
}: StateIndicatorsProps) {
  return (
    <>
      {/* ── Error ── */}
      {errorMsg && (
        <div className="card p-4 flex items-start space-x-3 border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* ── Túnel activo ── */}
      {activeNodeVrf && (
        <>
          <div className="card p-4 border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 flex items-center justify-between gap-4 flex-col sm:flex-row">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/30 flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  Acceso abierto: <span className="text-emerald-600 dark:text-emerald-400">{activeNodeName}</span>
                </p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{activeNodeVrf}</span>
                </div>
              </div>
            </div>
            {/* Bloque derecho: reloj + acciones agrupados */}
            <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
              {tunnelExpiry && <AnimatedCountdown expiry={tunnelExpiry} />}
              {showRenewalWarn && (
                <button onClick={onRenew}
                  className="btn-warning btn-sm flex items-center gap-1.5 motion-safe:animate-pulse">
                  <Bell className="w-3.5 h-3.5" />
                  <span>Renovar acceso</span>
                </button>
              )}
              <button
                onClick={onRevokeAll}
                disabled={isRevoking}
                className="btn-danger btn-md flex items-center space-x-2"
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
