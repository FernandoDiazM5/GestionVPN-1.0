import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Server, Shield, Key, Save, Loader2, Globe, Plug, Unplug } from 'lucide-react';
import type { AppSettings } from '../types';
import { SETTINGS_LABELS, SETTINGS_PLACEHOLDERS, SETTINGS_HINTS } from '../constants';

interface SettingsFormProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  isSaving: boolean;
  hasChanges: boolean;
  onTestConnection: () => Promise<{ identity: string; version: string; board: string }>;
}

export function SettingsForm({
  settings,
  onSettingsChange,
  onSubmit,
  isSaving,
  hasChanges,
  onTestConnection,
}: SettingsFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const handleInputChange = (key: keyof AppSettings, value: string) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const validation = useMemo(() => {
    const hostOk = /^[a-zA-Z0-9.-]+$/.test((settings.MT_IP || '').trim());
    const endpoint = (settings.server_public_ip || '').trim();
    const endpointOk = !endpoint || /^[a-zA-Z0-9.-]+$/.test(endpoint);
    const portText = (settings.sstp_port || '').trim();
    const port = Number(portText);
    const portOk = !portText || (Number.isInteger(port) && port >= 1 && port <= 65535);
    return { hostOk, endpointOk, portOk, valid: hostOk && endpointOk && portOk && !!(settings.MT_USER || '').trim() && !!settings.MT_PASS };
  }, [settings]);

  const testConnection = async () => {
    if (!validation.hostOk || !(settings.MT_USER || '').trim() || !settings.MT_PASS) return;
    setTesting(true); setTestResult(null);
    try {
      const result = await onTestConnection();
      setTestResult({ ok: true, message: `${result.identity}${result.version ? ` · RouterOS ${result.version}` : ''}${result.board ? ` · ${result.board}` : ''}` });
    } catch (error) {
      setTestResult({ ok: false, message: error instanceof Error ? error.message : 'No se pudo conectar con el Router Core.' });
    } finally { setTesting(false); }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-4" aria-labelledby="core-credentials-title">
        <div><h3 id="core-credentials-title" className="text-sm font-bold text-slate-800 dark:text-slate-100">Credenciales administrativas</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Acceso de solo servidor para consultar y administrar RouterOS.</p></div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            {SETTINGS_LABELS.MT_IP}
          </label>
          <div className="relative">
            <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              required
              value={settings.MT_IP}
              onChange={(e) => handleInputChange('MT_IP', e.target.value)}
              className="input-field pl-10 h-11"
              placeholder={SETTINGS_PLACEHOLDERS.MT_IP}
              aria-invalid={!validation.hostOk}
            />
          </div>
          {!validation.hostOk && <p className="mt-1.5 text-xs text-rose-600">Ingresa una IP o un nombre de host válido.</p>}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            {SETTINGS_LABELS.MT_USER}
          </label>
          <div className="relative">
            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              required
              value={settings.MT_USER}
              onChange={(e) => handleInputChange('MT_USER', e.target.value)}
              className="input-field pl-10 h-11"
              placeholder={SETTINGS_PLACEHOLDERS.MT_USER}
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            {SETTINGS_LABELS.MT_PASS}
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={settings.MT_PASS}
              onChange={(e) => handleInputChange('MT_PASS', e.target.value)}
              className="input-field pl-10 pr-12 h-11"
              placeholder={SETTINGS_PLACEHOLDERS.MT_PASS}
            />
            <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">{SETTINGS_HINTS.MT_PASS}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">{testResult ? <p className={`flex items-start gap-2 text-xs font-semibold ${testResult.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}<span className="break-words">{testResult.message}</span></p> : <p className="text-xs text-slate-500">La prueba consulta identidad y versión; no modifica el Router Core.</p>}</div>
        <button type="button" onClick={() => void testConnection()} disabled={testing || !validation.hostOk || !(settings.MT_USER || '').trim() || !settings.MT_PASS} className="btn-outline min-h-11 shrink-0 justify-center px-4 text-sm disabled:opacity-50">{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}{testing ? 'Probando…' : 'Probar conexión'}</button>
      </div>
      </section>

      <section className="space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800" aria-labelledby="core-endpoint-title">
        <div><h3 id="core-endpoint-title" className="text-sm font-bold text-slate-800 dark:text-slate-100">Endpoint público y SSTP</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Datos que se insertan en las configuraciones generadas para los nodos.</p></div>
      <div className="grid grid-cols-1 gap-5">
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            {SETTINGS_LABELS.server_public_ip}
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              value={settings.server_public_ip ?? ''}
              onChange={(e) => handleInputChange('server_public_ip', e.target.value)}
              className="input-field pl-10 h-11 font-mono"
              placeholder={SETTINGS_PLACEHOLDERS.server_public_ip}
              aria-invalid={!validation.endpointOk}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">{SETTINGS_HINTS.server_public_ip}</p>
          {!validation.endpointOk && <p className="mt-1.5 text-xs text-rose-600">Ingresa una IP pública o dominio válido.</p>}
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            {SETTINGS_LABELS.sstp_port}
          </label>
          <div className="relative">
            <Plug className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={65535}
              value={settings.sstp_port ?? ''}
              onChange={(e) => handleInputChange('sstp_port', e.target.value)}
              className="input-field pl-10 h-11 font-mono"
              placeholder={SETTINGS_PLACEHOLDERS.sstp_port}
              aria-invalid={!validation.portOk}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">{SETTINGS_HINTS.sstp_port}</p>
          {!validation.portOk && <p className="mt-1.5 text-xs text-rose-600">El puerto debe estar entre 1 y 65535.</p>}
        </div>
      </div>
      </section>

      {hasChanges && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Cambiar la dirección o las credenciales puede interrumpir temporalmente las operaciones del Core. Prueba la conexión antes de guardar.</span></div>}
      <div className="sticky bottom-0 z-10 -mx-6 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-slate-500">{hasChanges ? 'Hay cambios pendientes.' : 'Configuración sin cambios.'}</span>
        <button type="submit" disabled={isSaving || !hasChanges || !validation.valid} className="btn-primary min-h-11 w-full justify-center px-6 py-2.5 disabled:opacity-50 sm:w-auto">
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Guardando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 shrink-0" /> Guardar Cambios
            </>
          )}
        </button>
      </div>
    </form>
  );
}
