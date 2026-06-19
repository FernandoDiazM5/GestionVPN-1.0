import { useEffect, useState } from 'react';
import { Radar, Server, MonitorSmartphone, Check, Loader2, Network } from 'lucide-react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { ScanMode } from '../types';

interface ScanModeToggleProps {
  scanMode: ScanMode;
  localScanIp: string;
  /** Sincroniza el objeto settings del padre tras un cambio persistido. */
  onChange: (patch: { scan_mode?: ScanMode; local_scan_ip?: string }) => void;
}

/**
 * Toggle global Producción(VPS) ↔ Local del Administrador. Conmuta cómo el
 * backend origina el tráfico de escaneo / Monitor AP:
 *   • VPS  (apagado, default) → pool de scan-IPs por workspace (multi-tenant).
 *   • Local (encendido)       → IP WG de esta máquina (1 equipo hace todo).
 * Persiste al instante en app_settings (scan_mode / local_scan_ip).
 */
export function ScanModeToggle({ scanMode, localScanIp, onChange }: ScanModeToggleProps) {
  const [mode, setMode] = useState<ScanMode>(scanMode);
  const [ip, setIp] = useState(localScanIp);
  const [saving, setSaving] = useState<null | 'mode' | 'ip'>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Re-sincroniza si el padre recarga los settings.
  useEffect(() => { setMode(scanMode); }, [scanMode]);
  useEffect(() => { setIp(localScanIp); }, [localScanIp]);

  const isLocal = mode === 'local';

  const persist = async (key: string, value: string) => {
    const resp = await apiFetch(`${API_BASE_URL}/api/settings/save`, {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.message || 'No se pudo guardar');
  };

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleMode = async () => {
    if (saving) return;
    const prev = mode;
    const next: ScanMode = prev === 'local' ? 'vps' : 'local';
    setMode(next);
    setError('');
    setSaving('mode');
    try {
      await persist('scan_mode', next);
      onChange({ scan_mode: next });
      flashSaved();
    } catch (e) {
      setMode(prev); // rollback óptimista
      setError(e instanceof Error ? e.message : 'Error al cambiar el modo');
    } finally {
      setSaving(null);
    }
  };

  const saveIp = async () => {
    const clean = ip.trim();
    if (clean === (localScanIp || '').trim()) return;
    setError('');
    setSaving('ip');
    try {
      await persist('local_scan_ip', clean);
      onChange({ local_scan_ip: clean });
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar la IP');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
          <Radar className="w-5 h-5 text-indigo-500" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Modo de escaneo de red</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cómo origina el backend el tráfico de escaneo y Monitor AP
          </p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Switch + estado actual */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Badge de modo activo */}
          <span
            className={`badge ${isLocal ? 'badge-warning' : 'badge-success'} gap-1.5`}
            aria-live="polite"
          >
            {isLocal ? <MonitorSmartphone className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
            {isLocal ? 'Local · 1 equipo' : 'Producción · VPS'}
          </span>

          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold transition-colors ${!isLocal ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
              VPS
            </span>

            <button
              type="button"
              role="switch"
              aria-checked={isLocal}
              aria-label={`Modo de escaneo: ${isLocal ? 'Local' : 'VPS'}. Pulsa para cambiar.`}
              onClick={toggleMode}
              disabled={saving === 'mode'}
              className={`relative inline-flex h-7 w-[3.25rem] shrink-0 items-center rounded-full transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
                focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900
                disabled:opacity-60 disabled:cursor-not-allowed
                ${isLocal ? 'bg-amber-500 focus-visible:ring-amber-500/60' : 'bg-emerald-500 focus-visible:ring-emerald-500/60'}`}
            >
              {/* Knob siempre blanco — va sobre el track emerald/amber en ambos temas. */}
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white shadow-sm transition-transform
                  ${isLocal ? 'translate-x-7' : 'translate-x-1'}`}
              />
            </button>

            <span className={`text-xs font-semibold transition-colors ${isLocal ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
              Local
            </span>

            {/* feedback de guardado */}
            <span className="w-4 shrink-0" aria-hidden={!saving && !saved}>
              {saving === 'mode' ? (
                <Loader2 className="w-4 h-4 text-indigo-500 motion-safe:animate-spin" />
              ) : saved ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : null}
            </span>
          </div>
        </div>

        {/* Descripción del modo activo */}
        <div
          className={`rounded-xl border p-4 text-xs leading-relaxed
            ${isLocal
              ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'}`}
        >
          {isLocal ? (
            <span>
              <strong>Local (1 equipo):</strong> el escaneo y el Monitor AP originan desde la
              IP WG de gestión de <em>esta</em> máquina (abajo). Úsalo cuando el backend corre en
              la misma PC del moderador. No requiere pool ni asignación por workspace.
            </span>
          ) : (
            <span>
              <strong>Producción (VPS):</strong> multi-tenant — cada workspace usa su scan-IP del
              pool <span className="font-mono">10.11.252.x</span> (asignada con
              <span className="font-mono"> scan:assign</span>). Requiere las rutas de retorno del
              pool en el router. Es el modo correcto cuando el backend corre en el VPS.
            </span>
          )}
        </div>

        {/* IP local — solo en modo Local */}
        {isLocal && (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              IP WG de gestión de esta máquina
            </label>
            <div className="relative">
              <Network className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                onBlur={saveIp}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="input-field pl-10 h-11 font-mono"
                placeholder="10.14.250.20"
                aria-describedby="local-scan-ip-hint"
              />
              {saving === 'ip' && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 motion-safe:animate-spin" />
              )}
            </div>
            <p id="local-scan-ip-hint" className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
              La IP del túnel de gestión que ves en WireGuard en esta PC. El escaneo se ata a ella
              y el mangle del router la enruta a tu VRF activo. Se guarda al salir del campo.
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">{error}</p>
        )}
      </div>
    </div>
  );
}
