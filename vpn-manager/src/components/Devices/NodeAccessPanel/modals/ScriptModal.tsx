import { useState, useEffect, useRef } from 'react';
import { X, FileCode, Eye, EyeOff, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useVpn } from '../../../../context';
import { apiFetch } from '../../../../utils/apiClient';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';

export default function ScriptModal({ node, onClose }: { node: NodeInfo; onClose: () => void }) {
  const { credentials } = useVpn();
  const [serverIP, setServerIP] = useState(() => localStorage.getItem('server_public_ip') || localStorage.getItem('wg_endpoint_ip') || credentials?.ip || '');
  const [pppPass, setPppPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [script, setScript] = useState('');
  const [cpeSteps, setCpeSteps] = useState<{title: string, cmd: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loadingPass, setLoadingPass] = useState(true);

  useEffect(() => {
    if (!node.ppp_user) { setLoadingPass(false); return; }
    fetchWithTimeout(`${API_BASE_URL}/api/node/creds/get`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pppUser: node.ppp_user }),
    }, 5_000)
      .then(r => r.json())
      .then(d => { if (d.success && d.pppPassword) setPppPass(d.pppPassword); })
      .catch(() => { })
      .finally(() => setLoadingPass(false));
  }, [node.ppp_user]);

  const isWG = node.ppp_user?.startsWith('WG-ND') || node.ppp_user?.startsWith('VPN-WG-');
  const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
  const canGenerate = IPV4_RE.test(serverIP.trim()) && (isWG || !!pppPass.trim());

  const autoGenRun = useRef(false);

  useEffect(() => {
    if (canGenerate && !loadingPass && !autoGenRun.current) {
      autoGenRun.current = true;
      handleGenerate();
    }
  }, [canGenerate, loadingPass]);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setScript('');
    setCpeSteps([]);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pppUser: node.ppp_user,
          pppPassword: pppPass,
          serverPublicIP: serverIP.trim(),
        }),
      }, 10_000);
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Error al generar');
      setScript(d.script);
      setCpeSteps(d.cpeSteps || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-emerald-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <FileCode className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Script de Configuración</p>
              <p className="text-[10px] text-emerald-200 mt-0.5">{node.nombre_nodo} — {node.ppp_user}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-emerald-300 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {[
              { l: 'Nodo', v: node.nombre_nodo },
              { l: 'Usuario PPP', v: node.ppp_user },
              { l: 'IP Túnel', v: node.ip_tunnel || '—' },
              { l: 'VRF', v: node.nombre_vrf || '—' },
            ].map(row => (
              <div key={row.l} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{row.l}</p>
                <p className="font-mono font-bold text-slate-600 truncate">{row.v}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                IP pública del servidor VPN <span className="text-rose-500">*</span>
              </label>
              <input value={serverIP} onChange={e => {
                setServerIP(e.target.value);
                localStorage.setItem('server_public_ip', e.target.value.trim());
                apiFetch(`${API_BASE_URL}/api/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'server_public_ip', value: e.target.value.trim() }) }).catch(() => { });
              }}
                placeholder="Ej: 213.173.36.232"
                className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 font-mono
                  ${serverIP && !IPV4_RE.test(serverIP.trim()) ? 'border-rose-300 focus:ring-rose-300' : 'border-slate-200 focus:ring-emerald-300'}`} />
            </div>
            {isWG ? null : (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                Contraseña PPP <span className="text-rose-500">*</span>
                {loadingPass && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                {!loadingPass && pppPass && <span className="text-[10px] font-normal text-emerald-600">(recuperada automáticamente)</span>}
              </label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={pppPass} onChange={e => setPppPass(e.target.value)}
                  placeholder={loadingPass ? 'Cargando…' : 'Contraseña del túnel SSTP'}
                  className="w-full px-3 py-2 pr-10 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                <button onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {cpeSteps.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pasos a configurar en el router torre (CPE)</p>
                <button onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'}`}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '¡Copiado!' : 'Copiar Todo'}</span>
                </button>
              </div>
              <div className="space-y-2">
                {cpeSteps.map((step, idx) => (
                  <div key={idx} className="bg-slate-900 rounded-xl overflow-hidden">
                    <div className="bg-slate-800/80 px-3 py-2 border-b border-white/5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Paso {idx + 1}: <span className="text-emerald-300">{step.title}</span>
                      </span>
                    </div>
                    <div className="p-3 text-[11px] font-mono text-emerald-400 break-all whitespace-pre-wrap leading-relaxed">
                      {step.cmd}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : script ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Script generado</p>
                <button onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'}`}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="bg-slate-900 rounded-xl p-4 text-[11px] text-emerald-400 font-mono overflow-x-auto whitespace-pre max-h-64 overflow-y-auto">
                {script}
              </pre>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
            Cerrar
          </button>
          <button onClick={handleGenerate} disabled={!canGenerate || loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white
              hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-500/25">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
            <span>{loading ? 'Generando...' : script ? 'Regenerar' : 'Generar Script'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
