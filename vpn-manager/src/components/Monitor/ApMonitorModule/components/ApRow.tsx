import React, { Fragment } from 'react';
import { ChevronDown, ChevronRight, Eye, RefreshCw, Loader2, WifiOff, ExternalLink, Activity, ArrowRightLeft, Trash2, Users } from 'lucide-react';
import type { SavedDevice } from '../../../../types/devices';
import type { PollResult } from '../../../../types/apMonitor';
import StationTable from './StationTable';
import { fmtDbm, fmtPct, fmtFw, fmtUptime, fmtCpu } from '../utils/formatters';
import { sigColor, ccqColor } from '../utils/colors';
import { AP_COL_DEFS } from '../utils/columnDefs';

const ApRow = React.memo(function ApRow({ dev, pollResult, expanded, hiddenApCols, onToggle, onCpeDetail, onM5Detail, onView, onSync, onDelete, onMove }: {
  dev: SavedDevice;
  pollResult?: PollResult;
  expanded: boolean;
  hiddenApCols: Set<string>;
  onToggle: () => void;
  onCpeDetail: (mac: string, ip: string | null) => void;
  onM5Detail: () => void;
  onView: () => void;
  onSync: () => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  const stats = dev.cachedStats;
  const name = stats?.deviceName ?? dev.deviceName ?? dev.name;
  const ssid = stats?.essid ?? dev.essid;
  const freq = stats?.frequency ?? dev.frequency;
  const freqGhz = freq ? `${(freq / 1000).toFixed(1)} GHz` : null;
  const model = stats?.deviceModel ?? dev.model;
  const firmware = stats?.firmwareVersion ?? dev.firmware;
  const channel = stats?.channelWidth ?? dev.channelWidth;
  const txPower = stats?.txPower;
  const netMode = stats?.networkMode ?? dev.networkMode;
  const noSsh = !dev.sshUser || (dev.sshPass === undefined && !dev.hasSshPass);
  const isPolling = pollResult?.loading ?? false;
  const cpeCount = pollResult?.stations.length ?? null;
  const lastCount = dev.lastCpeCount ?? null;
  const displayCount = cpeCount ?? lastCount;
  const isHistorical = cpeCount === null && lastCount !== null;
  const hasError = !!pollResult?.error;

  const showAp = (key: string) => !hiddenApCols.has(key);
  const visibleApCols = AP_COL_DEFS.filter(c => c.always || showAp(c.key));
  const gridCols = visibleApCols.map(c => c.width).join(' ');

  return (
    <Fragment>
      <div className="grid items-center px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:hover:bg-slate-800/40"
        style={{ gridTemplateColumns: gridCols }}>

        <div>
          <span className="inline-flex text-2xs font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400">AP</span>
          {freqGhz && <p className="text-3xs font-bold text-sky-600 mt-0.5">{freqGhz}</p>}
          {netMode && <p className="text-3xs text-slate-400 truncate">{netMode}</p>}
        </div>

        <div className="min-w-0 pr-2">
          <p className="text-sm font-semibold text-slate-800 truncate" title={name || dev.ip}>{name || dev.ip}</p>
          <p className="font-mono text-3xs text-slate-500 dark:text-slate-400 truncate">{dev.ip}</p>
        </div>

        {showAp('modelo') && (
          <div className="min-w-0 pr-2">
            {model && <p className="text-xs text-slate-600 truncate" title={model}>{model}</p>}
            {firmware && <p className="text-3xs text-slate-500 dark:text-slate-400 truncate">{fmtFw(firmware)}</p>}
          </div>
        )}

        {showAp('ssid') && (
          <div className="min-w-0 pr-2">
            {ssid
              ? <p className="font-mono text-xs text-slate-700 truncate" title={ssid}>{ssid}</p>
              : <span className="data-empty">—</span>}
            {channel && <p className="text-3xs text-slate-500 dark:text-slate-400">{channel} MHz</p>}
          </div>
        )}

        {showAp('signal') && (
          <div className="text-right pr-2">
            <span className={`font-mono font-bold text-xs ${sigColor(stats?.signal)}`}>{fmtDbm(stats?.signal)}</span>
          </div>
        )}

        {showAp('ccq') && (
          <div className="text-right pr-2">
            <span className={`font-mono font-bold text-xs ${ccqColor(stats?.ccq)}`}>{fmtPct(stats?.ccq)}</span>
          </div>
        )}

        {showAp('txpwr') && (
          <div className="text-right pr-2">
            {txPower != null
              ? <span className="text-xs font-mono font-bold text-indigo-600">{txPower} dBm</span>
              : <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>}
          </div>
        )}

        {showAp('uptime') && (
          <div className="min-w-0 pr-2 overflow-hidden">
            <span className="font-mono text-2xs text-slate-500 dark:text-slate-400 truncate block">{fmtUptime(stats?.uptimeStr)}</span>
          </div>
        )}

        {showAp('cpu') && (
          <div className="text-right pr-2">
            <span className="font-mono text-xs text-slate-500">{fmtCpu(stats?.cpuLoad)}</span>
          </div>
        )}

        <div className="flex items-center justify-center">
          {displayCount != null ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold
              ${expanded ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                : isHistorical ? 'bg-slate-100 text-slate-400 dark:bg-slate-700/50 dark:text-slate-500'
                  : 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400'}`}
              title={isHistorical && dev.lastCpeCountAt
                ? `Última sync: ${new Date(dev.lastCpeCountAt).toLocaleString()}`
                : undefined}>
              <Users className="w-2.5 h-2.5" />
              {displayCount}
              {isHistorical && <span className="text-3xs opacity-60">*</span>}
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
          )}
        </div>

        <div className="flex items-center justify-center">
          {isPolling
            ? <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
            : hasError
              ? <span className="w-2 h-2 rounded-full bg-amber-400" title={pollResult?.error} />
              : cpeCount != null
                ? <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
                : <span className="w-2 h-2 rounded-full bg-slate-300" title="Sin poll" />}
        </div>

        <div className="flex items-center gap-0.5 pl-1">
          {noSsh ? (
            <span className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-2xs font-bold text-amber-600 bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400">
              <WifiOff className="w-3 h-3" /><span>Sin SSH</span>
            </span>
          ) : (
            <button onClick={onToggle}
              title={expanded ? 'Ocultar CPEs' : 'Ver CPEs en tiempo real'}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-2xs font-bold transition-all
                ${expanded
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400'
                  : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:border-indigo-500/30 dark:text-indigo-400'}`}>
              {isPolling
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>CPEs</span>
            </button>
          )}
          <button onClick={onView} title="Estado / Ficha del equipo"
            className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors dark:text-indigo-400 dark:hover:bg-indigo-500/10">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button onClick={onSync} title="Sincronizar ahora" disabled={isPolling}
            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-500/10">
            {isPolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onM5Detail} title="Ver estado completo del dispositivo (airOS)"
            className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-2xs font-bold bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition-colors dark:bg-violet-500/10 dark:hover:bg-violet-500/20 dark:border-violet-500/30 dark:text-violet-400">
            <Activity className="w-2.5 h-2.5" />
            <span>Informe</span>
          </button>
          <a href={`http://${dev.ip}`} target="_blank" rel="noopener noreferrer"
            title={`Abrir ${dev.ip}`}
            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors flex items-center dark:text-slate-500 dark:hover:bg-slate-800">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={onMove} title="Mover a otro nodo"
            className="p-1.5 text-indigo-400 hover:bg-indigo-50 rounded-lg transition-colors dark:text-indigo-500 dark:hover:bg-indigo-500/10">
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} title="Eliminar equipo"
            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors dark:text-rose-400 dark:hover:bg-rose-500/10">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && pollResult && (
        <StationTable poll={pollResult} onCpeDetail={onCpeDetail} dev={dev} />
      )}
    </Fragment>
  );
});

export default ApRow;
