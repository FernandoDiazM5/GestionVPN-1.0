import { useState } from 'react';
import { Mail, ArrowLeft, Loader2, Check, KeyRound } from 'lucide-react';
import { passwordResetApi } from '../../services/passwordResetApi';

/**
 * Pantalla pública para solicitar email de recuperación de contraseña.
 *
 * Por seguridad NO indicamos si el correo existe o no en el sistema —
 * siempre mostramos el mismo mensaje genérico. Esto evita la enumeración
 * de cuentas (un atacante no puede usar este endpoint para descubrir
 * qué emails están registrados).
 */
export default function PasswordResetRequest({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setError(null);
    try {
      await passwordResetApi.request(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la solicitud');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-100 dark:bg-indigo-900/20 rounded-full -translate-x-1/2 -translate-y-1/2 opacity-60 blur-3xl pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/80 dark:shadow-black/40 border border-slate-200 dark:border-slate-800 overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-8 pt-10 pb-12">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 p-2.5 rounded-xl"><KeyRound className="w-6 h-6 text-white" /></div>
              <div>
                <h1 className="text-2xl font-bold text-white">Recuperar contraseña</h1>
                <p className="text-indigo-200 text-sm">Te enviaremos un enlace a tu correo</p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-8 py-8 -mt-4 relative">
            {sent ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Solicitud enviada</p>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Si el correo <span className="font-mono">{email}</span> está registrado, recibirás un enlace para restablecer
                  tu contraseña en los próximos minutos.
                </p>
                <p className="text-2xs text-slate-500 dark:text-slate-500">
                  El enlace es válido por <strong>15 minutos</strong>. Revisa tu carpeta de spam si no lo ves.
                </p>
                <button onClick={onBack}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold text-sm mt-2">
                  Volver a iniciar sesión
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Ingresa el correo asociado a tu cuenta. Te enviaremos un enlace para crear una nueva contraseña.
                </p>
                {error && <p className="text-sm text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/30 rounded-xl px-3 py-2">{error}</p>}
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="email" required placeholder="tu@correo.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    autoFocus
                    className="input-field pl-10" />
                </div>
                <button type="submit" disabled={busy || !email.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Enviar enlace
                </button>
              </form>
            )}

            <button onClick={onBack} className="w-full mt-4 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a iniciar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
