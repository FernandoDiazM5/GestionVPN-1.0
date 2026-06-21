import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Shield, Loader2, Download, Copy, Check, Smartphone, RefreshCw, KeyRound, AlertCircle } from 'lucide-react';
import { teamApi } from '../../../../services/teamApi';
import { useWorkspaceSession } from '../../../../context/WorkspaceSession';

/**
 * "Mi WireGuard" — acceso VPN del propio usuario en sesión (moderador o member).
 *
 * Cubre la RECUPERACIÓN: si la provisión falló al aceptar la invitación (router
 * caído / migración a medias), aquí el usuario regenera su acceso con un clic y
 * obtiene el .conf + QR. La clave privada se genera server-side y solo se
 * muestra una vez (mismo modelo que la pantalla de aceptar invitación).
 */
export default function WireGuardTab() {
  const { session } = useWorkspaceSession();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [conf, setConf] = useState<string | null>(null);
  const [allowedIp, setAllowedIp] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carga la config existente (si la hay). 404 → todavía no tiene acceso.
  useEffect(() => {
    (async () => {
      try {
        const r = await teamApi.myWireguard();
        setConf(r.wireguard.conf);
        setAllowedIp(r.wireguard.allowedIp);
      } catch { /* sin config aún */ }
      finally { setLoading(false); }
    })();
  }, []);

  // QR del .conf — WireGuard móvil lo escanea tal cual.
  useEffect(() => {
    if (!conf) { setQr(null); return; }
    QRCode.toDataURL(conf, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
  }, [conf]);

  const provision = async () => {
    setBusy(true); setError(null);
    try {
      const r = await teamApi.provisionMyWireguard();
      setConf(r.conf); setAllowedIp(r.wireguard.allowedIp);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar el acceso'); }
    finally { setBusy(false); }
  };

  const copyConf = () => {
    if (conf) navigator.clipboard.writeText(conf).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const download = () => {
    if (!conf) return;
    // octet-stream (no text/plain): evita que el navegador añada ".txt" al .conf.
    const blob = new Blob([conf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wg-${(session?.email?.split('@')[0] || 'acceso').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/60 dark:bg-slate-800/40">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-violet-500" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Mi acceso WireGuard</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tu túnel de gestión para administrar la red</p>
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-md">
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
        ) : conf ? (
          <>
            {allowedIp && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <KeyRound className="w-3.5 h-3.5" /> IP asignada: <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{allowedIp}</span>
              </div>
            )}
            {qr && (
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                {/* QR siempre sobre blanco para que la cámara lo escanee — no se invierte en dark. */}
                <img src={qr} alt="QR WireGuard" className="rounded-lg bg-white dark:bg-white p-1" width={200} height={200} />
                <p className="flex items-center gap-1.5 text-2xs text-slate-400 dark:text-slate-500">
                  <Smartphone className="w-3 h-3" /> Escanea desde la app WireGuard del móvil
                </p>
              </div>
            )}
            <pre className="text-2xs font-mono bg-slate-900 text-slate-200 rounded-xl p-3 overflow-x-auto max-h-32 leading-relaxed">{conf}</pre>
            <div className="flex items-center gap-2">
              <button onClick={download} className="btn-primary flex-1 px-4 py-2.5 flex items-center justify-center gap-2 text-sm">
                <Download className="w-4 h-4" /> Descargar .conf
              </button>
              <button onClick={copyConf} className="btn-outline px-4 py-2.5 flex items-center gap-2 text-sm" title="Copiar">
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
              <button onClick={provision} disabled={busy} title="Regenerar (invalida el anterior)" className="btn-outline px-3 py-2.5 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-2xs text-amber-600 dark:text-amber-400">La clave privada solo se muestra aquí. Descárgala/guárdala ahora.</p>
          </>
        ) : (
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 mx-auto bg-violet-50 dark:bg-violet-500/15 rounded-2xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-violet-500" />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Aún no tienes acceso WireGuard. Genéralo para administrar la red desde tu móvil o PC.
            </p>
            <button onClick={provision} disabled={busy} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Generar mi acceso WireGuard
            </button>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
            <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
