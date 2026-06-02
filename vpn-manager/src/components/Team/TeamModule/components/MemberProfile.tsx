import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { UserCircle, Waypoints, Shield, Loader2, Download, Copy, Check, Smartphone, KeyRound } from 'lucide-react';
import { teamApi } from '../../../../services/teamApi';
import type { Assignment, MemberWireguard, SessionUser } from '../../../../types/account';

interface Props {
  session: SessionUser;
}

/** Arma la plantilla .conf cuando solo tenemos los datos del servidor (el
 *  miembro entregó su clave pública; la privada vive en su dispositivo). */
function buildWgTemplate(wg: MemberWireguard | null): string | null {
  if (!wg || !wg.serverPublicKey || !wg.endpoint) return null;
  return [
    '[Interface]',
    'PrivateKey = <TU CLAVE PRIVADA>',
    `Address = ${wg.allowedIp}/32`,
    'DNS = 1.1.1.1',
    '',
    '[Peer]',
    `PublicKey = ${wg.serverPublicKey}`,
    `Endpoint = ${wg.endpoint}`,
    `AllowedIPs = ${wg.allowedIps || '192.168.21.0/24'}`,
    'PersistentKeepalive = 25',
  ].join('\n');
}

export default function MemberProfile({ session }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [wg, setWg] = useState<MemberWireguard | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // .conf completo (modo servidor) o plantilla (modo clave-pública del miembro)
  const confText = wg?.conf ?? buildWgTemplate(wg);
  const isTemplate = !!confText && !wg?.conf;

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
    // QR solo del .conf completo; una plantilla con placeholder no es escaneable.
    if (!wg?.conf) { setQr(null); return; }
    QRCode.toDataURL(wg.conf, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
  }, [wg]);

  const copyConf = () => {
    if (!confText) return;
    navigator.clipboard.writeText(confText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const download = () => {
    if (!confText) return;
    const blob = new Blob([confText], { type: 'text/plain' });
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
              <div className="py-10 flex flex-col items-center gap-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Waypoints className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Sin túneles asignados</p>
                <p className="text-2xs text-slate-400 dark:text-slate-500 max-w-xs">Tu moderador aún no te asignó túneles. Cuando lo haga, aparecerán aquí con su acceso.</p>
              </div>
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
              {confText ? (
                <div className="flex flex-col items-center gap-4">
                  {qr && (
                    <div className="flex flex-col items-center gap-2">
                      <img src={qr} alt="QR WireGuard" className="rounded-lg bg-white p-1" width={200} height={200} />
                      <p className="flex items-center gap-1.5 text-2xs text-slate-400 dark:text-slate-500">
                        <Smartphone className="w-3 h-3" /> Escanea desde la app WireGuard del móvil
                      </p>
                    </div>
                  )}

                  {isTemplate && (
                    <div className="w-full space-y-2">
                      <p className="flex items-start gap-1.5 text-2xs text-amber-600 dark:text-amber-400">
                        <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        Reemplaza <code className="font-mono">&lt;TU CLAVE PRIVADA&gt;</code> por la clave privada que generaste en tu app WireGuard. Tu IP asignada es <span className="font-mono">{wg?.allowedIp}</span>.
                      </p>
                      <pre className="text-2xs font-mono bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre">{confText}</pre>
                    </div>
                  )}

                  <div className="flex items-center gap-2 w-full max-w-xs">
                    <button onClick={download} className="btn-primary flex-1 px-4 py-2.5 flex items-center justify-center gap-2 text-sm">
                      <Download className="w-4 h-4" /> Descargar .conf
                    </button>
                    <button onClick={copyConf} className="btn-outline px-4 py-2.5" title="Copiar configuración" aria-label="Copiar configuración">
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-4">
                  Aún no tienes acceso WireGuard. Pídele a tu moderador que lo genere o acepta una invitación con tu clave pública.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
