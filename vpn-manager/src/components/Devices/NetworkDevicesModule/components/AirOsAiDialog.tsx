import { AlertTriangle, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import Dialog from '../../../Common/Dialog';
import type { AirOsAiController } from '../hooks/useAirOsAi';
import { AirOsNetworkPreview } from './AirOsNetworkPreview';
import { AirOsNetworkResult } from './AirOsNetworkResult';

export function AirOsAiDialog({ controller }: { controller: AirOsAiController }) {
  const { pending, result, networkReport, busy, error, status, submit, close, toggleNetworkDevice } = controller;
  if (!pending && !result) return null;

  const analysis = result?.analysis;
  const visibleCount = pending?.kind === 'NETWORK' ? pending.scope.visibleCount : 1;
  const sentCount = pending?.kind === 'NETWORK' ? pending.selectedIndexes.length : 1;
  const noNetworkSelection = pending?.kind === 'NETWORK' && pending.selectedIndexes.length === 0;

  return (
    <Dialog
      title={analysis ? 'Resultado del análisis AirOS' : 'Confirmar análisis con Gemini'}
      onClose={close}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      panelClassName={`modal-panel ${pending?.kind === 'NETWORK' || networkReport ? 'modal-panel-3xl' : 'modal-panel-2xl'} h-[min(90vh,780px)] max-h-[90vh]`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100">Análisis consultivo AirOS</p>
            <p className="text-xs text-slate-500">Gemini · sin ejecución de cambios</p>
          </div>
        </div>
        <button onClick={close} disabled={busy} aria-label="Cerrar análisis" className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 [scrollbar-gutter:stable]">
        {analysis && networkReport && result ? (
          <>
            <AirOsNetworkResult result={result} context={networkReport} />
            <div className="flex justify-end"><button onClick={close} className="btn-primary btn-md min-h-11">Cerrar</button></div>
          </>
        ) : !analysis ? (
          <>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100">
              <p className="font-bold">Se enviarán métricas técnicas seudonimizadas.</p>
              <p className="mt-1 text-xs leading-5">No se envían a Gemini IP, MAC, nombre, contraseñas, credenciales SSH ni datos crudos. Gemini sólo entrega observaciones; no puede modificar equipos ni tomar decisiones. En el nivel gratuito, Google puede usar el contenido procesado para mejorar sus productos.</p>
            </div>
            {pending?.kind === 'NETWORK' ? (
              <AirOsNetworkPreview devices={pending.devices} preview={pending.preview} selectedIndexes={pending.selectedIndexes} onToggle={toggleNetworkDevice} disabled={busy} />
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-xs text-slate-500">Vista seleccionada</dt><dd className="font-bold">Equipo individual</dd></div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-xs text-slate-500">Equipos con datos</dt><dd className="font-bold">{sentCount} de {visibleCount}</dd></div>
              </dl>
            )}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-xs text-slate-500">Solicitudes hoy</dt><dd className="font-bold">{status?.usage.requestCount ?? 0} / {status?.limits.workspaceDailyRequests ?? '—'}</dd></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-xs text-slate-500">Consentimiento</dt><dd className="font-bold">{status?.consentAccepted ? 'Aceptado' : 'Se aceptará al continuar'}</dd></div>
            </dl>
            {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={close} disabled={busy} className="btn-outline btn-md min-h-11">Cancelar</button>
              <button onClick={submit} disabled={busy || noNetworkSelection} className="btn-primary btn-md min-h-11 flex items-center gap-2">
                {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? 'Analizando…' : status?.consentAccepted ? 'Analizar' : 'Aceptar y analizar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              Resultado orientativo. Tú decides y ejecutas cualquier acción manual después de verificarla.
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge">{analysis.severity}</span>
                <span className="badge">Confianza {analysis.confidence}</span>
                {result.cached && <span className="badge">Caché · 0 tokens</span>}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">{analysis.summary}</p>
            </div>
            <div className="space-y-3">
              {analysis.findings.map((finding, index) => (
                <article key={`${finding.title}-${index}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">{finding.title}</h3>
                  <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">{finding.interpretation}</p>
                  {finding.evidence.length > 0 && <p className="mt-2 text-xs text-slate-500"><strong>Evidencia:</strong> {finding.evidence.join(' · ')}</p>}
                  {finding.manualChecks.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {finding.manualChecks.map(check => <li key={check} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{check}</li>)}
                    </ul>
                  )}
                </article>
              ))}
            </div>
            {analysis.limitations.length > 0 && <p className="text-xs leading-5 text-slate-500"><strong>Limitaciones:</strong> {analysis.limitations.join(' · ')}</p>}
            <div className="flex justify-end"><button onClick={close} className="btn-primary btn-md min-h-11">Cerrar</button></div>
          </>
        )}
      </div>
    </Dialog>
  );
}
