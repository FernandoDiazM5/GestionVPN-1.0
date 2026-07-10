import { useEffect, useState, useCallback } from 'react';
import {
  ServerCog, Globe, Shield, Key, Plug, Loader2, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, Zap, ChevronDown, Info, Network,
} from 'lucide-react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type {
  CoreRouterState, CoreRouterSummary, CoreBootstrapStep,
  CoreRouterValidateResponse, CoreRouterBootstrapResponse, CoreRouterStatusResponse,
} from '@gestionvpn/contracts';

// ── Etiquetas legibles por estado del equipo ────────────────────────────────
const STATE_META: Record<CoreRouterState, { label: string; badge: string; hint: string }> = {
  blank:   { label: 'Equipo nuevo',            badge: 'badge-info',    hint: 'Sin configuración de gestión — se aplicará todo.' },
  foreign: { label: 'Equipo con otra config',  badge: 'badge-warning', hint: 'Responde pero no reconocemos su configuración; se agregará la base del Core.' },
  partial: { label: 'Configuración parcial',   badge: 'badge-warning', hint: 'Tiene parte de la config del Core; se completará lo que falte.' },
  ours:    { label: 'Ya configurado',          badge: 'badge-success', hint: 'Es un Servidor VPN nuestro y está conforme.' },
};

interface FormState { publicIp: string; user: string; pass: string; connectIp: string; trustedNets: string; }

// "192.168.18.0/24, 10.0.5.0/24" → ['192.168.18.0/24','10.0.5.0/24'] (coma/espacio).
const parseTrustedNets = (raw: string): string[] =>
  raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

const STEP_STYLE: Record<CoreBootstrapStep['status'], { box: string; dot: string; mark: string }> = {
  ok:    { box: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30', dot: 'bg-emerald-500 text-white', mark: '✓' },
  skip:  { box: 'bg-slate-50 border-slate-100 dark:bg-slate-500/10 dark:border-slate-700',            dot: 'bg-slate-400 text-white',   mark: '=' },
  warn:  { box: 'bg-amber-50 border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/30',         dot: 'bg-amber-500 text-white',   mark: '!' },
  error: { box: 'bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/30',             dot: 'bg-rose-500 text-white',    mark: '✗' },
};

/** Panel read-only con los valores vivos del router. */
function SummaryPanel({ summary }: { summary: CoreRouterSummary }) {
  const rows: [string, string][] = [
    ['Identidad', summary.identity ?? '—'],
    ['RouterOS', [summary.version, summary.boardName].filter(Boolean).join(' · ') || '—'],
    ['SSTP Server', summary.sstpServer ? (summary.sstpServer.enabled ? `activo :${summary.sstpServer.port ?? '?'}` : 'inactivo') : '—'],
    ['Interfaces gestión', `${summary.mgmtInterfaces.length}/3`],
    ['Reglas firewall', String(summary.firewallRules ?? 0)],
    ['Nodos provisionados', String(summary.provisionedNodes ?? 0)],
    ['Peers de gestión', String(summary.mgmtPeers ?? 0)],
    ['API allowlist', summary.apiAllowlistOk ? 'OK' : 'revisar'],
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/60 dark:bg-slate-800/40">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400">{k}</span>
          <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 truncate">{v}</span>
        </div>
      ))}
      {summary.mgmtInterfaces.length > 0 && (
        <div className="sm:col-span-2 pt-1 border-t border-slate-200 dark:border-slate-700 mt-1">
          {summary.mgmtInterfaces.map((i) => (
            <div key={i.name} className="flex items-center justify-between gap-3 text-2xs">
              <span className="font-mono text-slate-500 dark:text-slate-400">{i.name}</span>
              <span className="font-mono text-slate-600 dark:text-slate-300">
                :{i.listenPort ?? '?'} {i.running ? '· up' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Checklist de pasos del bootstrap (mismo lenguaje visual que el alta de nodo). */
function StepsList({ steps }: { steps: CoreBootstrapStep[] }) {
  return (
    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
      {steps.map((s, idx) => {
        const st = STEP_STYLE[s.status];
        return (
          <div key={`${s.step}-${idx}`} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs border anim-slide-left ${st.box}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shrink-0 ${st.dot}`}>{st.mark}</span>
            <div className="min-w-0">
              <span className="font-bold text-slate-700 dark:text-slate-200">{s.obj}</span>
              <p className="text-2xs text-slate-500 dark:text-slate-400 font-mono truncate">{s.name}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CoreRouterWizard() {
  const [status, setStatus] = useState<CoreRouterStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  // El formulario se muestra por defecto salvo cuando el servidor ya está
  // conforme (ahí arrancamos plegados con el panel verde). `formOverride` lo
  // fuerza abierto al pulsar "Cambiar de equipo" — evita un setState-en-effect.
  const [formOverride, setFormOverride] = useState(false);

  const [form, setForm] = useState<FormState>({ publicIp: '', user: 'admin', pass: '', connectIp: '', trustedNets: '' });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [busy, setBusy] = useState<null | 'validate' | 'bootstrap'>(null);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState<CoreRouterValidateResponse | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [result, setResult] = useState<CoreRouterBootstrapResponse | null>(null);

  const setField = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // No seteamos `loadingStatus=true` de forma síncrona aquí: en el montaje ya
  // arranca en true, y en refrescos manuales el botón muestra su propio estado
  // (evita el warning react-hooks/set-state-in-effect).
  const loadStatus = useCallback(async () => {
    try {
      const resp = await apiFetch(`${API_BASE_URL}/api/settings/core-router/status`);
      const data = await resp.json();
      if (data?.success) setStatus(data as CoreRouterStatusResponse);
    } catch { /* sin status → mostramos el formulario */ }
    finally { setLoadingStatus(false); }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Si ya está conforme y alcanzable, arrancamos plegados (panel verde).
  const isConforme = !!status?.configured && !!status?.reachable && status?.state === 'ours';
  const showForm = formOverride || (!loadingStatus && !isConforme);

  const validate = async () => {
    setError(''); setResult(null); setValidation(null); setConfirmSwitch(false);
    setBusy('validate');
    try {
      const resp = await apiFetch(`${API_BASE_URL}/api/settings/core-router/validate`, {
        method: 'POST',
        body: JSON.stringify({
          publicIp: form.publicIp.trim(), user: form.user.trim() || 'admin', pass: form.pass,
          ...(form.connectIp.trim() ? { connectIp: form.connectIp.trim() } : {}),
        }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.message || 'No se pudo validar la conexión');
      setValidation(data as CoreRouterValidateResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al validar');
    } finally { setBusy(null); }
  };

  const bootstrap = async () => {
    setError('');
    setBusy('bootstrap');
    try {
      const resp = await apiFetch(`${API_BASE_URL}/api/settings/core-router/bootstrap`, {
        method: 'POST',
        body: JSON.stringify({
          publicIp: form.publicIp.trim(), user: form.user.trim() || 'admin', pass: form.pass,
          ...(form.connectIp.trim() ? { connectIp: form.connectIp.trim() } : {}),
          ...(form.trustedNets.trim() ? { trustedNets: parseTrustedNets(form.trustedNets) } : {}),
          confirmSwitch,
        }),
      });
      const data = await resp.json();
      if (!data.success) {
        if (data.code === 'CORE_DEVICE_CHANGE') { setConfirmSwitch(true); throw new Error(data.message || 'Confirma el cambio de equipo'); }
        throw new Error(data.message || 'Falló la preparación del servidor');
      }
      setResult(data as CoreRouterBootstrapResponse);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al preparar el servidor');
    } finally { setBusy(null); }
  };

  const meta = validation ? STATE_META[validation.state] : null;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
          <ServerCog className="w-5 h-5 text-indigo-500" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Servidor VPN (Router Core)</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Habilita cualquier RouterOS/CHR para trabajar con el sistema
          </p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {loadingStatus ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Comprobando el servidor actual…
          </div>
        ) : (
          <>
            {/* Panel "conforme" cuando ya está trabajando */}
            {isConforme && !showForm && status?.summary && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="badge badge-success gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Servidor conforme
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{status.mtIp}</span>
                </div>
                <SummaryPanel summary={status.summary} />
                <div className="flex gap-2">
                  <button type="button" onClick={loadStatus} className="btn-ghost btn-md">
                    <RefreshCw className="w-4 h-4" /> Re-verificar
                  </button>
                  <button type="button" onClick={() => setFormOverride(true)} className="btn-outline btn-md">
                    <ServerCog className="w-4 h-4" /> Cambiar de equipo
                  </button>
                </div>
              </div>
            )}

            {/* Servidor configurado pero inalcanzable */}
            {status?.configured && !status?.reachable && !showForm && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>El servidor {status.mtIp} no responde ahora mismo.</strong>{' '}
                    {status.message || 'Verifica que el túnel de gestión esté activo.'}
                    <div className="mt-2">
                      <button type="button" onClick={() => setFormOverride(true)} className="btn-outline btn-sm">
                        Configurar / cambiar equipo
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Formulario del asistente */}
            {showForm && (
              <div className="space-y-5">
                {/* 1) IP pública — lo PRIMERO que se ingresa */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    IP pública del router
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <input
                      type="text" value={form.publicIp} onChange={(e) => setField('publicIp', e.target.value)}
                      className="input-field pl-10 h-11 font-mono" placeholder="ej. 213.173.36.232"
                      autoComplete="off"
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                    La IP con la que el sistema se conecta al router (la que ya te asignó tu proveedor, ej. DigitalOcean).
                    No configuramos la IP pública/WAN — eso lo habilitas tú; aquí solo montamos el resto.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Usuario</label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <input type="text" value={form.user} onChange={(e) => setField('user', e.target.value)}
                        className="input-field pl-10 h-11" placeholder="admin" autoComplete="off" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contraseña</label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <input type="password" value={form.pass} onChange={(e) => setField('pass', e.target.value)}
                        className="input-field pl-10 h-11" placeholder="••••••••" autoComplete="off" />
                    </div>
                  </div>
                </div>

                {/* Opción avanzada: IP de conexión distinta de la pública */}
                <div>
                  <button type="button" onClick={() => setShowAdvanced((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    Opciones avanzadas
                  </button>
                  {showAdvanced && (
                    <div className="mt-3">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        IP de conexión (si difiere de la pública)
                      </label>
                      <div className="relative">
                        <Plug className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <input type="text" value={form.connectIp} onChange={(e) => setField('connectIp', e.target.value)}
                          className="input-field pl-10 h-11 font-mono" placeholder="ej. 10.14.250.1 (plano de gestión)" autoComplete="off" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                        Útil si el router ya está enlazado y prefieres conectar por el túnel de gestión.
                      </p>

                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4">
                        Redes de gestión de confianza
                      </label>
                      <div className="relative">
                        <Network className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <input type="text" value={form.trustedNets} onChange={(e) => setField('trustedNets', e.target.value)}
                          className="input-field pl-10 h-11 font-mono" placeholder="ej. 192.168.18.0/24" autoComplete="off" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                        Redes desde las que administras el router además del túnel de gestión (ej. tu LAN local por Winbox).
                        Se agregan a la allowlist del API y del firewall para que el blindado del router <strong>no te deje sin acceso</strong>.
                        Separa varias con coma.
                      </p>
                    </div>
                  )}
                </div>

                {/* Acción: validar */}
                {!validation && (
                  <div className="flex justify-end pt-2">
                    <button type="button" onClick={validate}
                      disabled={busy === 'validate' || !form.publicIp.trim() || !form.pass}
                      className="btn-primary px-6 py-2.5">
                      {busy === 'validate'
                        ? <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Validando…</>
                        : <><Zap className="w-4 h-4 shrink-0" /> Validar conexión</>}
                    </button>
                  </div>
                )}

                {/* Resultado de validación + acción de habilitar */}
                {validation && meta && !result && (
                  <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${meta.badge} gap-1.5`}>
                        <Info className="w-3.5 h-3.5" /> {meta.label}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{meta.hint}</span>
                    </div>

                    <SummaryPanel summary={validation.summary} />

                    {validation.isDifferentDevice && (
                      <label className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 cursor-pointer">
                        <input type="checkbox" checked={confirmSwitch} onChange={(e) => setConfirmSwitch(e.target.checked)} className="mt-0.5" />
                        <span>
                          Ya hay un Servidor VPN en <span className="font-mono">{validation.currentMtIp}</span>.
                          Confirmo cambiarlo a <span className="font-mono">{form.connectIp.trim() || form.publicIp.trim()}</span>.
                        </span>
                      </label>
                    )}

                    <div className="flex justify-between gap-2">
                      <button type="button" onClick={() => { setValidation(null); setConfirmSwitch(false); }} className="btn-ghost btn-md">
                        Volver
                      </button>
                      <button type="button" onClick={bootstrap}
                        disabled={busy === 'bootstrap' || (validation.isDifferentDevice && !confirmSwitch)}
                        className={validation.state === 'ours' ? 'btn-outline btn-md' : 'btn-success btn-md'}>
                        {busy === 'bootstrap'
                          ? <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Preparando…</>
                          : validation.state === 'ours'
                            ? <><RefreshCw className="w-4 h-4 shrink-0" /> Re-verificar / Reparar</>
                            : <><Zap className="w-4 h-4 shrink-0" /> Habilitar servidor</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Resultado del bootstrap: checklist */}
                {result && (
                  <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge badge-success gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {result.message}
                      </span>
                    </div>
                    <StepsList steps={result.steps} />
                    <div className="flex justify-end">
                      <button type="button" onClick={() => { setResult(null); setValidation(null); setFormOverride(false); }} className="btn-primary btn-md">
                        <CheckCircle2 className="w-4 h-4" /> Listo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5" role="alert">
                <XCircle className="w-4 h-4 shrink-0" /> {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
