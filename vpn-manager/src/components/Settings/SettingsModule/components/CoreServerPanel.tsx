import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, DatabaseBackup, HardDrive, KeyRound, Loader2, RefreshCw, Save, ServerCog } from 'lucide-react';
import { coreServerApi, type CoreStatusResponse } from '../../../../services/coreServerApi';
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
  HEALTHY: 'Operativo',
  DEGRADED: 'Requiere atención',
  UNREACHABLE: 'No alcanzable',
  INVALID_CREDENTIALS: 'Credenciales inválidas',
  NOT_CONFIGURED: 'Sin configurar',
};

const bytes = (value?: number | null) => !value
  ? '—'
  : value < 1048576
    ? `${Math.round(value / 1024)} KB`
    : `${(value / 1048576).toFixed(1)} MB`;

export function CoreServerPanel({ settings, onSettingsChange, onSave, isSaving, successMsg, errorMsg }: Props) {
  const [status, setStatus] = useState<CoreStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'health' | 'backup' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const patch = (values: Partial<AppSettings>) => onSettingsChange({ ...settings, ...values });

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await coreServerApi.status());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar el servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const run = async (kind: NonNullable<typeof action>, task: () => Promise<void>) => {
    setAction(kind);
    setMessage('');
    setError('');
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.'); }
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

  const health = status?.health;
  const healthy = health?.status === 'HEALTHY';
  const last = status?.backup.last;

  return <div className="space-y-5">
    <section className="card space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50"><ServerCog className="h-5 w-5 text-indigo-600" /></span><div><h3 className="font-bold">Servidor VPN MikroTik</h3><p className="text-sm text-slate-500">Estado operativo del Core configurado actualmente.</p></div></div>
        <button type="button" className="btn-ghost min-h-11 px-3" disabled={action !== null || loading} onClick={() => void checkHealth()}>{action === 'health' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Comprobar estado</button>
      </div>
      {loading ? <div className="h-24 animate-pulse rounded-xl bg-slate-100" /> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border p-3"><p className="text-xs text-slate-500">Estado</p><p className={`mt-1 flex items-center gap-1.5 font-bold ${healthy ? 'text-emerald-600' : 'text-amber-600'}`}>{healthy ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{STATUS_LABELS[health?.status || ''] || 'Desconocido'}</p></div>
        <div className="rounded-xl border p-3"><p className="text-xs text-slate-500">Identidad</p><p className="mt-1 truncate font-semibold">{health?.identity || '—'}</p></div>
        <div className="rounded-xl border p-3"><p className="text-xs text-slate-500">RouterOS / equipo</p><p className="mt-1 truncate font-semibold">{health?.version || '—'} · {health?.model || '—'}</p></div>
        <div className="rounded-xl border p-3"><p className="text-xs text-slate-500">VPN del sistema</p><p className="mt-1 font-semibold">{health?.vpnReady ? 'Preparada' : 'No preparada'}</p></div>
      </div>}
    </section>
    {(message || error || successMsg || errorMsg) && <div role="status" className={`rounded-xl border p-3 text-sm ${(error || errorMsg) ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || errorMsg || message || successMsg}</div>}
    <section className="card space-y-5 p-4 sm:p-6">
      <div className="flex gap-3"><DatabaseBackup className="h-5 w-5 text-indigo-600" /><div><h3 className="font-bold">Respaldo diario por correo</h3><p className="text-sm text-slate-500">Envía un .backup cifrado y un .rsc legible del Core configurado.</p></div></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-3 rounded-xl border p-3"><input type="checkbox" checked={settings.core_backup_enabled ?? false} onChange={event => patch({ core_backup_enabled: event.target.checked })} /><span><b className="block text-sm">Activar envío automático</b><span className="block text-xs text-slate-500">Una vez al día al Administrador verificado.</span></span></label>
        <label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Hora local</span><input type="time" className="input-field h-11" value={settings.core_backup_time ?? '02:00'} onChange={event => patch({ core_backup_time: event.target.value })} /></label>
        <label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Zona horaria</span><input className="input-field h-11" value={settings.core_backup_timezone ?? 'America/Lima'} onChange={event => patch({ core_backup_timezone: event.target.value })} /></label>
        <label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Contraseña del .backup</span><div className="relative"><KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><input type="password" minLength={12} className="input-field h-11 pl-10" value={settings.core_backup_password ?? ''} onChange={event => patch({ core_backup_password: event.target.value })} placeholder="Mínimo 12 caracteres" /></div></label>
      </div>
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-500">{last ? <>Último: <b>{last.status}</b> · {last.local_date} · {bytes(last.backup_size_bytes)} + {bytes(last.rsc_size_bytes)} · {last.recipient_masked || 'sin destinatario'}</> : 'Aún no hay ejecuciones registradas.'}</div>
        <div className="flex flex-col gap-2 sm:flex-row"><button className="btn-ghost min-h-11 px-3" disabled={action !== null} onClick={() => void createBackup()}>{action === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />} Generar y enviar ahora</button><button className="btn-primary min-h-11 px-3" disabled={isSaving} onClick={() => void onSave()}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar respaldo</button></div>
      </div>
    </section>
  </div>;
}
