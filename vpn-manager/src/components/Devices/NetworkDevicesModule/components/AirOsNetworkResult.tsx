import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clipboard, Download, Loader2, RadioTower } from 'lucide-react';
import type { AirOsAiAnalysisResult } from '@gestionvpn/contracts';
import type { AirOsNetworkReportContext } from '../hooks/useAirOsAi';
import { buildAirOsNetworkReportData, RISK_LABELS } from '../utils/airOsAiReport';
import { copyAirOsNetworkWhatsApp } from '../utils/formatAirOsWhatsApp';

interface Props {
  result: AirOsAiAnalysisResult;
  context: AirOsNetworkReportContext;
}

export function AirOsNetworkResult({ result, context }: Props) {
  const [exporting, setExporting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const report = useMemo(() => buildAirOsNetworkReportData({
    analysis: result.analysis,
    selection: context.selection,
    devices: context.devices,
    snapshotAt: context.snapshotAt,
    subnet: context.scope.subnet,
  }), [context, result.analysis]);
  const deviceByAlias = useMemo(() => new Map(report.devices.map(device => [device.alias, device])), [report.devices]);

  const exportPdf = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { exportAirOsNetworkAnalysisPdf } = await import('../utils/exportAirOsAiPdf');
      await exportAirOsNetworkAnalysisPdf(report);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'No se pudo crear el PDF');
    } finally {
      setExporting(false);
    }
  };

  const copyWhatsApp = async () => {
    setCopying(true);
    try { await copyAirOsNetworkWhatsApp(report); }
    finally { setCopying(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <AlertTriangle className="mr-2 inline h-4 w-4" />
        Resultado orientativo. Tú decides y ejecutas cualquier acción manual después de verificarla.
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge">{result.analysis.severity}</span>
            <span className="badge">Confianza {result.analysis.confidence}</span>
            {result.cached && <span className="badge">Caché · 0 tokens</span>}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">{result.analysis.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button onClick={copyWhatsApp} disabled={copying} className="btn-outline btn-md flex min-h-11 shrink-0 items-center gap-2">
          {copying ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Clipboard className="h-4 w-4" />}
          {copying ? 'Copiando…' : 'Copiar WhatsApp'}
        </button>
        <button onClick={exportPdf} disabled={exporting} className="btn-outline btn-md flex min-h-11 shrink-0 items-center gap-2">
          {exporting ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Creando PDF…' : 'Exportar PDF'}
        </button>
        </div>
      </div>
      {exportError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{exportError}</p>}

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-xs text-slate-500">STA evaluados</dt><dd className="font-bold">{report.summary.sta}</dd></div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-xs text-slate-500">AP excluidos</dt><dd className="font-bold">{report.summary.apExcluded}</dd></div>
        <div className="rounded-lg bg-violet-50 p-3 dark:bg-violet-500/10"><dt className="text-xs text-violet-600">Analizados por IA</dt><dd className="font-bold">{report.summary.selected}</dd></div>
        <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10"><dt className="text-xs text-amber-700 dark:text-amber-300">Malos</dt><dd className="font-bold">{report.summary.bad}</dd></div>
        <div className="rounded-lg bg-rose-50 p-3 dark:bg-rose-500/10"><dt className="text-xs text-rose-700 dark:text-rose-300">Críticos</dt><dd className="font-bold">{report.summary.critical}</dd></div>
      </dl>

      <section aria-labelledby="analyzed-devices-title">
        <h3 id="analyzed-devices-title" className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Equipos enviados a Gemini</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr><th className="p-3">Estado</th><th className="p-3">Equipo / IP</th><th className="p-3">AP asociado</th><th className="p-3">Señal</th><th className="p-3">SNR</th><th className="p-3">CCQ</th><th className="p-3">TX/RX</th></tr></thead>
            <tbody>
              {report.devices.map(device => (
                <tr key={device.alias} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-3"><span className="font-bold">{RISK_LABELS[device.level]}</span><br /><span className="text-slate-500">{device.score}/100</span></td>
                  <td className="p-3"><span className="font-bold text-slate-800 dark:text-slate-100">{device.name}</span><br /><span className="font-mono text-slate-500">{device.ip}</span></td>
                  <td className="p-3"><RadioTower className="mr-1 inline h-3.5 w-3.5" />{device.apName}</td>
                  <td className="p-3">{device.signal == null ? '—' : `${device.signal} dBm`}</td>
                  <td className="p-3">{device.snr == null ? '—' : `${device.snr} dB`}</td>
                  <td className="p-3">{device.ccq == null ? '—' : `${device.ccq}%`}</td>
                  <td className="p-3">{device.txRate ?? '—'} / {device.rxRate ?? '—'} Mbps</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="local-observations-title">
        <h3 id="local-observations-title" className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">ParÃ¡metros observados por equipo</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {report.devices.map(device => (
            <article key={`local-${device.alias}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h4 className="font-bold text-slate-800 dark:text-slate-100">{device.name}</h4>
              <p className="mt-1 text-xs text-slate-500">{device.ip} Â· {device.apName}</p>
              {device.reasons.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {device.reasons.map(reason => (
                    <div key={reason.code} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                      <strong>{reason.label}:</strong> {reason.value} {reason.unit}
                    </div>
                  ))}
                </div>
              ) : <p className="mt-3 text-xs text-slate-500">Sin parÃ¡metros locales adicionales fuera de la selecciÃ³n.</p>}
            </article>
          ))}
        </div>
      </section>

      <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
        <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">Recomendaciones de Gemini por equipo</h3>
        <div className="space-y-3">
          {result.analysis.findings.map((finding, index) => (
            <article key={`${finding.title}-${index}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h4 className="font-bold text-slate-800 dark:text-slate-100">{finding.title}</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(finding.deviceIds || []).map(alias => {
                  const device = deviceByAlias.get(alias);
                  return <span key={alias} className="rounded-md bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">{device ? `${device.name} · ${device.ip}` : alias}</span>;
                })}
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">{finding.interpretation}</p>
              {finding.evidence.length > 0 && <p className="mt-2 text-xs text-slate-500"><strong>Evidencia:</strong> {finding.evidence.join(' · ')}</p>}
              {finding.possibleCauses.length > 0 && <p className="mt-2 text-xs text-slate-500"><strong>Posibles causas:</strong> {finding.possibleCauses.join(' · ')}</p>}
              {finding.manualChecks.length > 0 && <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">{finding.manualChecks.map(check => <li key={check} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{check}</li>)}</ul>}
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60">
        <strong>No enviados a Gemini:</strong> {report.summary.healthy} saludables · {report.summary.observation} en observación · {report.summary.apExcluded} AP excluidos. Esta separación se calculó localmente sin consumir tokens.
        <span className="mt-1 block"><strong>Ahorro:</strong> sólo {report.summary.selected} de {report.summary.sta} receptores STA formaron parte del análisis.</span>
      </div>
    </div>
  );
}
