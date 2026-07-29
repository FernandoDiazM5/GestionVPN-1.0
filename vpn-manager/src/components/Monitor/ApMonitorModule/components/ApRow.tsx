import React, { Fragment } from 'react';
import { ChevronDown, ChevronRight, Eye, RefreshCw, Loader2, WifiOff, ExternalLink, Activity, ArrowRightLeft, Trash2, Users, KeyRound } from 'lucide-react';
import type { SavedDevice } from '../../../../types/devices';
import type { PollResult } from '../../../../types/apMonitor';
import StationTable from './StationTable';
import { ApRowKebab } from './ApRowKebab';
import { fmtDbm, fmtPct, fmtFw, fmtUptime, fmtCpu } from '../utils/formatters';
import { sigColor, ccqColor } from '../utils/colors';
import { AP_COL_DEFS } from '../utils/columnDefs';

const ApRow = React.memo(function ApRow({ dev, pollResult, expanded, hiddenApCols, onToggle, onCpeDetail, onM5Detail, onView, onSync, onDelete, onMove, onRevealSsh }: {
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
  onRevealSsh: () => void;
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
  const menuItems = [
    { icon: <Eye className="w-3.5 h-3.5" />, label: 'Ver información', onClick: onView },
    { icon: <Activity className="w-3.5 h-3.5" />, label: 'Revisar diagnóstico', onClick: onM5Detail },
    { icon: <ExternalLink className="w-3.5 h-3.5" />, label: 'Abrir equipo', onClick: () => window.open(`http://${dev.ip}`, '_blank', 'noopener,noreferrer') },
    { icon: <KeyRound className="w-3.5 h-3.5" />, label: 'Ver credenciales', onClick: onRevealSsh, disabled: noSsh },
    { icon: <ArrowRightLeft className="w-3.5 h-3.5" />, label: 'Mover a sitio', onClick: onMove },
    { icon: <Trash2 className="w-3.5 h-3.5" />, label: 'Eliminar antena', onClick: onDelete, danger: true },
  ];

  return (
    <Fragment>
      <div className="border-b border-slate-100 p-4 sm:hidden dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-2xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">Antena</span>
              {isPolling
                ? <span className="text-xs font-semibold text-sky-600">Actualizando…</span>
                : hasError
                  ? <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Requiere atención</span>
                  : cpeCount != null
                    ? <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">En línea</span>
                    : <span className="text-xs text-slate-500">Sin información</span>}
            </div>
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name || dev.ip}</p>
            <p className="font-mono text-xs text-slate-500">{dev.ip}</p>
          </div>
          <ApRowKebab items={menuItems} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
          <div><span className="block text-slate-500">Modelo</span><strong className="text-slate-700 dark:text-slate-200">{model || 'Sin información'}</strong></div>
          <div><span className="block text-slate-500">Clientes</span><strong className="text-slate-700 dark:text-slate-200">{displayCount ?? '—'}</strong></div>
          {freqGhz ? <div><span className="block text-slate-500">Frecuencia</span><strong className="text-slate-700 dark:text-slate-200">{freqGhz}</strong></div> : null}
          {ssid ? <div><span className="block text-slate-500">Red</span><strong className="block truncate text-slate-700 dark:text-slate-200">{ssid}</strong></div> : null}
        </div>
        <div className="mt-3 flex gap-2">
          {noSsh ? (
            <button type="button" onClick={onView} className="btn-outline min-h-11 flex-1 border-amber-200 text-xs text-amber-700">
              <WifiOff className="h-4 w-4" /> Credenciales requeridas
            </button>
          ) : (
            <button type="button" onClick={onToggle} className="btn-primary min-h-11 flex-1 text-xs">
              <Users className="h-4 w-4" /> {expanded ? 'Ocultar clientes' : 'Ver clientes'}
            </button>
          )}
          <button type="button" onClick={onSync} disabled={isPolling} aria-label="Actualizar esta antena" className="btn-outline flex min-h-11 min-w-11 items-center justify-center">
            {isPolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="hidden items-center px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors sm:grid dark:border-slate-800 dark:hover:bg-slate-800/40"
        style={{ gridTemplateColumns: gridCols }}>

        <div>
          <span className="inline-flex text-2xs font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400">Antena</span>
          {freqGhz && <p className="text-3xs font-bold text-sky-600 dark:text-sky-400 mt-0.5">{freqGhz}</p>}
          {netMode && <p className="text-3xs text-slate-400 dark:text-slate-500 truncate">{netMode === 'bridge' ? 'Modo puente' : netMode}</p>}
        </div>

        <div className="min-w-0 pr-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate" title={name || dev.ip}>{name || dev.ip}</p>
          <p className="font-mono text-3xs text-slate-500 dark:text-slate-400 truncate">{dev.ip}</p>
        </div>

        {showAp('modelo') && (
          <div className="min-w-0 pr-2">
            {model && <p className="text-xs text-slate-600 dark:text-slate-300 truncate" title={model}>{model}</p>}
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
              : <span className="text-slate-500 dark:text-slate-500 text-xs">—</span>}
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
                  : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400'}`}
              title={isHistorical && dev.lastCpeCountAt
                ? `Última sync: ${new Date(dev.lastCpeCountAt).toLocaleString()}`
                : undefined}>
              <Users className="w-2.5 h-2.5" />
              {displayCount}
              {isHistorical && <span className="text-3xs opacity-60">*</span>}
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-500 text-xs">—</span>
          )}
        </div>

        <div className="flex items-center justify-center">
          {isPolling
            ? <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
            : hasError
                ? <span className="w-2 h-2 rounded-full bg-amber-400" title={pollResult?.error || 'Requiere atención'} />
              : cpeCount != null
                ? <span className="w-2 h-2 rounded-full bg-emerald-500" title="En línea" />
                : <span className="w-2 h-2 rounded-full bg-slate-300" title="Sin información reciente" />}
        </div>

        <div className="flex items-center gap-0.5 pl-1">
          {noSsh ? (
            <button
              type="button"
              onClick={onView}
              title="Confirmar credenciales de acceso"
              className="flex min-h-11 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-2xs font-bold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
            >
              <WifiOff className="w-3 h-3" /><span>Credenciales requeridas</span>
            </button>
          ) : (
            <button onClick={onToggle}
              title={expanded ? 'Ocultar clientes' : 'Ver clientes conectados'}
              className={`flex min-h-11 items-center gap-1 px-2 py-1.5 rounded-lg text-2xs font-bold transition-all
                ${expanded
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400'
                  : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:border-indigo-500/30 dark:text-indigo-400'}`}>
              {isPolling
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>Ver clientes</span>
            </button>
          )}
          <button onClick={onSync} title="Actualizar esta antena" aria-label="Actualizar esta antena" disabled={isPolling}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
            {isPolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <ApRowKebab items={menuItems} />
        </div>
      </div>

      {expanded && pollResult && (
        <StationTable poll={pollResult} onCpeDetail={onCpeDetail} dev={dev} />
      )}
    </Fragment>
  );
});

export default ApRow;
