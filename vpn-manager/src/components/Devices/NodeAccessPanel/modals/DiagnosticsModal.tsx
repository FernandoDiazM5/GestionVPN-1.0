// ============================================================
//  DiagnosticsModal — ping y traceroute desde el router (Q3)
//
//  Se abre desde el kebab del NodeCard. Target precargado con la
//  ip_tunnel del nodo (la 'punta remota' del túnel SSTP/WG), pero
//  editable: el operador suele querer probar una IP de CPE específica.
//
//  El backend ejecuta el comando EN EL ROUTER, no en el frontend, así
//  el path de red coincide con el real.
// ============================================================
import { useState } from 'react';
import { Wifi, Network, Loader2, Play, AlertCircle, Check } from 'lucide-react';
import { diagnosticsApi } from '../../../../services/diagnosticsApi';
import Dialog from '../../../Common/Dialog';
import SiteModalHeader from '../../../Common/SiteModalHeader';
import type {
  DiagnosticsPingResponse,
  DiagnosticsTraceResponse,
} from '@gestionvpn/contracts';

interface DiagnosticsModalProps {
  initialTarget: string;
  nodeName?: string;
  onClose: () => void;
}

type Tab = 'ping' | 'trace';

export default function DiagnosticsModal({ initialTarget, nodeName, onClose }: DiagnosticsModalProps) {
  const [tab, setTab] = useState<Tab>('ping');
  const [target, setTarget] = useState(initialTarget);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<DiagnosticsPingResponse | null>(null);
  const [traceResult, setTraceResult] = useState<DiagnosticsTraceResponse | null>(null);

  async function runPing() {
    setBusy(true); setErr(null); setPingResult(null);
    try {
      const r = await diagnosticsApi.ping({ target: target.trim() });
      setPingResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error ejecutando ping');
    } finally { setBusy(false); }
  }

  async function runTrace() {
    setBusy(true); setErr(null); setTraceResult(null);
    try {
      const r = await diagnosticsApi.traceroute({ target: target.trim() });
      setTraceResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error ejecutando traceroute');
    } finally { setBusy(false); }
  }

  function execute() {
    if (!target.trim()) return;
    if (tab === 'ping') void runPing();
    else void runTrace();
  }

  return (
    <Dialog
      title={`Comprobar conexión${nodeName ? ` de ${nodeName}` : ''}`}
      onClose={onClose}
      panelClassName="modal-panel modal-panel-2xl"
    >
        <SiteModalHeader
          icon={Network}
          title="Comprobar conexión"
          siteName={nodeName || 'Sitio remoto'}
          description="Verifica si el sitio responde"
          onClose={onClose}
        />

        {/* Tabs */}
        <div className="border-b border-slate-100 dark:border-slate-800 px-3 flex gap-1">
          <SubTab active={tab === 'ping'} onClick={() => setTab('ping')} icon={Wifi} label="Respuesta" />
          <SubTab active={tab === 'trace'} onClick={() => setTab('trace')} icon={Network} label="Recorrido de red" />
        </div>

        {/* Target input + Run */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Dirección que deseas comprobar</label>
            <input
              type="text"
              value={target}
              onChange={e => setTarget(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') execute(); }}
              disabled={busy}
              placeholder="IP o hostname"
              className="input-field font-mono text-xs w-full"
            />
          </div>
          <button onClick={execute} disabled={busy || !target.trim()} className="btn-primary btn-sm inline-flex items-center">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {busy ? 'Comprobando…' : 'Iniciar comprobación'}
          </button>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {err && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-500/10 p-3 flex items-start gap-2 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {!err && !pingResult && !traceResult && !busy && (
            <div className="text-center py-10 text-slate-500 dark:text-slate-400">
              <Play className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Inicia la comprobación para verificar si el sitio responde.</p>
              <p className="text-xs mt-1">La prueba se realiza de forma segura desde el servidor de conexión.</p>
            </div>
          )}

          {tab === 'ping' && pingResult && <PingResults data={pingResult} />}
          {tab === 'trace' && traceResult && <TraceResults data={traceResult} />}
        </div>
    </Dialog>
  );
}

function SubTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Wifi; label: string }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors
        ${active
          ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function PingResults({ data }: { data: DiagnosticsPingResponse }) {
  const { summary, rows } = data;
  const lossOk = summary.lossPct === 0;
  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Enviados" value={String(summary.sent)} />
        <Stat label="Recibidos" value={String(summary.received)} good={lossOk} />
        <Stat label="Pérdida" value={`${summary.lossPct}%`} bad={summary.lossPct > 0} />
        <Stat label="RTT prom." value={summary.avgMs != null ? `${summary.avgMs} ms` : '—'} />
      </div>

      {/* Tabla por seq */}
      <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/40">
            <tr>
              <th className="th-cell">#</th>
              <th className="th-cell">Host</th>
              <th className="th-cell">Tiempo</th>
              <th className="th-cell">TTL</th>
              <th className="th-cell">Tamaño</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="data-cell">{r.seq}</td>
                <td className="data-cell">{r.host || '—'}</td>
                <td className="data-cell">{r.status === 'timeout' ? <span className="text-rose-500">timeout</span> : r.time || '—'}</td>
                <td className="data-cell">{r.ttl ?? '—'}</td>
                <td className="data-cell">{r.size ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TraceResults({ data }: { data: DiagnosticsTraceResponse }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{data.hops.length} hops hasta <code className="font-mono">{data.target}</code></p>
      <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/40">
            <tr>
              <th className="th-cell">Hop</th>
              <th className="th-cell">Dirección</th>
              <th className="th-cell">RTT</th>
              <th className="th-cell">Pérdida</th>
            </tr>
          </thead>
          <tbody>
            {data.hops.map(h => (
              <tr key={h.hop} className="border-t border-slate-100 dark:border-slate-800">
                <td className="data-cell">{h.hop}</td>
                <td className="data-cell">{h.address || <span className="text-slate-500 dark:text-slate-400">* * *</span>}</td>
                <td className="data-cell">{h.rttMs != null ? `${h.rttMs} ms` : <span className="text-rose-500">timeout</span>}</td>
                <td className="data-cell">{h.lossPct != null ? `${h.lossPct}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  const cls = bad
    ? 'border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-500/10 text-rose-700'
    : good
      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-500/10 text-emerald-700'
      : 'border-slate-100 dark:border-slate-800';
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <p className="text-2xs uppercase tracking-wide font-semibold opacity-70">{label}</p>
      <p className="font-mono text-base font-bold mt-0.5 flex items-center gap-1">
        {good && <Check className="w-3.5 h-3.5" />}
        {value}
      </p>
    </div>
  );
}
