import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Shield, X, Loader2, Download, Copy, Check, Smartphone, RefreshCw, KeyRound } from 'lucide-react';
import { teamApi } from '../../../../services/teamApi';
import type { Member } from '../../../../types/account';

interface Props {
  member: Member;
  onClose: () => void;
}

export default function MemberWireGuardModal({ member, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [conf, setConf] = useState<string | null>(null);
  const [allowedIp, setAllowedIp] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carga config existente (si la hay)
  useEffect(() => {
    (async () => {
      try {
        const r = await teamApi.getMemberWireguard(member.user_id);
        setConf(r.wireguard.conf);
        setAllowedIp(r.wireguard.allowedIp);
      } catch { /* sin config aún */ }
      finally { setLoading(false); }
    })();
  }, [member.user_id]);

  // Genera el QR cuando hay .conf
  useEffect(() => {
    if (!conf) { setQr(null); return; }
    QRCode.toDataURL(conf, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
  }, [conf]);

  const provision = async () => {
    setBusy(true); setError(null);
    try {
      const r = await teamApi.provisionWireguard(member.user_id);
      setConf(r.conf); setAllowedIp(r.allowedIp);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar el acceso'); }
    finally { setBusy(false); }
  };

  const copyConf = () => {
    if (!conf) return;
    navigator.clipboard.writeText(conf).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const download = () => {
    if (!conf) return;
    const blob = new Blob([conf], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wg-${(member.name || member.email.split('@')[0]).replace(/[^a-z0-9]/gi, '-').toLowerCase()}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-violet-600 rounded-t-2xl px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0"><Shield className="w-4 h-4 text-white" /></div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">Acceso WireGuard</p>
              <p className="text-2xs text-violet-200 truncate">{member.name || member.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-violet-200 hover:text-white hover:bg-white/10 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
          ) : conf ? (
            <>
              {allowedIp && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <KeyRound className="w-3.5 h-3.5" /> IP asignada: <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{allowedIp}</span>
                </div>
              )}
              {/* QR para móvil */}
              {qr && (
                <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  {/* QR siempre sobre blanco para que la cámara lo escanee — no se invierte en dark. */}
                  <img src={qr} alt="QR WireGuard" className="rounded-lg bg-white dark:bg-white p-1" width={200} height={200} />
                  <p className="flex items-center gap-1.5 text-2xs text-slate-400 dark:text-slate-500">
                    <Smartphone className="w-3 h-3" /> Escanea desde la app WireGuard del móvil
                  </p>
                </div>
              )}
              {/* .conf */}
              <pre className="text-2xs font-mono bg-slate-900 text-slate-200 rounded-xl p-3 overflow-x-auto max-h-32 leading-relaxed">{conf}</pre>
              <div className="flex items-center gap-2">
                <button onClick={download} className="btn-primary flex-1 px-4 py-2.5 flex items-center justify-center gap-2 text-sm">
                  <Download className="w-4 h-4" /> Descargar .conf
                </button>
                <button onClick={copyConf} className="btn-outline px-4 py-2.5 flex items-center gap-2 text-sm">
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button onClick={provision} disabled={busy} title="Regenerar" className="btn-outline px-3 py-2.5 disabled:opacity-50">
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
              <p className="text-sm text-slate-600 dark:text-slate-300">Genera el acceso WireGuard para que este miembro configure su móvil o PC.</p>
              <button onClick={provision} disabled={busy} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Generar acceso WireGuard
              </button>
            </div>
          )}
          {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
        </div>
      </div>
    </div>
  );
}
