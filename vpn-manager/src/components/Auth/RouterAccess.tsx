import { useState, useEffect } from 'react';
import { Lock, User, Server, ShieldCheck, CheckCircle, AlertCircle, Loader2, Mail } from 'lucide-react';
import Spinner from '../Common/Spinner';
import { useVpn } from '../../context';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import AcceptInvitationForm from './AcceptInvitationForm';
import PasswordResetRequest from './PasswordResetRequest';
import PasswordResetConfirm from './PasswordResetConfirm';
import { federatedAuthAvailable } from '../../config/federatedAuth';
import { signInWithGoogle } from '../../services/federatedAuth';
import JoinpointLogo from '../Common/JoinpointLogo';

import { API_BASE_URL } from '../../config';

type Mode = 'login' | 'accept' | 'reset-request' | 'reset-confirm';

export default function RouterAccess() {
  const { handleLoginSuccess } = useVpn();
  // Parseo de los query params al primer render
  const urlState = (() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return {
        accept: sp.get('accept') === '1',
        resetToken: sp.get('reset') || '',
        email: sp.get('email') || '',
        otp: sp.get('otp') || '',
      };
    } catch { return { accept: false, resetToken: '', email: '', otp: '' }; }
  })();
  const initialMode: Mode = urlState.resetToken
    ? 'reset-confirm'
    : urlState.accept ? 'accept' : 'login';
  const inviteEmail = urlState.email;
  const inviteOtp = urlState.otp;
  const resetToken = urlState.resetToken;
  const [mode, setMode] = useState<Mode>(initialMode);

  // Limpia los query params al volver al login para que la URL no quede sucia
  const goToLogin = () => {
    setMode('login');
    try { window.history.replaceState({}, '', window.location.pathname); } catch { /* SSR */ }
  };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorDetail, setErrorDetail] = useState('');

  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    fetchWithTimeout(`${API_BASE_URL}/api/auth/status`, { method: 'GET' }, 5000)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setNeedsSetup(data.needsSetup);
        } else {
          setNeedsSetup(false);
        }
      })
      .catch(() => setNeedsSetup(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsConnecting(true);
    setSyncStatus('loading');
    setErrorDetail('');

    const endpoint = needsSetup ? '/api/auth/setup' : '/api/auth/login';

    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}${endpoint}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        },
        15_000,
      );

      const data = await response.json() as {
        success?: boolean;
        user?: string;
        role?: string;
        message?: string;
      };
      if (response.ok && data.success) {
        setSyncStatus('success');
        setTimeout(() => handleLoginSuccess({
            user: data.user ?? username,
            role: data.role ?? 'viewer'
        }), 1000);
      } else {
        setErrorDetail(data.message ?? 'Acceso denegado.');
        setSyncStatus('error');
        setIsConnecting(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorDetail(msg);
      setSyncStatus('error');
      setIsConnecting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsConnecting(true);
    setSyncStatus('loading');
    setErrorDetail('');
    try {
      const user = await signInWithGoogle();
      setSyncStatus('success');
      await handleLoginSuccess({
        user: user.email,
        role: user.role === 'MEMBER' ? 'viewer' : 'admin',
      });
    } catch (error) {
      setErrorDetail(error instanceof Error ? error.message : 'Correo o contraseña incorrectos');
      setSyncStatus('error');
      setIsConnecting(false);
    }
  };

  if (needsSetup === null) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
           <Spinner size="lg" label="Verificando sesión…" />
        </div>
      );
  }

  // Pantalla pública de aceptación de invitación (personas nuevas con código)
  if (mode === 'accept') {
    return (
      <AcceptInvitationForm
        onBack={goToLogin}
        onLoggedIn={handleLoginSuccess}
        prefillEmail={inviteEmail}
        prefillOtp={inviteOtp}
      />
    );
  }

  // Pantalla pública de recuperación: pedir email
  if (mode === 'reset-request') {
    return <PasswordResetRequest onBack={goToLogin} />;
  }

  // Pantalla pública de recuperación: confirmar con token + nueva contraseña
  if (mode === 'reset-confirm') {
    return <PasswordResetConfirm token={resetToken} onBack={goToLogin} onSuccess={goToLogin} />;
  }

  return (
    <div className="relative flex min-h-[100svh] items-center justify-center bg-slate-100 p-4 sm:p-6 dark:bg-slate-950">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-200/70 blur-3xl dark:bg-indigo-500/15" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-cyan-200/60 blur-3xl dark:bg-cyan-500/10" />
      </div>

      <main className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl shadow-slate-400/25 lg:min-h-[650px] lg:grid-cols-[3fr_2fr] dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/50">
        <section className="flex flex-col justify-center px-6 py-9 sm:px-12 sm:py-12 lg:px-16" aria-labelledby="login-heading">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-6 text-center sm:mb-8 lg:text-left">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
                {needsSetup ? 'Primer acceso' : 'Bienvenido de nuevo'}
              </p>
              <h1 id="login-heading" className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                {needsSetup ? 'Configura tu cuenta' : 'Inicia sesión'}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {needsSetup ? 'Crea la cuenta administrativa maestra para acceder a la plataforma.' : 'Usa tus credenciales para entrar a tu centro de operaciones.'}
              </p>
            </div>

            {!needsSetup && federatedAuthAvailable && (
              <div className="mb-5 sm:mb-6">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isConnecting}
                  className="btn-outline btn-md w-full flex items-center justify-center gap-2"
                >
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300">G</span>
                  <span>Continuar con Google</span>
                </button>
                <div className="mt-5 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  <span className="text-xs font-medium text-slate-400">o usa tu cuenta</span>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>
              </div>
            )}

            {syncStatus !== 'idle' && (
              <div className="mb-6">
                {syncStatus === 'loading' && (
                  <div role="status" aria-live="polite" className="flex items-center space-x-3 px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/30">
                    <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Autenticando...</p>
                    </div>
                  </div>
                )}
                {syncStatus === 'success' && (
                  <div role="status" aria-live="polite" className="flex items-center space-x-3 px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">¡Conexión exitosa! Entrando...</p>
                  </div>
                )}
                {syncStatus === 'error' && (
                  <div className="space-y-3">
                    <div role="alert" aria-live="assertive" className="flex items-start space-x-3 px-4 py-3 bg-rose-50 rounded-xl border border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/30">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Error de conexión</p>
                        <p className="text-xs text-rose-500 mt-0.5 dark:text-rose-400">{errorDetail}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-username" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  {needsSetup ? 'Usuario Administrador' : 'Usuario o correo'}
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    required
                    autoComplete="username"
                    maxLength={255}
                    placeholder={needsSetup ? "admin" : "admin o correo@ejemplo.com"}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input-field min-h-12 bg-slate-50 pl-10 font-mono dark:bg-slate-950/60"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    required
                    minLength={needsSetup ? 12 : 1}
                    maxLength={128}
                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field min-h-12 bg-slate-50 pl-10 dark:bg-slate-950/60"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isConnecting || !username || !password}
                className="btn-primary btn-md mt-6 w-full relative flex items-center justify-center space-x-2 group overflow-hidden disabled:bg-indigo-300 disabled:text-white disabled:opacity-80 disabled:shadow-none dark:disabled:bg-indigo-800 dark:disabled:text-indigo-200"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <Server className="w-4 h-4 relative z-10" />
                <span className="relative z-10">
                    {needsSetup ? 'Crear cuenta de administrador' : 'Ingresar a Joinpoint'}
                </span>
              </button>
            </form>

            {!needsSetup && (
              <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                <button onClick={() => setMode('reset-request')}
                  className="flex min-h-11 items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300">
                  <Lock className="w-3.5 h-3.5" /> ¿Olvidaste tu contraseña?
                </button>
                <button onClick={() => setMode('accept')}
                  className="flex min-h-11 items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 lg:hidden dark:text-slate-400 dark:hover:text-indigo-300">
                  <Mail className="w-3.5 h-3.5" /> Aceptar invitación
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="relative order-first flex min-h-44 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 px-8 py-7 text-center sm:min-h-52 sm:py-10 lg:order-last lg:min-h-full lg:rounded-l-[7rem] lg:px-12" aria-label="Joinpoint NOC">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/10" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-300/10" />
          <div className="relative z-10 max-w-sm">
            <div className="mx-auto mb-6 hidden w-fit rounded-2xl bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur-sm lg:block">
              {needsSetup ? <ShieldCheck className="h-10 w-10 text-white" /> : <JoinpointLogo inverted className="h-14 w-14" />}
            </div>
            <p className="text-xs font-extrabold tracking-[0.24em] text-cyan-100">JOINPOINT NOC</p>
            <h2 className="mt-2 text-2xl font-extrabold text-white sm:mt-3 sm:text-3xl lg:text-4xl">
              {needsSetup ? 'Tu red comienza aquí' : '¡Hola de nuevo!'}
            </h2>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-indigo-100 sm:mt-4 sm:text-base">
              {needsSetup ? 'Configura el acceso principal y prepara tu centro de operaciones.' : 'Controla sitios, accesos y equipos desde una plataforma segura.'}
            </p>
            {!needsSetup && (
              <button
                type="button"
                onClick={() => setMode('accept')}
                className="btn-md mt-7 hidden w-full items-center justify-center gap-2 border border-white/70 bg-transparent text-white shadow-none hover:bg-white/10 lg:inline-flex"
              >
                <Mail className="h-4 w-4" /> Aceptar invitación
              </button>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
