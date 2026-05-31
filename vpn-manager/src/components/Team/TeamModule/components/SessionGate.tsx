import { useState } from 'react';
import { Users, Loader2, LogIn, UserPlus, KeyRound } from 'lucide-react';
import { accountApi } from '../../../../services/accountApi';

type Mode = 'login' | 'register' | 'verify';

interface SessionGateProps {
  onAuthed: () => void;
}

export default function SessionGate({ onAuthed }: SessionGateProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devHint, setDevHint] = useState(false);

  const inputCls =
    'w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none ' +
    'focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 text-slate-700 placeholder:text-slate-400 ' +
    'dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 transition-all';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  const doLogin = () => run(async () => { await accountApi.login(email.trim(), password); onAuthed(); });
  const doRegister = () => run(async () => {
    const r = await accountApi.register(email.trim(), password, name.trim() || undefined);
    setDevHint(!!r.dev); setMode('verify');
  });
  const doVerify = () => run(async () => { await accountApi.verify(email.trim(), otp.trim()); onAuthed(); });

  return (
    <div className="max-w-md mx-auto">
      <div className="card p-6 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {mode === 'register' ? 'Crear cuenta de equipo' : mode === 'verify' ? 'Verifica tu correo' : 'Acceso al equipo'}
            </h2>
            <p className="text-2xs text-slate-400 dark:text-slate-500">Sistema multi-usuario (workspaces y roles)</p>
          </div>
        </div>

        {mode === 'verify' ? (
          <>
            {devHint && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Modo dev: el código OTP se imprimió en la consola del backend.
              </p>
            )}
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input className={inputCls + ' pl-10 font-mono tracking-widest'} placeholder="Código de 6 dígitos"
                value={otp} maxLength={6} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && doVerify()} />
            </div>
            <button onClick={doVerify} disabled={busy || otp.length !== 6} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Verificar
            </button>
          </>
        ) : (
          <>
            <input className={inputCls} type="email" placeholder="Correo electrónico"
              value={email} onChange={e => setEmail(e.target.value)} />
            {mode === 'register' && (
              <input className={inputCls} placeholder="Nombre (opcional)" value={name} onChange={e => setName(e.target.value)} />
            )}
            <input className={inputCls} type="password" placeholder="Contraseña"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? doLogin() : doRegister())} />
            <button onClick={mode === 'login' ? doLogin : doRegister} disabled={busy}
              className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {mode === 'login' ? 'Iniciar sesión' : 'Registrarme'}
            </button>
          </>
        )}

        {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}

        {mode !== 'verify' && (
          <p className="text-xs text-center text-slate-400 dark:text-slate-500">
            {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
              className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
              {mode === 'login' ? 'Crear una' : 'Inicia sesión'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
