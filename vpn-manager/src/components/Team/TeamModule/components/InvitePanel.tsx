import { useState } from 'react';
import { UserPlus, Loader2, Mail, X, Clock, User } from 'lucide-react';
import type { Invitation, Role } from '../../../../types/account';
import { ROLE_LABEL } from '../../../../types/account';
import { canAssignCoModerator } from '../../../../utils/permissions';

interface InvitePanelProps {
  currentRole: Role;
  invitations: Invitation[];
  onInvite: (email: string, role: Exclude<Role, 'OWNER'>, tunnelId?: string, name?: string) => Promise<string | null>;
  onRevoke: (id: string) => void;
}

export default function InvitePanel({ currentRole, invitations, onInvite, onRevoke }: InvitePanelProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'OWNER'>>('MEMBER');
  const [sending, setSending] = useState(false);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim()) return;
    setSending(true); setError(null); setDevHint(null);
    try {
      // El túnel se asigna dinámicamente cuando el miembro acepta y se le
      // genera su WireGuard, no es necesario pedirlo aquí.
      const dev = await onInvite(email.trim(), role, undefined, name.trim() || undefined);
      setEmail(''); setName('');
      if (dev) setDevHint(`Invitación creada. En modo dev, el código OTP está en la consola del backend para ${email.trim()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo invitar');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card p-5 border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Invitar a un miembro</h3>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative sm:w-56">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Nombre del invitado"
            className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                       text-slate-700 placeholder:text-slate-400 transition-all
                       dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="correo@ejemplo.com"
            className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                       text-slate-700 placeholder:text-slate-400 transition-all
                       dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <select value={role} onChange={e => setRole(e.target.value as Exclude<Role, 'OWNER'>)}
          className="px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-700
                     focus:outline-none focus:ring-2 focus:ring-indigo-300
                     dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
          <option value="MEMBER">{ROLE_LABEL.MEMBER}</option>
          {canAssignCoModerator(currentRole) && <option value="CO_MODERATOR">{ROLE_LABEL.CO_MODERATOR}</option>}
        </select>
        <button onClick={submit} disabled={sending || !email.trim()}
          className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          <span>Invitar</span>
        </button>
      </div>


      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      {devHint && <p className="text-xs text-amber-600 dark:text-amber-400">{devHint}</p>}

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
