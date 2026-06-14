import { useState } from 'react';
import { Lock, Mail, Check, Loader2, AlertCircle, Eye, EyeOff, KeyRound } from 'lucide-react';
import { accountApi } from '../../../../services/accountApi';
import { useWorkspaceSession } from '../../../../context/WorkspaceSession';

type Section = 'password' | 'email';

export default function ProfileTab() {
  const [section, setSection] = useState<Section>('password');

  return (
    <div className="card border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Sub-tabs */}
      <div className="border-b border-slate-100 dark:border-slate-800 px-4 flex gap-1">
        <SubTab active={section === 'password'} onClick={() => setSection('password')} icon={Lock} label="Contraseña" />
        <SubTab active={section === 'email'}    onClick={() => setSection('email')}    icon={Mail} label="Correo" />
      </div>

      <div className="p-6">
        {section === 'password' && <ChangePassword />}
        {section === 'email'    && <ChangeEmail />}
      </div>
    </div>
  );
}

function SubTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Lock; label: string }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors
        ${active
          ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
//  Cambio de contraseña
// ─────────────────────────────────────────────────────────────
function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;
  const canSubmit = current.length > 0 && next.length >= 8 && !mismatch;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setErr(null); setOk(false);
    try {
      await accountApi.changePassword(current, next);
      setOk(true); setCurrent(''); setNext(''); setConfirm('');
      setTimeout(() => setOk(false), 4000);
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo actualizar'); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 max-w-md">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">Cambiar contraseña</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Después del cambio, tus otras sesiones se cerrarán automáticamente.
        </p>
      </div>

      {ok && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Contraseña actualizada</p>
        </div>
      )}
      {err && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
          <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-700 dark:text-rose-300">{err}</p>
        </div>
      )}

      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
        <input type={show ? 'text' : 'password'} required value={current}
          onChange={e => setCurrent(e.target.value)}
          placeholder="Contraseña actual"
          className="input-field pl-10 pr-10" />
        <button type="button" onClick={() => setShow(s => !s)} aria-label="ver"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      <div className="relative">
        <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
        <input type={show ? 'text' : 'password'} required value={next}
          onChange={e => setNext(e.target.value)}
          placeholder="Nueva contraseña (mín. 8)"
          className="input-field pl-10" />
      </div>
      {tooShort && <p className="text-2xs text-amber-600 dark:text-amber-400 -mt-2">Mínimo 8 caracteres</p>}

      <div className="relative">
        <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
        <input type={show ? 'text' : 'password'} required value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Confirma la nueva contraseña"
          className="input-field pl-10" />
      </div>
      {mismatch && <p className="text-2xs text-rose-600 dark:text-rose-400 -mt-2">No coinciden</p>}

      <button type="submit" disabled={busy || !canSubmit}
        className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Actualizar contraseña
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
//  Cambio de email (con OTP enviado al NUEVO correo)
// ─────────────────────────────────────────────────────────────
function ChangeEmail() {
  const { session, refresh } = useWorkspaceSession();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [newEmail, setNewEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const requestChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setBusy(true); setErr(null);
    try {
      await accountApi.requestEmailChange(newEmail.trim());
      setStep('confirm');
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo enviar'); }
    finally { setBusy(false); }
  };

  const confirmChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await accountApi.confirmEmailChange(newEmail.trim(), otp.trim(), password);
      setOkMsg(`Correo actualizado a ${r.email}`);
      setStep('request'); setNewEmail(''); setOtp(''); setPassword('');
      refresh();
      setTimeout(() => setOkMsg(null), 5000);
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo confirmar'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">Cambiar correo</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Correo actual: <span className="font-mono">{session?.email}</span>
        </p>
      </div>

      {okMsg && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{okMsg}</p>
        </div>
      )}
      {err && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
          <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-700 dark:text-rose-300">{err}</p>
        </div>
      )}

      {step === 'request' ? (
        <form onSubmit={requestChange} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
            <input type="email" required value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="nuevo@correo.com"
              className="input-field pl-10" />
          </div>
          <p className="text-2xs text-slate-500 dark:text-slate-400">
            Te enviaremos un código de 6 dígitos al nuevo correo para confirmar el cambio.
          </p>
          <button type="submit" disabled={busy || !newEmail.trim()}
            className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Enviar código
          </button>
        </form>
      ) : (
        <form onSubmit={confirmChange} className="space-y-4">
          <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl px-3 py-2 text-2xs text-indigo-700 dark:text-indigo-300">
            Te enviamos un código a <span className="font-mono">{newEmail}</span>. Revisa tu correo.
          </div>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
            <input required inputMode="numeric" maxLength={6} value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="Código de 6 dígitos"
              className="input-field pl-10 font-mono tracking-widest" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
            <input type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Tu contraseña actual"
              className="input-field pl-10" />
          </div>
          <p className="text-2xs text-slate-500 dark:text-slate-400">
            Por seguridad, te pedimos también tu contraseña actual.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setStep('request'); setOtp(''); setPassword(''); }}
              className="px-3 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">
              Cambiar correo
            </button>
            <button type="submit" disabled={busy || otp.length !== 6 || !password}
              className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Confirmar cambio
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
