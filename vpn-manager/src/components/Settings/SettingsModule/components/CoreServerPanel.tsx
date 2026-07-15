import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, DatabaseBackup, HardDrive,
  KeyRound, Loader2, Network, RefreshCw, Save, ServerCog, ShieldCheck,
} from 'lucide-react';
import { coreServerApi, type CoreStatusResponse, type ProvisionPreview } from '../../../../services/coreServerApi';
import type { AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onSave: () => Promise<void>;
  onChangeRouter: () => void;
  isSaving: boolean;
  successMsg: string;
  errorMsg: string;
}

const STATUS_LABELS: Record<string, string> = {
  HEALTHY: 'Operativo', DEGRADED: 'Requiere atención', UNREACHABLE: 'No alcanzable',
  INVALID_CREDENTIALS: 'Credenciales inválidas', NOT_CONFIGURED: 'Sin configurar',
};

function bytes(value?: number | null) {
  if (!value) return '—';
  return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function CoreServerPanel({
  settings, onSettingsChange, onSave, onChangeRouter, isSaving, successMsg, errorMsg,
}: Props) {
  const [status, setStatus] = useState<CoreStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'health' | 'backup' | 'preview' | 'provision' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ProvisionPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');

  const patch = (values: Partial<AppSettings>) => onSettingsChange({ ...settings, ...values });

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try { setStatus(await coreServerApi.status()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo consultar el servidor.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const run = async (kind: NonNullable<typeof action>, task: () => Promise<void>) => {
    setAction(kind); setMessage(''); setError('');
    try { await task(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
    finally { setAction(null); }
  };

  const checkHealth = () => run('health', async () => {
    const response = await coreServerApi.health();
    setStatus(current => current ? { ...current, health: response.health } : current);
    setMessage('Estado actualizado.');
  });

  const createBackup = () => run('backup', async () => {
    const response = await coreServerApi.backupNow();
    setMessage(response.result.skipped ? 'El respaldo de hoy ya fue procesado.' : `Correo enviado con ${response.result.filenames?.join(' y ') || 'ambos archivos'}.`);
    await loadStatus();
  });

  const createPreview = () => run('preview', async () => {
    const response = await coreServerApi.preview();
    setPreview(response.preview);
    setConfirmation('');
  });

  const provision = () => run('provision', async () => {
    await coreServerApi.provision(confirmation);
    setMessage('Servidor VPN preparado correctamente desde cero.');
    setPreview(null); setConfirmation('');
    await loadStatus();
  });

  const health = status?.health;
  const healthy = health?.status === 'HEALTHY';
  const last = status?.backup.last;

  return (
    <div className="space-y-5">
      <section className="card p-6 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center">
              <ServerCog className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </span>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Servidor VPN MikroTik</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Supervisión del Core actual y preparación segura de un equipo nuevo.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost px-3 py-2" onClick={onChangeRouter}>Cambiar equipo</button>
            <button type="button" className="btn-ghost px-3 py-2" disabled={action !== null || loading} onClick={() => void checkHealth()}>
              {action === 'health' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Comprobar
            </button>
          </div>
        </div>

        {loading ? <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" /> : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs text-slate-500">Estado</p>
              <p className={`mt-1 flex items-center gap-1.5 font-bold ${healthy ? 'text-emerald-600' : 'text-amber-600'}`}>
                {healthy ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {STATUS_LABELS[health?.status || ''] || 'Desconocido'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">Identidad</p><p className="mt-1 font-semibold truncate">{health?.identity || '—'}</p></div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">RouterOS / equipo</p><p className="mt-1 font-semibold truncate">{health?.version || '—'} · {health?.model || '—'}</p></div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><p className="text-xs text-slate-500">VPN del sistema</p><p className="mt-1 font-semibold">{health?.vpnReady ? 'Preparada' : 'No preparada'}</p></div>
          </div>
        )}
      </section>

      {(message || error || successMsg || errorMsg) && (
        <div className={`rounded-xl border p-3 text-sm ${(error || errorMsg) ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
          {error || errorMsg || message || successMsg}
        </div>
      )}

      <section className="card p-6 space-y-5">
        <div className="flex gap-3"><DatabaseBackup className="w-5 h-5 text-indigo-600" /><div><h3 className="font-bold">Respaldo diario por correo</h3><p className="text-sm text-slate-500">Envía juntos un .backup AES-SHA256 y un .rsc legible. Los archivos temporales se eliminan y no se guardan en MySQL.</p></div></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <input type="checkbox" checked={settings.core_backup_enabled ?? false} onChange={e => patch({ core_backup_enabled: e.target.checked })} />
            <span><span className="block text-sm font-semibold">Activar envío automático</span><span className="block text-xs text-slate-500">Una vez al día, sólo al Administrador verificado.</span></span>
          </label>
          <label><span className="block text-xs font-bold text-slate-500 uppercase mb-2">Hora local</span><input type="time" className="input-field h-11" value={settings.core_backup_time ?? '02:00'} onChange={e => patch({ core_backup_time: e.target.value })} /></label>
          <label><span className="block text-xs font-bold text-slate-500 uppercase mb-2">Zona horaria</span><input className="input-field h-11" value={settings.core_backup_timezone ?? 'America/Lima'} onChange={e => patch({ core_backup_timezone: e.target.value })} /></label>
          <label><span className="block text-xs font-bold text-slate-500 uppercase mb-2">Contraseña del .backup</span><div className="relative"><KeyRound className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" /><input type="password" minLength={12} className="input-field h-11 pl-10" value={settings.core_backup_password ?? ''} onChange={e => patch({ core_backup_password: e.target.value })} placeholder="Mínimo 12 caracteres" /></div></label>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            {last ? <>Último: <b>{last.status}</b> · {last.local_date} · {bytes(last.backup_size_bytes)} + {bytes(last.rsc_size_bytes)} · {last.recipient_masked || 'sin destinatario'}</> : 'Aún no hay ejecuciones registradas.'}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost px-3 py-2" disabled={action !== null} onClick={() => void createBackup()}>{action === 'backup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />} Generar y enviar ahora</button>
            <button type="button" className="btn-primary px-3 py-2" disabled={isSaving} onClick={() => void onSave()}>{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar respaldo</button>
          </div>
        </div>
      </section>

      <section className="card p-6 space-y-5">
        <div className="flex gap-3"><ShieldCheck className="w-5 h-5 text-indigo-600" /><div><h3 className="font-bold">Preparar un servidor nuevo desde cero</h3><p className="text-sm text-slate-500">No importa ni migra torres, nodos, usuarios, peers ni VRF. Si detecta objetos operativos, el proceso se bloquea.</p></div></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label><span className="block text-xs font-bold text-slate-500 uppercase mb-2">Interfaz WAN (opcional)</span><div className="relative"><Network className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" /><input className="input-field h-11 pl-10" value={settings.core_wan_interface ?? ''} onChange={e => patch({ core_wan_interface: e.target.value })} placeholder="Se detecta desde la ruta default" /></div></label>
          <label><span className="block text-xs font-bold text-slate-500 uppercase mb-2">Clave pública WireGuard del VPS</span><input className="input-field h-11 font-mono text-xs" value={settings.core_vps_public_key ?? ''} onChange={e => patch({ core_vps_public_key: e.target.value })} placeholder="Base64 de 44 caracteres" /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary px-4 py-2" disabled={isSaving} onClick={() => void onSave()}><Save className="w-4 h-4" /> Guardar preparación</button>
          <button type="button" className="btn-ghost px-4 py-2" disabled={action !== null} onClick={() => void createPreview()}>{action === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />} Revisar antes de preparar</button>
        </div>
        {preview && (
          <div className={`rounded-xl border p-4 space-y-3 ${preview.canProvision ? 'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/20'}`}>
            <h4 className="font-bold">{preview.canProvision ? 'El equipo puede prepararse' : 'Preparación bloqueada'}</h4>
            {preview.blockers.length > 0 && <ul className="list-disc pl-5 text-sm space-y-1">{preview.blockers.map(item => <li key={item}>{item}</li>)}</ul>}
            <details><summary className="cursor-pointer text-sm font-semibold">Ver acciones previstas ({preview.actions.length})</summary><ol className="list-decimal pl-5 mt-2 text-sm space-y-1">{preview.actions.map(item => <li key={item}>{item}</li>)}</ol></details>
            {preview.canProvision && <div className="space-y-2 pt-2"><label className="block text-sm font-semibold">Escribe <code>PREPARAR DESDE CERO</code> para confirmar</label><div className="flex flex-col sm:flex-row gap-2"><input className="input-field h-11" value={confirmation} onChange={e => setConfirmation(e.target.value)} /><button type="button" className="btn-primary px-4 py-2" disabled={confirmation !== 'PREPARAR DESDE CERO' || action !== null} onClick={() => void provision()}>{action === 'provision' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ServerCog className="w-4 h-4" />} Preparar servidor</button></div></div>}
          </div>
        )}
      </section>
    </div>
  );
}
