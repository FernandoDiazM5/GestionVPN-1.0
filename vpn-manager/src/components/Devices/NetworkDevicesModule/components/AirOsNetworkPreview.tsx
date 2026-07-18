import type { AirOsNetworkScoreResult, AirOsRiskLevel } from '@gestionvpn/contracts';
import { AlertTriangle, CheckCircle2, RadioTower, Sparkles } from 'lucide-react';
import type { ScannedDevice } from '../../../../types/devices';
import { RISK_LABELS } from '../utils/airOsAiReport';

interface Props {
  devices: ScannedDevice[];
  preview: AirOsNetworkScoreResult;
  selectedIndexes: number[];
  onToggle: (index: number) => void;
  disabled: boolean;
}

const LEVEL_CLASSES: Record<AirOsRiskLevel, string> = {
  healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  observation: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  deficient: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
  bad: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
  critical: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200',
};

export function AirOsNetworkPreview({ devices, preview, selectedIndexes, onToggle, disabled }: Props) {
  const selected = new Set(selectedIndexes);
  const candidates = preview.rows.filter(row => row.candidate).sort((a, b) => b.score - a.score);
  const evaluated = preview.rows.filter(row => row.role === 'sta' && !row.candidate).sort((a, b) => b.score - a.score);
  const summary = preview.summary;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Preselección local sin consumo de tokens</p>
            <p className="mt-1 text-xs leading-5">Se excluyeron los AP y se puntuaron únicamente receptores STA. Gemini recibirá como máximo 10 candidatos, sin nombre, IP ni MAC.</p>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-xs text-slate-500">STA evaluados</dt><dd className="font-bold">{summary.sta}</dd></div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-xs text-slate-500">AP excluidos</dt><dd className="font-bold">{summary.apExcluded}</dd></div>
        <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10"><dt className="text-xs text-amber-700 dark:text-amber-300">Candidatos</dt><dd className="font-bold text-amber-900 dark:text-amber-100">{summary.candidates}</dd></div>
        <div className="rounded-lg bg-violet-50 p-3 dark:bg-violet-500/10"><dt className="text-xs text-violet-700 dark:text-violet-300">Seleccionados</dt><dd className="font-bold text-violet-900 dark:text-violet-100">{selected.size} / 10</dd></div>
      </dl>

      {candidates.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600 dark:text-emerald-300" />
          <p className="mt-2 font-bold text-emerald-900 dark:text-emerald-100">No se detectaron candidatos</p>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">No se realizará ninguna llamada a Gemini.</p>
        </div>
      ) : (
        <section aria-labelledby="ai-candidates-title">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 id="ai-candidates-title" className="text-sm font-bold text-slate-800 dark:text-slate-100">Equipos candidatos para Gemini</h3>
            <span className="text-xs text-slate-500">Mayor puntaje = peor estado</span>
          </div>
          <div className="space-y-2">
            {candidates.map(row => {
              const device = devices[row.index];
              const stats = device?.cachedStats;
              const checked = selected.has(row.index);
              return (
                <label key={row.index} className={`block rounded-xl border p-3 transition-colors ${checked ? 'border-violet-300 bg-violet-50/70 dark:border-violet-500/40 dark:bg-violet-500/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40'}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(row.index)}
                      disabled={disabled || (!checked && selected.size >= 10)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words text-sm font-bold text-slate-800 dark:text-slate-100">{stats?.deviceName || device?.name || row.alias}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${LEVEL_CLASSES[row.level]}`}>{RISK_LABELS[row.level]}</span>
                        {row.mandatory && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">Prioridad obligatoria</span>}
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">{row.score}/100</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{device?.ip} · <RadioTower className="inline h-3.5 w-3.5" /> {device?.parentAp || stats?.essid || device?.essid || 'AP no identificado'}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.reasons.slice(0, 4).map(reason => <span key={reason.code} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{reason.label}: {reason.value} {reason.unit}</span>)}
                      </div>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {evaluated.length > 0 && (
        <details className="rounded-xl border border-slate-200 dark:border-slate-700">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200">
            Otros STA evaluados y no enviados ({evaluated.length})
          </summary>
          <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-700">
            {evaluated.map(row => {
              const device = devices[row.index];
              const stats = device?.cachedStats;
              return (
                <div key={row.index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-200">{stats?.deviceName || device?.name || row.alias}</span>
                  <span className="text-slate-500">{device?.ip}</span>
                  <span className={`rounded-full px-2 py-0.5 font-bold ${LEVEL_CLASSES[row.level]}`}>{RISK_LABELS[row.level]} · {row.score}/100</span>
                  <span className="text-slate-500">S {stats?.signal ?? '—'} · CCQ {stats?.ccq ?? '—'} · TX/RX {stats?.txRate ?? '—'}/{stats?.rxRate ?? '—'}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700">
        <p><strong>No enviados:</strong> {summary.healthy} saludables · {summary.observation} en observación · {summary.unknownExcluded} con rol no confirmado.</p>
        <p className="mt-1"><strong>Ahorro directo:</strong> Gemini recibirá {selected.size} de {summary.sta} STA; {Math.max(0, summary.sta - selected.size)} receptores quedan fuera del payload.</p>
        {summary.candidates > 10 && <p className="mt-1 flex items-center gap-1 text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> Sólo se preseleccionaron los 10 puntajes más altos; puedes intercambiarlos desmarcando uno.</p>}
      </div>
    </div>
  );
}
