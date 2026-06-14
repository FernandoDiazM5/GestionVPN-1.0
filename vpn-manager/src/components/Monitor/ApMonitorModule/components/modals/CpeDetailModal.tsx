import { useState, useEffect } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import type { CpeDetail } from '../../../../../types/apMonitor';
import { fetchWithTimeout } from '../../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../../config';
import { fmtDbm, fmtPct, fmtMbps, fmtFw } from '../../utils/formatters';
import { sigColor, ccqColor } from '../../utils/colors';

const BASE = `${API_BASE_URL}/api/ap-monitor`;

function CpeDetailModal({
  mac, apId, cpeIp, sshPort, sshUser, sshPass, onClose,
}: {
  mac: string; apId: string; cpeIp: string | null;
  sshPort: number; sshUser: string; sshPass: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CpeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCredForm, setShowCredForm] = useState(false);
  const [credUser, setCredUser] = useState('ubnt');
  const [credPass, setCredPass] = useState('');
  const [credPort, setCredPort] = useState(String(sshPort ?? 22));
  const [savingCreds, setSavingCreds] = useState(false);

  const isAuthError = (msg: string) =>
    /authentication|auth.*failed|configured.*method|credencial/i.test(msg);

  const fetchDetail = (overrideUser?: string, overridePass?: string, overridePort?: string) => {
    if (!cpeIp) { setError('IP del CPE no disponible — esperando próximo poll'); return; }
    setLoading(true);
    setError('');
    setDetail(null);
    fetchWithTimeout(`${BASE}/cpes/${mac}/detail-direct`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpe_ip: cpeIp,
        port: parseInt(overridePort ?? credPort) || sshPort,
        user: overrideUser ?? sshUser,
        pass: overridePass ?? sshPass,
        apId,
      }),
    }, 25_000)
      .then(r => r.json())
      .then(d => {
        if (d.success) { setDetail(d.stats); setShowCredForm(false); }
        else {
          setError(d.message);
          if (isAuthError(d.message)) setShowCredForm(true);
        }
      })
      .catch(e => { setError(e.message); if (isAuthError(e.message)) setShowCredForm(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchDetail(), 0);
    return () => clearTimeout(timer);
  }, []);

  const handleCredSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!credUser) return;
    setSavingCreds(true);
    try {
      await fetchWithTimeout(`${BASE}/cpes/${mac}/credentials`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: credUser, pass: credPass, port: parseInt(credPort) || 22 }),
      }, 5_000);
    } catch { /* non-fatal */ }
    setSavingCreds(false);
    fetchDetail(credUser, credPass, credPort);
  };

  const rows: Array<{ l: string; v: string | null | undefined; mono?: boolean; color?: string }> = detail ? [
    { l: 'Hostname', v: detail.deviceName },
    { l: 'Modelo', v: detail.deviceModel },
    { l: 'Firmware', v: fmtFw(detail.firmwareVersion) },
    { l: 'IP LAN', v: detail.ip, mono: true },
    { l: 'Modo', v: detail.mode },
    { l: 'Modo Red', v: detail.networkMode },
    { l: 'SSID AP', v: detail.essid },
    { l: 'Señal', v: fmtDbm(detail.signal), color: sigColor(detail.signal), mono: true },
    { l: 'Noise', v: fmtDbm(detail.noiseFloor), mono: true },
    { l: 'CCQ', v: fmtPct(detail.ccq), color: ccqColor(detail.ccq), mono: true },
    { l: 'TX Rate', v: fmtMbps(detail.txRate), mono: true },
    { l: 'RX Rate', v: fmtMbps(detail.rxRate), mono: true },
    { l: 'TX Power', v: detail.txPower != null ? `${detail.txPower} dBm` : null, mono: true },
    { l: 'Canal', v: detail.channelWidth != null ? `${detail.channelWidth} MHz` : null, mono: true },
    { l: 'Frecuencia', v: detail.frequency != null ? `${detail.frequency} MHz` : null, mono: true },
    { l: 'WLAN MAC', v: detail.wlanMac, mono: true },
    { l: 'LAN MAC', v: detail.lanMac, mono: true },
    { l: 'AP MAC', v: detail.apMac, mono: true },
    { l: 'Seguridad', v: detail.security },
    { l: 'Uptime', v: detail.uptimeStr, mono: true },
  ].filter(r => r.v) as typeof rows : [];

  return (
    <div className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel modal-panel-lg">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-5 py-3 shrink-0">
          <div>
            <p className="text-xs font-bold text-white font-mono">{mac}</p>
            <p className="text-2xs text-slate-400 mt-0.5">{cpeIp || 'IP desconocida'} · Detalle CPE</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Conectando SSH al CPE…</span>
            </div>
          )}
          {error && !loading && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl dark:bg-rose-500/10 dark:border-rose-500/30">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>
            </div>
          )}
          {showCredForm && !loading && (
            <form onSubmit={handleCredSubmit} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3 dark:bg-amber-500/10 dark:border-amber-500/30">
              <p className="text-xs font-semibold text-amber-800">Credenciales SSH del CPE</p>
              <p className="text-2xs text-amber-600">
                Las credenciales del CPE son independientes de las del AP.
                Los equipos Ubiquiti usan por defecto <span className="font-mono">ubnt / ubnt</span>.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-2xs font-semibold text-slate-500 mb-1">Usuario</label>
                  <input
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={credUser} onChange={e => setCredUser(e.target.value)}
                    placeholder="ubnt" autoComplete="off"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-2xs font-semibold text-slate-500 mb-1">Contrasena</label>
                  <input type="password"
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={credPass} onChange={e => setCredPass(e.target.value)}
                    placeholder="ubnt" autoComplete="current-password"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-2xs font-semibold text-slate-500 mb-1">Puerto SSH</label>
                  <input type="number"
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={credPort} onChange={e => setCredPort(e.target.value)}
                    placeholder="22" min={1} max={65535}
                  />
                </div>
              </div>
              <button type="submit" disabled={savingCreds || !credUser}
                className="btn-warning btn-sm w-full flex items-center justify-center gap-2">
                {savingCreds ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Conectar y guardar credenciales
              </button>
            </form>
          )}
          {detail && !loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {rows.map(row => (
                <div key={row.l} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 shadow-sm hover:shadow-md transition-shadow dark:bg-slate-800/60 dark:border-slate-700">
                  <p className="text-2xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{row.l}</p>
                  <p className={`text-sm font-bold truncate ${row.color ?? 'text-slate-800'} ${row.mono ? 'font-mono tracking-tight' : ''}`}>{row.v}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CpeDetailModal;
