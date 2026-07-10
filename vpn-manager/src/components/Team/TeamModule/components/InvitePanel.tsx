import { useState } from 'react';
import { UserPlus, Loader2, Mail, X, Clock, User, AtSign } from 'lucide-react';
import type { Invitation } from '../../../../types/account';
import { ROLE_LABEL } from '../../../../types/account';

interface InvitePanelProps {
  invitations: Invitation[];
  /** `email` XOR `username` (usuario existente → invitación in-app). */
  onInvite: (data: { email?: string; username?: string; name?: string }) => Promise<string | null>;
  onRevoke: (id: string) => void;
}

const inputCls = `w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500
                  focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                  text-slate-700 placeholder:text-slate-400 transition-all`;

export default function InvitePanel({ invitations, onInvite, onRevoke }: InvitePanelProps) {
  const [mode, setMode] = useState<'email' | 'user'>('email');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = mode === 'email' ? !!email.trim() : !!username.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setSending(true); setError(null); setHint(null);
    try {
      // El túnel se asigna dinámicamente cuando el miembro acepta y se le
      // genera su WireGuard, no es necesario pedirlo aquí. El único rol
      // invitable es MEMBER (View): el moderador del workspace es el OWNER.
      const result = await onInvite(mode === 'email'
        ? { email: email.trim(), name: name.trim() || undefined }
        : { username: username.trim().toLowerCase(), name: name.trim() || undefined });
      const who = mode === 'email' ? email.trim() : username.trim();
      setEmail(''); setUsername(''); setName('');
      if (result === 'inapp') setHint(`Invitación creada — ${who} la verá en su bandeja al entrar a la app.`);
      else if (result === 'dev') setHint(`Invitación creada. En modo dev, el código OTP está en la consola del backend para ${who}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo invitar');
    } finally {
      setSending(false);
    }
  };

  const segBase = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5';
  const segOn = 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm';
  const segOff = 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';

  return (
    <div className="card p-5 border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <UserPlus className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Invitar a un miembro</h3>
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 ml-auto">
          <button type="button" onClick={() => { setMode('email'); setError(null); }}
            className={`${segBase} ${mode === 'email' ? segOn : segOff}`}>
            <Mail className="w-3.5 h-3.5" /> Por correo
          </button>
          <button type="button" onClick={() => { setMode('user'); setError(null); }}
            className={`${segBase} ${mode === 'user' ? segOn : segOff}`}>
            <AtSign className="w-3.5 h-3.5" /> Usuario existente
          </button>
        </div>
      </div>

      {mode === 'user' && (
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
          Comparte túneles con alguien que ya tiene cuenta en la plataforma: entra como miembro
          de este workspace sin crear otra cuenta. Verá la invitación en su bandeja al iniciar sesión.
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative sm:w-56">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
          <input
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Nombre del invitado"
            className={inputCls}
          />
        </div>
        <div className="relative flex-1">
          {mode === 'email' ? (
            <>
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="correo@ejemplo.com"
                className={inputCls}
              />
            </>
          ) : (
            <>
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
              <input
                value={username} onChange={e => setUsername(e.target.value.toLowerCase().trim())}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="usuario de la plataforma (ej. soporte1)"
                className={inputCls + ' font-mono'}
                autoComplete="off"
              />
            </>
          )}
        </div>
        <button onClick={submit} disabled={sending || !canSubmit}
          className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          <span>Invitar</span>
        </button>
      </div>


      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      {hint && <p className="text-xs text-amber-600 dark:text-amber-400">{hint}</p>}

      {/* Invitaciones pendientes */}
      {invitations.length > 0 && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Pendientes</p>
          {invitations.map(inv => (
            <div key={inv.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate flex-1">{inv.email}</span>
              <span className="badge badge-neutral">{ROLE_LABEL[inv.role]}</span>
              <button onClick={() => onRevoke(inv.id)} title="Revocar invitación" aria-label="Revocar invitación"
                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors dark:hover:text-rose-400 dark:hover:bg-rose-500/10">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
