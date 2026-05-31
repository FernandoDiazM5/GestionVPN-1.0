import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { UserCircle, Waypoints, Shield, Loader2, Download, Copy, Check, Smartphone } from 'lucide-react';
import { teamApi } from '../../../../services/teamApi';
import type { Assignment, MemberWireguard, SessionUser } from '../../../../types/account';

interface Props {
  session: SessionUser;
}

export default function MemberProfile({ session }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [wg, setWg] = useState<MemberWireguard | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const a = await teamApi.listAssignments();
        setAssignments(a.assignments);
      } catch { /* */ }
      try {
        const w = await teamApi.myWireguard();
        setWg(w.wireguard);
      } catch { /* sin WG aún */ }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!wg?.conf) { setQr(null); return; }
    QRCode.toDataURL(wg.conf, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
  }, [wg]);

  const copyConf = () => {
    if (!wg?.conf) return;
    navigator.clipboard.writeText(wg.conf).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const download = () => {
    if (!wg?.conf) return;
    const blob = new Blob([wg.conf], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mi-wireguard.conf'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <UserCircle className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          <span>Mi perfil</span>
        </h2>
        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1 font-mono">{session.email}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : (
        <>
          {/* Mis túneles asignados */}
          <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center gap-2">
              <Waypoints className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Mis túneles</h3>
            </div>
            {assignments.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">Tu moderador aún no te asignó túneles.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {assignments.map(a => (
                  <li key={a.id} className="flex items-center gap-3 px-6 py-3">
                    <Waypoints className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-200">{a.tunnel_id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Mi acceso WireGuard */}
          <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-500 dark:text-violet-400" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Mi acceso WireGuard</h3>
            </div>
            <div className="p-6">
              {wg?.conf ? (
                <div className="flex flex-col items-center gap-4">
                  {qr && (
                    <div className="flex flex-col items-center gap-2">
                      <img src={qr} alt="QR WireGuard" className="rounded-lg bg-white p-1" width={200} height={200} />
                      <p className="flex items-center gap-1.5 text-2xs text-slate-400 dark:text-slate-500">
                        <Smartphone className="w-3 h-3" /> Escanea desde la app WireGuard del móvil
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 w-full max-w-xs">
                    <button onClick={download} className="btn-primary flex-1 px-4 py-2.5 flex items-center justify-center gap-2 text-sm">
                      <Download className="w-4 h-4" /> Descargar .conf
                    </button>
                    <button onClick={copyConf} className="btn-outline px-4 py-2.5">
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-4">
                  Aún no tienes acceso WireGuard. Pídele a tu moderador que lo genere.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
