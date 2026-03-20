import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react';
import {
  Radio, Wifi, RefreshCw, Loader2, X,
  ChevronDown, ChevronRight, Eye, ExternalLink,
  AlertCircle, CheckCircle2, Activity, Signal, Clock,
  Database, Server, Users, ZapOff, WifiOff,
} from 'lucide-react';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { API_BASE_URL } from '../config';
import { deviceDb } from '../store/deviceDb';
import type { SavedDevice } from '../types/devices';
import type { LiveCpe, PollResult, CpeDetail, KnownCpe } from '../types/apMonitor';

const POLL_MS = 30_000;
const BASE = `${API_BASE_URL}/api/ap-monitor`;

// ── Helpers ───────────────────────────────────────────────────────────────
const fmtDbm  = (v?: number | null) => v != null ? `${v} dBm` : '—';
const fmtPct  = (v?: number | null) => v != null ? `${v}%` : '—';
const fmtKbps = (v?: number | null) => {
  if (v == null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(1)} Mbps` : `${v} kbps`;
};
const fmtRate = (v?: number | null) => {
  if (v == null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(0)} Mbps` : `${v} kbps`;
};
const sigColor = (v?: number | null) =>
  v == null ? 'text-slate-300' : v >= -65 ? 'text-emerald-600' : v >= -75 ? 'text-sky-600' : 'text-amber-500';
const ccqColor = (v?: number | null) =>
  v == null ? '' : v >= 80 ? 'text-emerald-600' : v >= 60 ? 'text-sky-600' : 'text-amber-500';
const fmtFw = (fw?: string) => {
  if (!fw) return null;
  const m = fw.match(/^([A-Z]+)\.?(v[\d.]+)/);
  return m ? `${m[2]} (${m[1]})` : fw;
};

// ── Node group derived from SavedDevice list ──────────────────────────────
interface NodeGroup {
  nodeId: string;
  nodeName: string;
  aps: SavedDevice[];
}

// ── CPE Detail Modal ──────────────────────────────────────────────────────
function CpeDetailModal({
  mac, apId, cpeIp, sshPort, sshUser, sshPass, onClose,
}: {
  mac: string; apId: string; cpeIp: string | null;
  sshPort: number; sshUser: string; sshPass: string;
  onClose: () => void;
}) {
  const [detail,  setDetail]  = useState<CpeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!cpeIp) { setError('IP del CPE no disponible — esperando próximo poll'); return; }
    setLoading(true);
    fetchWithTimeout(`${BASE}/cpes/${mac}/detail-direct`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpe_ip: cpeIp, port: sshPort, user: sshUser, pass: sshPass, apId }),
    }, 22_000)
      .then(r => r.json())
      .then(d => { if (d.success) setDetail(d.stats); else setError(d.message); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [mac, apId, cpeIp, sshPort, sshUser, sshPass]);

  const rows: Array<{ l: string; v: string | null | undefined; mono?: boolean; color?: string }> = detail ? [
    { l: 'Hostname',   v: detail.deviceName },
    { l: 'Modelo',     v: detail.deviceModel },
    { l: 'Firmware',   v: fmtFw(detail.firmwareVersion) },
    { l: 'IP LAN',     v: detail.ip, mono: true },
    { l: 'Modo',       v: detail.mode },
    { l: 'Modo Red',   v: detail.networkMode },
    { l: 'SSID AP',    v: detail.essid },
    { l: 'Señal',      v: fmtDbm(detail.signal), color: sigColor(detail.signal), mono: true },
    { l: 'Noise',      v: fmtDbm(detail.noiseFloor), mono: true },
    { l: 'CCQ',        v: fmtPct(detail.ccq), color: ccqColor(detail.ccq), mono: true },
    { l: 'TX Rate',    v: fmtRate(detail.txRate ? detail.txRate * 1000 : null), mono: true },
    { l: 'TX Power',   v: detail.txPower != null ? `${detail.txPower} dBm` : null, mono: true },
    { l: 'Canal',      v: detail.channelWidth != null ? `${detail.channelWidth} MHz` : null, mono: true },
    { l: 'Frecuencia', v: detail.frequency != null ? `${detail.frequency} MHz` : null, mono: true },
    { l: 'WLAN MAC',   v: detail.wlanMac, mono: true },
    { l: 'LAN MAC',    v: detail.lanMac, mono: true },
    { l: 'AP MAC',     v: detail.apMac, mono: true },
    { l: 'Seguridad',  v: detail.security },
    { l: 'Uptime',     v: detail.uptimeStr, mono: true },
  ].filter(r => r.v) as typeof rows : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-5 py-3 shrink-0">
          <div>
            <p className="text-xs font-bold text-white font-mono">{mac}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{cpeIp || 'IP desconocida'} · Detalle CPE</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Conectando SSH al CPE…</span>
            </div>
          )}
          {error && !loading && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-600">{error}</p>
            </div>
          )}
          {detail && !loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {rows.map(row => (
                <div key={row.l} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{row.l}</p>
                  <p className={`text-xs font-bold truncate ${row.color ?? 'text-slate-700'} ${row.mono ? 'font-mono' : ''}`}>{row.v}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Known CPEs Modal ──────────────────────────────────────────────────────
function KnownCpesModal({ apId, onClose }: { apId: string; onClose: () => void }) {
  const [cpes, setCpes] = useState<KnownCpe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout(`${BASE}/cpes`, {}, 10_000)
      .then(r => r.json())
      .then(d => { if (d.success) setCpes(d.cpes.filter((c: KnownCpe) => c.ap_id === apId)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-5 py-3 shrink-0">
          <p className="text-xs font-bold text-white">CPEs conocidos del AP</p>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-4">
          {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>}
          {!loading && cpes.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Sin CPEs conocidos para este AP</p>}
          {!loading && cpes.length > 0 && (
            <div className="space-y-2">
              {cpes.map(c => (
                <div key={c.mac} className="bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">Hostname</p><p className="font-semibold text-slate-700 truncate">{c.hostname || '—'}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">MAC</p><p className="font-mono text-slate-600 truncate">{c.mac}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">Modelo</p><p className="text-slate-600 truncate">{c.modelo || '—'}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">IP LAN</p><p className="font-mono text-slate-600">{c.ip_lan || '—'}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">SSID AP</p><p className="text-slate-600 truncate">{c.ssid_ap || '—'}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-400 uppercase">Última vez</p><p className="text-slate-400">{c.ultima_vez_visto ? new Date(c.ultima_vez_visto).toLocaleString() : '—'}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CPE Station Row ───────────────────────────────────────────────────────
function CpeRow({ cpe, idx, onDetail }: {
  cpe: LiveCpe; idx: number;
  onDetail: (mac: string, ip: string | null) => void;
}) {
  const snr = cpe.signal != null && cpe.noisefloor != null ? cpe.signal - cpe.noisefloor : null;
  const linkPotential = (cpe.tx_rate != null && cpe.rx_rate != null)
    ? fmtRate(cpe.tx_rate + cpe.rx_rate) : '—';

  return (
    <div
      className={`grid items-center text-[11px] border-b border-slate-100 last:border-0 transition-colors
        ${idx % 2 === 0 ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/50 hover:bg-slate-50'}`}
      style={{ gridTemplateColumns: '28px 130px 110px 140px 72px 72px 72px 64px 64px 60px 60px 62px 62px 76px 76px 100px 66px 110px 72px' }}>
      <div className="px-1.5 py-2 flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-emerald-500" title="Conectado" />
      </div>
      <div className="px-2 py-2 min-w-0">
        <p className="font-mono font-semibold text-slate-700 truncate text-[10px]">{cpe.mac}</p>
        {cpe.hostname && <p className="text-[9px] text-indigo-600 truncate font-medium">{cpe.hostname}</p>}
      </div>
      <div className="px-2 py-2 min-w-0">
        <p className="text-slate-500 truncate">{cpe.modelo || <span className="text-slate-300">—</span>}</p>
      </div>
      <div className="px-2 py-2 min-w-0">
        <p className={`truncate font-semibold ${cpe.isKnown ? 'text-slate-700' : 'text-slate-300 italic text-[10px]'}`}>
          {cpe.hostname || 'Sin nombre'}
        </p>
      </div>
      <div className="px-2 py-2 text-right">
        <span className={`font-mono font-bold ${sigColor(cpe.signal)}`}>{fmtDbm(cpe.signal)}</span>
      </div>
      <div className="px-2 py-2 text-right">
        <span className={`font-mono ${sigColor(cpe.rssi)}`}>{fmtDbm(cpe.rssi)}</span>
      </div>
      <div className="px-2 py-2 text-right font-mono text-slate-500">{fmtDbm(cpe.noisefloor)}</div>
      <div className="px-2 py-2 text-right font-mono text-slate-600">
        {cpe.cinr != null ? `${cpe.cinr} dB` : snr != null ? `${snr} dB` : '—'}
      </div>
      <div className="px-2 py-2 text-right">
        <span className={`font-mono font-bold ${ccqColor(cpe.ccq)}`}>{fmtPct(cpe.ccq)}</span>
      </div>
      <div className="px-2 py-2 text-right font-mono text-slate-600 text-[10px]">{linkPotential}</div>
      <div className="px-2 py-2 text-right font-mono text-sky-700 font-semibold">{fmtRate(cpe.tx_rate)}</div>
      <div className="px-2 py-2 text-right font-mono text-indigo-700 font-semibold">{fmtRate(cpe.rx_rate)}</div>
      <div className="px-2 py-2 text-right font-mono text-amber-600">{fmtPct(cpe.airtime_tx)}</div>
      <div className="px-2 py-2 text-right font-mono text-amber-600">{fmtPct(cpe.airtime_rx)}</div>
      <div className="px-2 py-2 text-right font-mono text-emerald-700 font-semibold">{fmtKbps(cpe.throughputRxKbps)}</div>
      <div className="px-2 py-2 text-right font-mono text-rose-600 font-semibold">{fmtKbps(cpe.throughputTxKbps)}</div>
      <div className="px-2 py-2 font-mono text-slate-400 text-[10px] truncate">{cpe.uptimeStr || '—'}</div>
      <div className="px-2 py-2 text-right font-mono text-slate-500">
        {cpe.distance != null ? `${cpe.distance} km` : '—'}
      </div>
      <div className="px-2 py-2 flex items-center justify-end gap-0.5">
        <button onClick={() => onDetail(cpe.mac, cpe.lastip || null)} title="Ver detalle del CPE"
          className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
          <Eye className="w-3.5 h-3.5" />
        </button>
        {cpe.lastip && (
          <a href={`http://${cpe.lastip}`} target="_blank" rel="noopener noreferrer"
            title={`Abrir ${cpe.lastip}`}
            className="p-1.5 text-sky-500 hover:bg-sky-50 rounded-lg transition-colors flex items-center">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Station Table ─────────────────────────────────────────────────────────
const CPE_COLS = ['28px','130px','110px','140px','72px','72px','72px','64px','64px','60px','60px','62px','62px','76px','76px','100px','66px','110px','72px'];
const CPE_MIN_W = CPE_COLS.reduce((a, c) => a + parseInt(c), 0);
const CPE_HEADERS = ['Estado','MAC / Nombre','Modelo','Nombre Dispositivo','Señal','Remote Sig.','Noise','CINR','CCQ','Link Pot.','↓ Cap.','↑ Cap.','Air TX','Air RX','Thr RX','Thr TX','Uptime','Distancia','Acciones'];

function StationTable({ apId, poll, onCpeDetail }: {
  apId: string; poll: PollResult;
  onCpeDetail: (mac: string, ip: string | null) => void;
}) {
  return (
    <div className="border-t border-indigo-100 bg-gradient-to-r from-indigo-50/40 to-slate-50/20">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          {poll.loading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            Station List · {poll.stations.length} CPE{poll.stations.length !== 1 ? 's' : ''}
          </span>
          {poll.error && <span className="text-[9px] text-rose-500 font-medium">{poll.error}</span>}
        </div>
        {poll.polledAt > 0 && (
          <span className="text-[9px] text-slate-300 font-mono">
            {new Date(poll.polledAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {poll.stations.length === 0 && !poll.loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
          <ZapOff className="w-4 h-4" />
          <span className="text-xs">{poll.error ? 'Error en poll SSH' : 'Sin CPEs conectados'}</span>
        </div>
      )}

      {poll.stations.length > 0 && (
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${CPE_MIN_W}px` }}>
            <div className="grid bg-slate-100/80 border-b border-slate-200 text-[8px] font-bold text-slate-400 uppercase tracking-wider"
              style={{ gridTemplateColumns: CPE_COLS.join(' ') }}>
              {CPE_HEADERS.map((h, i) => (
                <div key={i} className={`px-2 py-1.5 ${i >= 4 && i <= 17 ? 'text-right' : ''}`}>{h}</div>
              ))}
            </div>
            {poll.stations.map((cpe, idx) => (
              <CpeRow key={cpe.mac} cpe={cpe} idx={idx} onDetail={onCpeDetail} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AP Row (from SavedDevice) ─────────────────────────────────────────────
function ApRow({ dev, pollResult, expanded, onToggle, onKnownCpes, onCpeDetail }: {
  dev: SavedDevice;
  pollResult?: PollResult;
  expanded: boolean;
  onToggle: () => void;
  onKnownCpes: () => void;
  onCpeDetail: (mac: string, ip: string | null) => void;
}) {
  const name     = dev.cachedStats?.deviceName ?? dev.deviceName ?? dev.name;
  const ssid     = dev.cachedStats?.essid ?? dev.essid;
  const freq     = dev.cachedStats?.frequency ?? dev.frequency;
  const freqGhz  = freq ? `${(freq / 1000).toFixed(1)} GHz` : null;
  const model    = dev.cachedStats?.deviceModel ?? dev.model;
  const firmware = dev.cachedStats?.firmwareVersion ?? dev.firmware;
  const noSsh    = !dev.sshUser || !dev.sshPass;
  const isPolling = pollResult?.loading ?? false;
  const cpeCount  = pollResult?.stations.length ?? null;

  return (
    <Fragment>
      <div className="grid items-center px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors"
        style={{ gridTemplateColumns: '72px minmax(0,1fr) 140px minmax(0,1fr) auto' }}>
        {/* Modo / Frec */}
        <div>
          <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">AP</span>
          {freqGhz && <p className="text-[9px] font-bold text-sky-600 mt-0.5">{freqGhz}</p>}
        </div>
        {/* Nombre / MAC */}
        <div className="min-w-0 pr-3">
          <p className="text-sm font-semibold text-slate-800 truncate" title={name || dev.ip}>{name || dev.ip}</p>
          <p className="font-mono text-[9px] text-slate-400 truncate">{dev.mac}</p>
        </div>
        {/* IP / Modelo */}
        <div className="min-w-0 pr-3">
          <p className="font-mono text-xs text-slate-600">{dev.ip}</p>
          {model && <p className="text-[9px] text-slate-400 truncate">{model}</p>}
        </div>
        {/* SSID / Firmware */}
        <div className="min-w-0 pr-3">
          {ssid
            ? <p className="font-mono text-xs text-slate-700 truncate" title={ssid}>{ssid}</p>
            : <span className="text-[10px] text-slate-300">—</span>}
          {firmware && <p className="text-[9px] text-slate-400">{fmtFw(firmware)}</p>}
        </div>
        {/* Acciones */}
        <div className="flex items-center gap-0.5">
          {noSsh ? (
            <span className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200">
              <WifiOff className="w-3 h-3" /><span>Sin SSH</span>
            </span>
          ) : (
            <button onClick={onToggle}
              title={expanded ? 'Ocultar CPEs' : 'Ver CPEs en tiempo real'}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all
                ${expanded
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'}`}>
              {isPolling
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>{cpeCount != null ? `${cpeCount} CPE${cpeCount !== 1 ? 's' : ''}` : 'CPEs'}</span>
            </button>
          )}
          <a href={`http://${dev.ip}`} target="_blank" rel="noopener noreferrer"
            title={`Abrir ${dev.ip}`}
            className="p-1.5 text-sky-500 hover:bg-sky-50 rounded-lg transition-colors flex items-center">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={onKnownCpes} title="Ver CPEs conocidos (guardados)"
            className="p-1.5 text-violet-500 hover:bg-violet-50 rounded-lg transition-colors">
            <Database className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && pollResult && (
        <StationTable apId={dev.id} poll={pollResult} onCpeDetail={onCpeDetail} />
      )}
    </Fragment>
  );
}

// ── Node Card ─────────────────────────────────────────────────────────────
function NodeCard({ group, expandedAps, pollResults, onToggleAp, onKnownCpes, onCpeDetail }: {
  group: NodeGroup;
  expandedAps: Set<string>;
  pollResults: Record<string, PollResult>;
  onToggleAp: (apId: string) => void;
  onKnownCpes: (apId: string) => void;
  onCpeDetail: (mac: string, ip: string | null, dev: SavedDevice) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const anyPolled   = group.aps.some(ap => (pollResults[ap.id]?.polledAt ?? 0) > 0);
  const anyError    = group.aps.some(ap => !!pollResults[ap.id]?.error);
  const statusColor = group.aps.length === 0 ? 'bg-slate-300' : anyPolled && !anyError ? 'bg-emerald-500' : anyError ? 'bg-amber-400' : 'bg-slate-300';
  const statusLabel = group.aps.length === 0 ? 'Sin APs' : anyPolled && !anyError ? 'Online' : anyError ? 'Parcial' : 'Inactivo';
  const totalCpes   = group.aps.reduce((s, ap) => s + (pollResults[ap.id]?.stations.length ?? 0), 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-100">
        <button onClick={() => setExpanded(e => !e)}
          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Radio className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="font-bold text-slate-800">{group.nodeName}</span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className={`w-2 h-2 rounded-full ${statusColor}`} />
            <span className="text-[10px] font-bold text-slate-500">{statusLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1"><Server className="w-3 h-3" /> {group.aps.length} AP{group.aps.length !== 1 ? 's' : ''}</span>
          {totalCpes > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3 text-violet-500" /> {totalCpes} CPEs</span>}
        </div>
      </div>

      {expanded && (
        <>
          {group.aps.length === 0 && (
            <div className="flex flex-col items-center py-10 gap-3 text-slate-400">
              <Wifi className="w-8 h-8" />
              <p className="text-sm">No hay APs con rol "ap" en este nodo</p>
            </div>
          )}
          {group.aps.length > 0 && (
            <>
              <div className="grid bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-400 uppercase tracking-wider px-4 py-2"
                style={{ gridTemplateColumns: '72px minmax(0,1fr) 140px minmax(0,1fr) auto' }}>
                <span>Modo</span>
                <span>Nombre / MAC</span>
                <span>IP / Modelo</span>
                <span>SSID / Firmware</span>
                <span className="text-right">Acciones</span>
              </div>
              {group.aps.map(dev => (
                <ApRow
                  key={dev.id}
                  dev={dev}
                  pollResult={pollResults[dev.id]}
                  expanded={expandedAps.has(dev.id)}
                  onToggle={() => onToggleAp(dev.id)}
                  onKnownCpes={() => onKnownCpes(dev.id)}
                  onCpeDetail={(mac, ip) => onCpeDetail(mac, ip, dev)}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Module ───────────────────────────────────────────────────────────
export default function ApMonitorModule() {
  const [devices,      setDevices]      = useState<SavedDevice[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [expandedAps,  setExpandedAps]  = useState<Set<string>>(new Set());
  const [pollResults,  setPollResults]  = useState<Record<string, PollResult>>({});
  const [toast,        setToast]        = useState('');

  // Modals
  const [cpeDetailTarget, setCpeDetailTarget] = useState<{
    mac: string; apId: string; ip: string | null;
    sshPort: number; sshUser: string; sshPass: string;
  } | null>(null);
  const [knownCpesApId, setKnownCpesApId] = useState<string | null>(null);

  const pollTimers     = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const expandedApsRef = useRef(expandedAps);
  const devicesRef     = useRef(devices);
  const toastTimer     = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { expandedApsRef.current = expandedAps; }, [expandedAps]);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };

  // Derive node groups from devices (only role==='ap')
  const nodeGroups: NodeGroup[] = useMemo(() => {
    const apDevices = devices.filter(d => d.role === 'ap');
    const map = new Map<string, NodeGroup>();
    for (const d of apDevices) {
      if (!map.has(d.nodeId)) map.set(d.nodeId, { nodeId: d.nodeId, nodeName: d.nodeName, aps: [] });
      map.get(d.nodeId)!.aps.push(d);
    }
    return [...map.values()];
  }, [devices]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const devs = await deviceDb.load();
      setDevices(devs);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // Poll a single AP using its SavedDevice SSH credentials
  const pollApDirect = useCallback(async (apId: string) => {
    const dev = devicesRef.current.find(d => d.id === apId);
    if (!dev) return;

    setPollResults(prev => ({
      ...prev,
      [apId]: { ...(prev[apId] ?? { stations: [] }), loading: true, polledAt: prev[apId]?.polledAt ?? 0 },
    }));

    try {
      const res  = await fetchWithTimeout(`${BASE}/poll-direct`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apId,
          ip:   dev.ip,
          port: dev.sshPort ?? 22,
          user: dev.sshUser ?? '',
          pass: dev.sshPass ?? '',
          saveHistory: false,
        }),
      }, 20_000);
      const data = await res.json();
      if (data.success) {
        setPollResults(prev => ({ ...prev, [apId]: { stations: data.stations, polledAt: data.polledAt, loading: false } }));
      } else {
        setPollResults(prev => ({ ...prev, [apId]: { ...(prev[apId] ?? { stations: [] }), loading: false, error: data.message } }));
      }
    } catch (e) {
      setPollResults(prev => ({
        ...prev,
        [apId]: { ...(prev[apId] ?? { stations: [] }), loading: false, error: e instanceof Error ? e.message : 'Error SSH' },
      }));
    }

    // Schedule next poll only if still expanded
    if (expandedApsRef.current.has(apId)) {
      pollTimers.current[apId] = setTimeout(() => pollApDirect(apId), POLL_MS);
    } else {
      delete pollTimers.current[apId];
    }
  }, []); // stable

  // Start/stop polling when expandedAps changes
  useEffect(() => {
    expandedAps.forEach(apId => {
      if (!pollTimers.current[apId]) pollApDirect(apId);
    });
    Object.keys(pollTimers.current).forEach(apId => {
      if (!expandedAps.has(apId)) { clearTimeout(pollTimers.current[apId]); delete pollTimers.current[apId]; }
    });
  }, [expandedAps, pollApDirect]);

  // Cleanup on unmount
  useEffect(() => () => { Object.values(pollTimers.current).forEach(clearTimeout); }, []);

  const toggleAp = (apId: string) => {
    setExpandedAps(prev => {
      const next = new Set(prev);
      if (next.has(apId)) next.delete(apId); else next.add(apId);
      return next;
    });
  };

  const totalAps  = nodeGroups.reduce((s, g) => s + g.aps.length, 0);
  const totalCpes = Object.values(pollResults).reduce((s, r) => s + r.stations.length, 0);

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="card p-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            <span>Monitor de APs</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Monitoreo en tiempo real — APs guardados en Equipos, agrupados por nodo
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm text-slate-500">
            <span className="font-bold text-indigo-600">{nodeGroups.length}</span> nodos ·{' '}
            <span className="font-bold text-indigo-600">{totalAps}</span> APs ·{' '}
            <span className="font-bold text-violet-600">{totalCpes}</span> CPEs live
          </div>
          <button onClick={loadDevices} disabled={loading}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors disabled:opacity-50"
            title="Recargar lista de equipos">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Online</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Parcial / Errores</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Sin datos</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Poll cada 30s</span>
        <span className="flex items-center gap-1"><Database className="w-3 h-3" /> CPEs conocidos (guardados)</span>
        <span className="flex items-center gap-1"><Signal className="w-3 h-3" /> Datos live (solo pantalla)</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      )}

      {/* Empty */}
      {!loading && nodeGroups.length === 0 && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Radio className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <p className="text-slate-500 font-medium">Sin APs guardados</p>
            <p className="text-slate-400 text-sm mt-1">
              Ve a la pestaña <strong>Equipos</strong>, agrega dispositivos con rol "AP" y vuelve aquí para monitorearlos.
            </p>
          </div>
        </div>
      )}

      {/* Node groups */}
      {!loading && nodeGroups.map(group => (
        <NodeCard
          key={group.nodeId}
          group={group}
          expandedAps={expandedAps}
          pollResults={pollResults}
          onToggleAp={toggleAp}
          onKnownCpes={apId => setKnownCpesApId(apId)}
          onCpeDetail={(mac, ip, dev) => setCpeDetailTarget({
            mac, apId: dev.id, ip,
            sshPort: dev.sshPort ?? 22,
            sshUser: dev.sshUser ?? '',
            sshPass: dev.sshPass ?? '',
          })}
        />
      ))}

      {/* Modals */}
      {cpeDetailTarget && (
        <CpeDetailModal
          mac={cpeDetailTarget.mac}
          apId={cpeDetailTarget.apId}
          cpeIp={cpeDetailTarget.ip}
          sshPort={cpeDetailTarget.sshPort}
          sshUser={cpeDetailTarget.sshUser}
          sshPass={cpeDetailTarget.sshPass}
          onClose={() => setCpeDetailTarget(null)}
        />
      )}

      {knownCpesApId && (
        <KnownCpesModal apId={knownCpesApId} onClose={() => setKnownCpesApId(null)} />
      )}
    </div>
  );
}
