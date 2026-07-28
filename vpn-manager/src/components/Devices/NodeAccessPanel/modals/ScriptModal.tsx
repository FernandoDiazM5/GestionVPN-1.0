import { useState, useEffect, useRef } from 'react';
import { FileCode, Eye, EyeOff, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useVpn } from '../../../../context';
import { apiFetch } from '../../../../utils/apiClient';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';
import Dialog from '../../../Common/Dialog';
import SiteModalHeader from '../../../Common/SiteModalHeader';

export default function ScriptModal({ node, onClose }: { node: NodeInfo; onClose: () => void }) {
  const { credentials } = useVpn();
  const [serverIP, setServerIP] = useState(() => localStorage.getItem('server_public_ip') || localStorage.getItem('wg_endpoint_ip') || credentials?.ip || '');
  const [pppPass, setPppPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [script, setScript] = useState('');
  const [cpeSteps, setCpeSteps] = useState<{title: string, cmd: string}[]>([]);
  const [keyMode, setKeyMode] = useState<'generated' | 'manual' | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loadingPass, setLoadingPass] = useState(true);

  // Cargar la IP pública del setting GLOBAL (server_public_ip) — fuente única.
  // Así el script se auto-genera sin pedirla: el dato ya existe en el sistema.
  useEffect(() => {
    apiFetch(`${API_BASE_URL}/api/settings/get`)
      .then(r => r.json())
      .then(d => {
        const ip = d?.settings?.server_public_ip;
        if (ip) { setServerIP(ip); localStorage.setItem('server_public_ip', ip); }
      })
      .catch(() => { });
  }, []);

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
    // La generación debe ejecutarse una sola vez; handleGenerate cambia al editar campos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setKeyMode(d.keyMode || '');
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
    <Dialog
      title={`Configuración del sitio ${node.nombre_nodo}`}
      onClose={onClose}
      panelClassName="modal-panel modal-panel-xl"
    >
        <SiteModalHeader
          icon={FileCode}
          title="Configuración del sitio"
          siteName={node.nombre_nodo}
          description="Instrucciones para conectar este sitio"
          onClose={onClose}
        />

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 text-2xs">
            {[
              { l: 'Sitio', v: node.nombre_nodo },
              { l: 'Usuario de conexión', v: node.ppp_user },
              { l: 'Dirección de conexión', v: node.ip_tunnel || '—' },
              { l: 'Ruta asignada', v: node.nombre_vrf || '—' },
            ].map(row => (
              <div key={row.l} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
                <p className="text-3xs font-bold text-slate-400 uppercase tracking-wider">{row.l}</p>
                <p className="font-mono font-bold text-slate-600 dark:text-slate-300 truncate">{row.v}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                IP pública del servidor VPN <span className="text-rose-500">*</span>
              </label>
              <input
                value={serverIP}
                readOnly
                aria-readonly="true"
                placeholder="Configúrala desde el panel Administrador"
                className={`w-full cursor-not-allowed rounded-xl border bg-slate-100 px-3 py-2 font-mono text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300
                  ${serverIP && !IPV4_RE.test(serverIP.trim()) ? 'border-rose-300' : 'border-slate-200 dark:border-slate-700'}`}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Valor global de solo lectura, administrado por la plataforma.
              </p>
            </div>
            {isWG ? null : (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                Contraseña de conexión <span className="text-rose-500">*</span>
                {loadingPass && <Loader2 className="w-3 h-3 animate-spin text-slate-500 dark:text-slate-400" />}
                {!loadingPass && pppPass && <span className="text-2xs font-normal text-emerald-600">(recuperada automáticamente)</span>}
              </label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={pppPass} onChange={e => setPppPass(e.target.value)}
                  placeholder={loadingPass ? 'Cargando…' : 'Contraseña de conexión'}
                  className="w-full px-3 py-2 pr-10 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                <button onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {cpeSteps.length > 0 ? (
            <div className="space-y-3">
              {isWG && keyMode === 'generated' && (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 rounded-lg">
                  <p className="text-2xs font-semibold text-amber-700">
                    Esta configuración incluye una llave privada del sitio. Trátala como una contraseña y no la compartas.
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-2xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pasos para conectar el sitio</p>
                <button onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:bg-emerald-500/10 hover:text-emerald-700'}`}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '¡Copiado!' : 'Copiar instrucciones'}</span>
                </button>
              </div>
              <div className="space-y-2">
                {cpeSteps.map((step, idx) => (
                  <div key={idx} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                    <div className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                      <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Paso {idx + 1}: <span className="text-indigo-600 dark:text-indigo-300">{step.title}</span>
                      </span>
                    </div>
                    <div className="break-all whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {step.cmd}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : script ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-2xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Configuración generada</p>
                <button onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:bg-emerald-500/10 hover:text-emerald-700'}`}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                {script}
              </pre>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
          <button onClick={onClose} className="btn-ghost btn-md">
            Cerrar
          </button>
          <button onClick={handleGenerate} disabled={!canGenerate || loading}
            className="btn-primary btn-md flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
            <span>{loading ? 'Generando...' : script ? 'Generar nuevamente' : 'Generar configuración'}</span>
          </button>
        </div>
    </Dialog>
  );
}
