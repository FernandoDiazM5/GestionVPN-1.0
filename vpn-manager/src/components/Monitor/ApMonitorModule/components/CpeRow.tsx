import { Eye, ExternalLink } from 'lucide-react';
import type { LiveCpe } from '../../../../types/apMonitor';
import { fmtDbm, fmtPct, fmtMbps, fmtKbps, fmtUptime } from '../utils/formatters';
import { sigColor, ccqColor } from '../utils/colors';

function CpeRow({ cpe, idx, onDetail, hiddenCols, gridCols }: {
  cpe: LiveCpe; idx: number;
  onDetail: (mac: string, ip: string | null) => void;
  hiddenCols: Set<string>;
  gridCols: string;
}) {
  const show = (k: string) => !hiddenCols.has(k);

  const snr = cpe.signal != null && cpe.noisefloor != null ? cpe.signal - cpe.noisefloor : null;
  const cinrVal = cpe.airmax_cinr_rx ?? snr;

  const displayName = cpe.remote_hostname || cpe.cpe_name || cpe.hostname || null;
  const displayModel = cpe.cpe_product || cpe.modelo || null;
  const ff = cpe.firmware_family;

  return (
    <div
      className={`grid items-center text-xs border-b border-slate-100 last:border-0 transition-colors dark:border-slate-800
        ${idx % 2 === 0 ? 'bg-white hover:bg-slate-50/80 dark:bg-slate-900 dark:hover:bg-slate-800/60' : 'bg-slate-50/50 hover:bg-slate-50 dark:bg-slate-900/60 dark:hover:bg-slate-800/40'}`}
      style={{ gridTemplateColumns: gridCols }}>

      <div className="px-1.5 py-3 flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-emerald-500" title="Conectado" />
      </div>

      <div className="px-2 py-2 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <p className="font-mono font-semibold text-slate-700 truncate text-2xs">{cpe.mac}</p>
          {ff && (
            <span className={`shrink-0 text-3xs font-bold px-1 py-0.5 rounded
              ${ff === 'AC' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'}`}>
              {ff}
            </span>
          )}
        </div>
        {displayName && <p className="text-3xs text-indigo-600 truncate font-medium">{displayName}</p>}
      </div>

      {show('modelo') && (
        <div className="px-2 py-2 min-w-0">
          <p className="text-2xs text-slate-600 truncate">{displayModel || <span className="data-empty">—</span>}</p>
        </div>
      )}

      {show('nombre') && (
        <div className="px-2 py-2 min-w-0">
          {displayName
            ? <p className="truncate font-semibold text-slate-800 text-2xs">{displayName}</p>
            : <p className="text-slate-400 dark:text-slate-500 italic text-3xs">Sin nombre</p>}
        </div>
      )}

      {show('signal') && (
        <div className="px-2 py-2 text-right">
          <span className={`font-mono font-bold text-xs ${sigColor(cpe.signal)}`}>{fmtDbm(cpe.signal)}</span>
        </div>
      )}

      {show('rssi') && (
        <div className="px-2 py-2 text-right">
          <span className={`font-mono text-xs ${sigColor(cpe.remote_signal)}`}>{fmtDbm(cpe.remote_signal)}</span>
        </div>
      )}

      {show('noise') && (
        <div className="px-2 py-2 text-right font-mono text-slate-500 text-xs">{fmtDbm(cpe.noisefloor)}</div>
      )}

      {show('cinr') && (
        <div className="px-2 py-2 text-right font-mono text-slate-600 text-xs">
          {cinrVal != null ? `${cinrVal} dB` : '—'}
        </div>
      )}

      {show('ccq') && (
        <div className="px-2 py-2 text-right">
          <span className={`font-mono font-bold text-xs ${ccqColor(cpe.ccq)}`}>{fmtPct(cpe.ccq)}</span>
        </div>
      )}

      {show('tx_rate') && (
        <div className="px-2 py-2 text-right font-mono text-sky-700 font-semibold text-xs">{fmtMbps(cpe.tx_rate)}</div>
      )}

      {show('rx_rate') && (
        <div className="px-2 py-2 text-right font-mono text-indigo-700 font-semibold text-xs">{fmtMbps(cpe.rx_rate)}</div>
      )}

      {show('am_qual') && (
        <div className="px-2 py-2 text-right font-mono text-emerald-700 text-xs">
          {cpe.airmax_quality != null ? `${cpe.airmax_quality}%` : '—'}
        </div>
      )}

      {show('am_cap') && (
        <div className="px-2 py-2 text-right font-mono text-emerald-600 text-xs">
          {cpe.airmax_capacity != null ? `${cpe.airmax_capacity}%` : '—'}
        </div>
      )}

      {show('am_dcap') && (
        <div className="px-2 py-2 text-right font-mono text-cyan-700 font-semibold text-xs">
          {cpe.airmax_dcap != null ? `${cpe.airmax_dcap} Mbps` : '—'}
        </div>
      )}

      {show('am_ucap') && (
        <div className="px-2 py-2 text-right font-mono text-cyan-600 font-semibold text-xs">
          {cpe.airmax_ucap != null ? `${cpe.airmax_ucap} Mbps` : '—'}
        </div>
      )}

      {show('air_tx') && (
        <div className="px-2 py-2 text-right font-mono text-amber-600 text-xs">
          {fmtPct(cpe.airmax_tx_usage)}
        </div>
      )}

      {show('air_rx') && (
        <div className="px-2 py-2 text-right font-mono text-amber-600 text-xs">
          {fmtPct(cpe.airmax_rx_usage)}
        </div>
      )}

      {show('thr_rx') && (
        <div className="px-2 py-2 text-right font-mono text-emerald-700 font-semibold text-xs">{fmtKbps(cpe.throughputRxKbps)}</div>
      )}

      {show('thr_tx') && (
        <div className="px-2 py-2 text-right font-mono text-rose-600 font-semibold text-xs">{fmtKbps(cpe.throughputTxKbps)}</div>
      )}

      {show('uptime') && (
        <div className="px-2 py-2 font-mono text-slate-500 dark:text-slate-400 text-2xs truncate">{fmtUptime(cpe.uptimeStr)}</div>
      )}

      {show('distance') && (
        <div className="px-2 py-2 text-right font-mono text-slate-500 text-xs">
          {cpe.distance != null ? `${cpe.distance} m` : '—'}
        </div>
      )}

      {show('lastip') && (
        <div className="px-2 py-2 font-mono text-2xs text-slate-500 truncate">{cpe.lastip || '—'}</div>
      )}

      <div className="px-2 py-2 flex items-center justify-end gap-0.5">
        <button onClick={() => onDetail(cpe.mac, cpe.lastip || null)} title="Ver detalle del CPE"
          className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors dark:text-indigo-400 dark:hover:bg-indigo-500/10">
          <Eye className="w-3.5 h-3.5" />
        </button>
        {cpe.lastip && (
          <a href={`http://${cpe.lastip}`} target="_blank" rel="noopener noreferrer"
            title={`Abrir ${cpe.lastip}`}
            className="p-1.5 text-sky-500 hover:bg-sky-50 rounded-lg transition-colors flex items-center dark:text-sky-400 dark:hover:bg-sky-500/10">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default CpeRow;
