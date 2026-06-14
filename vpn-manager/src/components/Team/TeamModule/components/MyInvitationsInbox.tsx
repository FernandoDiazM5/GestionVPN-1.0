import { useState, useEffect, useCallback } from 'react';
import { Mail, Loader2, Check, KeyRound, Router, Copy, ShieldCheck } from 'lucide-react';
import { teamApi } from '../../../../services/teamApi';
import { ROLE_LABEL } from '../../../../types/account';
import type { MyInvitation, WgServerConfig } from '../../../../types/account';

/**
 * Bandeja in-app: muestra las invitaciones PENDING dirigidas al usuario logueado
 * y permite aceptarlas enviando SU clave pública WireGuard (la privada nunca sale
 * del dispositivo). Al aceptar muestra los datos del servidor para armar el .conf.
 */
export default function MyInvitationsInbox({ onAccepted }: { onAccepted: () => void }) {
  const [invs, setInvs] = useState<MyInvitation[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tunnel: string | null; wg: WgServerConfig | null } | null>(null);

  const load = useCallback(async () => {
    try { const r = await teamApi.myInvitations(); setInvs(r.invitations); }
    catch { /* sin sesión / sin invitaciones */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const accept = async (inv: MyInvitation) => {
    setBusy(true); setError(null);
    try {
      const r = await teamApi.acceptInApp(inv.id, publicKey.trim() || undefined);
      setDone({ tunnel: r.tunnel, wg: r.wireguard });
      setPublicKey('');
      await load();
      onAccepted();   // refresca la sesión (cambia al workspace aceptado) y recarga
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aceptar la invitación');
    } finally { setBusy(false); }
  };

  if (done) {
    return <AcceptedCard tunnel={done.tunnel} wg={done.wg} onClose={() => setDone(null)} />;
  }
  if (invs.length === 0) return null;

  return (
    <div className="card p-5 border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-500/5 space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
          Invitaciones para ti <span className="badge badge-info ml-1">{invs.length}</span>
        </h3>
      </div>

      {invs.map(inv => (
        <div key={inv.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-100 flex-1 min-w-0 truncate">
              {inv.workspace_name}
            </span>
            <span className="badge badge-neutral">{ROLE_LABEL[inv.role]}</span>
            {inv.tunnel_id && <span className="badge badge-info font-mono">{inv.tunnel_id}</span>}
            {openId !== inv.id && (
              <button onClick={() => { setOpenId(inv.id); setError(null); }} className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> Aceptar
              </button>
            )}
          </div>

          {openId === inv.id && (
            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-700">
              <p className="text-2xs text-slate-500 dark:text-slate-400">
                Pega tu <strong>clave pública WireGuard</strong> (generada en tu app de WireGuard; la privada NO se comparte).
                Opcional: puedes aceptar sin clave y configurarla luego.
              </p>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={publicKey} onChange={e => setPublicKey(e.target.value)}
                  placeholder="Clave pública WG (ej. abcd...=)"
                  className="w-full pl-10 pr-3 py-2 text-xs font-mono rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100
                             focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-700 placeholder:font-sans"
                />
              </div>
              {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => { setOpenId(null); setPublicKey(''); setError(null); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  Cancelar
                </button>
                <button onClick={() => accept(inv)} disabled={busy}
                  className="btn-primary px-4 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Unirme
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tarjeta de éxito: muestra túnel + datos del servidor WG ──
function AcceptedCard({ tunnel, wg, onClose }: { tunnel: string | null; wg: WgServerConfig | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const confTemplate = wg
    ? `[Interface]\nPrivateKey = <TU CLAVE PRIVADA>\nAddress = ${wg.allowedIp}/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = ${wg.serverPublicKey}\nEndpoint = ${wg.endpoint}\nAllowedIPs = ${wg.allowedIps}\nPersistentKeepalive = 25`
    : '';
  const copy = () => { navigator.clipboard.writeText(confTemplate).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };

  return (
    <div className="card p-5 border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">¡Te uniste al equipo!</h3>
      </div>
      {tunnel && (
        <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
          <Router className="w-4 h-4 text-indigo-500" /> Túnel asignado:
          <span className="badge badge-info font-mono">{tunnel}</span>
        </p>
      )}
      {wg ? (
        <div className="space-y-2">
          <p className="text-2xs text-slate-500 dark:text-slate-400">
            Completa este <strong>.conf</strong> en tu app WireGuard con <strong>tu clave privada</strong> y conéctate:
          </p>
          <pre className="text-2xs font-mono bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre">{confTemplate}</pre>
          <button onClick={copy} className="btn-outline px-3 py-1.5 text-xs flex items-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> {copied ? 'Copiado' : 'Copiar configuración'}
          </button>
        </div>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Acceso WireGuard pendiente (no enviaste clave pública o el router no respondió). Tu moderador puede generarlo, o vuelve a entrar para reintentar.
        </p>
      )}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="btn-primary px-4 py-2 text-sm">Continuar</button>
      </div>
    </div>
  );
}
