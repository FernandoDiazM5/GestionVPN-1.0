import { useState } from 'react';
import { Lock, ArrowLeft, Loader2, Check, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { passwordResetApi } from '../../services/passwordResetApi';

/**
 * Pantalla pública para confirmar el reseteo con el token recibido por email.
 * El token llega en la URL: ?reset=<token>
 *
 * Reglas de UX:
 *  • Contraseña min 8 chars (requisito del backend)
 *  • Confirmación visual con toggle "ver/ocultar"
 *  • Mensajes claros si el token es inválido o expiró
 */
export default function PasswordResetConfirm({
  token, onBack, onSuccess,
}: {
  token: string;
  onBack: () => void;
  /** Llamado tras un cambio exitoso → app vuelve a la pantalla de login. */
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;
  const canSubmit = password.length >= 8 && !mismatch;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      await passwordResetApi.confirm(token, password);
      setDone(true);
      // Auto-volver al login tras 2.5s
      setTimeout(onSuccess, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña');
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
              <div className="bg-white/20 p-2.5 rounded-xl"><ShieldCheck className="w-6 h-6 text-white" /></div>
              <div>
                <h1 className="text-2xl font-bold text-white">Nueva contraseña</h1>
                <p className="text-indigo-200 text-sm">Elige una clave segura</p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-8 py-8 -mt-4 relative">
            {done ? (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
                  <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">¡Contraseña actualizada!</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Ya puedes iniciar sesión con tu nueva clave.
                </p>
                <p className="text-2xs text-slate-400 dark:text-slate-500">Redirigiendo al login…</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Elige una nueva contraseña para tu cuenta. Debe tener al menos <strong>8 caracteres</strong>.
                </p>

                {error && (
                  <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
                  </div>
                )}

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type={showPwd ? 'text' : 'password'} required
                    placeholder="Nueva contraseña (mín. 8)"
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoFocus
                    className="input-field pl-10 pr-10" />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    aria-label={showPwd ? 'Ocultar' : 'Ver'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {tooShort && <p className="text-2xs text-amber-600 dark:text-amber-400">Mínimo 8 caracteres</p>}

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type={showPwd ? 'text' : 'password'} required
                    placeholder="Confirma la contraseña"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    className="input-field pl-10" />
                </div>
                {mismatch && <p className="text-2xs text-rose-600 dark:text-rose-400">Las contraseñas no coinciden</p>}

                <button type="submit" disabled={busy || !canSubmit}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Actualizar contraseña
                </button>
              </form>
            )}

            {!done && (
              <button onClick={onBack} className="w-full mt-4 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Cancelar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
