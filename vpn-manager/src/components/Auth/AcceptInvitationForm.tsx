import { useState, useEffect } from 'react';
import { Mail, KeyRound, Lock, ArrowLeft, Loader2, Check, Copy, Router, ShieldCheck, Smartphone, AlertTriangle, RefreshCw } from 'lucide-react';
import { teamApi } from '../../services/teamApi';
import type { RouterCredentials } from '../../store/db';
import type { WgServerConfig, WgProvisionError } from '../../types/account';

/**
 * Pantalla pública para aceptar una invitación con código (OTP) — para personas
 * nuevas sin cuenta. Recoge email + código + clave; al aceptar, el backend crea
 * la cuenta, asigna el túnel, GENERA el par de claves WireGuard server-side y
 * devuelve el .conf completo listo para pegar en la app WireGuard.
 */
export default function AcceptInvitationForm({
  onBack, onLoggedIn, prefillEmail = '', prefillOtp = '',
}: {
  onBack: () => void;
  onLoggedIn: (creds: RouterCredentials) => void;
  prefillEmail?: string;
  prefillOtp?: string;
}) {
  const [email, setEmail] = useState(prefillEmail);
  const [otp, setOtp] = useState(prefillOtp);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [result, setResult] = useState<{ user: { email: string; role: string }; tunnel: string | null; wg: WgServerConfig | null; conf: string | null; wgError: WgProvisionError | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedOtp = otp.trim();
    if (!normalizedEmail || !/^\d{6}$/.test(normalizedOtp)) return;
    if ((passwordRequired && !password) || (password && password.length < 12)) {
      setError(passwordRequired && !password
        ? 'Define una contraseña para crear tu cuenta.'
        : 'La contraseña debe tener al menos 12 caracteres.');
      return;
    }
    setBusy(true); setError('');
    try {
      // No enviamos publicKey: el servidor genera el par completo y nos devuelve
      // el .conf con la PrivateKey real. El nombre del invitado lo eligió
      // quien envió la invitación; no se pide aquí.
      const r = await teamApi.accept(normalizedEmail, normalizedOtp, password || undefined);
      setResult({ user: r.user, tunnel: r.tunnel, wg: r.wireguard, conf: r.conf ?? null, wgError: r.wgError ?? null });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'PASSWORD_REQUIRED') {
        setPasswordRequired(true);
      }
      setError(err instanceof Error ? err.message : 'No se pudo aceptar la invitación');
    } finally { setBusy(false); }
  };

  // Reintenta la provisión WG cuando falló al aceptar (router caído). La cuenta
  // ya existe y la cookie de sesión está puesta, así que usamos el self-service
  // /me/wireguard, que genera las claves server-side y devuelve el .conf.
  const retryWg = async () => {
    setRetrying(true);
    try {
      const r = await teamApi.provisionMyWireguard();
      setResult(prev => prev ? { ...prev, conf: r.conf ?? null, wgError: r.conf ? null : prev.wgError } : prev);
    } catch (err) {
      setResult(prev => prev ? { ...prev, wgError: { code: 'PROVISION_FAILED', message: err instanceof Error ? err.message : 'El router sigue sin responder. Reinténtalo en unos segundos.' } } : prev);
    } finally { setRetrying(false); }
  };

  const conf = result?.conf || '';

  // Genera el QR del .conf en cuanto está disponible, mismo patrón que
  // MemberWireGuardModal. WireGuard móvil (iOS/Android) escanea el .conf
  // completo como QR sin transformación adicional.
  useEffect(() => {
    if (!conf) { setQr(null); return; }
    let cancelled = false;
    setQr(null);

    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(conf, { margin: 1, width: 220 }))
      .then(dataUrl => { if (!cancelled) setQr(dataUrl); })
      .catch(() => { if (!cancelled) setQr(null); });

    return () => { cancelled = true; };
  }, [conf]);

  const downloadConf = () => {
    if (!conf) return;
    // octet-stream (no text/plain): evita que el navegador añada ".txt" al .conf.
    const blob = new Blob([conf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wireguard.conf';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div className="relative min-h-[100svh] overflow-x-clip bg-slate-50 flex items-center justify-center p-4 dark:bg-slate-950">
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-100 rounded-full -translate-x-1/2 -translate-y-1/2 opacity-60 blur-3xl pointer-events-none dark:bg-indigo-500/20 dark:opacity-30" />
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-200 overflow-hidden dark:bg-slate-900 dark:border-slate-800 dark:shadow-black/40">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-8 pt-10 pb-12">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 p-2.5 rounded-xl"><Mail className="w-6 h-6 text-white" /></div>
              <div>
                <h1 className="text-2xl font-bold text-white">Aceptar invitación</h1>
                <p className="text-indigo-200 text-sm">Únete al equipo con tu código</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-8 -mt-4 relative">
            {result ? (
              <div role="status" aria-live="polite" className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center dark:bg-emerald-500/15"><Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /></div>
                  <p className="text-sm font-bold text-slate-700">¡Listo, {result.user.email}!</p>
                </div>
                {result.tunnel && (
                  <p className="text-sm text-slate-600 flex items-center gap-2">
                    <Router className="w-4 h-4 text-indigo-500" /> Túnel asignado:
                    <span className="badge badge-info font-mono">{result.tunnel}</span>
                  </p>
                )}
                {conf ? (
                  <>
                    <p className="text-2xs text-slate-500">
                      Tu configuración <strong>.conf</strong> está lista. Escanea el QR desde la app WireGuard
                      móvil, o pégala/impórtala manualmente:
                    </p>

                    {/* QR para WireGuard móvil */}
                    {qr ? (
                      <div className="flex flex-col items-center gap-2 py-2">
                        <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm dark:bg-slate-100 dark:border-slate-700">
                          <img src={qr} alt="QR de configuración WireGuard" width={220} height={220} className="block" />
                        </div>
                        <p className="text-2xs text-slate-500 flex items-center gap-1.5">
                          <Smartphone className="w-3 h-3" /> Escanea con WireGuard móvil (iOS / Android)
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-500 dark:text-slate-400" />
                      </div>
                    )}

                    <pre className="text-2xs font-mono bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre">{conf}</pre>
                    <div className="flex gap-2">
                      <button onClick={() => { navigator.clipboard.writeText(conf).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                        className="btn-outline px-3 py-1.5 text-xs flex items-center gap-1.5">
                        <Copy className="w-3.5 h-3.5" /> {copied ? 'Copiado' : 'Copiar'}
                      </button>
                      <button onClick={downloadConf} className="btn-outline px-3 py-1.5 text-xs flex items-center gap-1.5">
                        <Router className="w-3.5 h-3.5" /> Descargar .conf
                      </button>
                    </div>
                    <p className="text-2xs text-amber-600">⚠️ Guarda este archivo en un lugar seguro. La clave privada NO se mostrará de nuevo.</p>
                  </>
                ) : result.wg ? (
                  <p className="text-xs text-slate-500">Acceso WireGuard creado. Consulta los detalles en tu perfil.</p>
                ) : (
                  <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p role="alert" className="text-2xs text-amber-700 dark:text-amber-300">
                        {result.wgError?.message
                          || 'No se pudo crear tu acceso WireGuard ahora mismo. Tu cuenta quedó creada; reinténtalo.'}
                      </p>
                    </div>
                    <button onClick={retryWg} disabled={retrying}
                      className="btn-outline px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50">
                      {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      {retrying ? 'Generando…' : 'Reintentar acceso WireGuard'}
                    </button>
                  </div>
                )}
                <button
                  onClick={() => onLoggedIn({ user: result.user.email, role: result.user.role === 'MEMBER' ? 'viewer' : 'admin' })}
                  className="btn-primary btn-md w-full mt-2 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" /> Entrar al panel
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {error && <p id="invitation-error" role="alert" aria-live="assertive" className="text-sm text-rose-600 font-medium bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400">{error}</p>}
                <div>
                  <label htmlFor="invitation-email" className="block text-xs font-semibold text-slate-500 mb-2">Correo invitado</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <input id="invitation-email" name="email" type="email" required autoComplete="email" maxLength={255}
                      placeholder="tu@correo.com" value={email} onChange={e => setEmail(e.target.value)} className="input-field pl-10" />
                  </div>
                </div>
                <div>
                  <label htmlFor="invitation-otp" className="block text-xs font-semibold text-slate-500 mb-2">Código de invitación</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <input id="invitation-otp" name="otp" type="text" required inputMode="numeric" autoComplete="one-time-code"
                      pattern="[0-9]{6}" minLength={6} maxLength={6} aria-describedby="invitation-otp-help"
                      placeholder="Código de 6 dígitos" value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} className="input-field pl-10 font-mono tracking-widest" />
                  </div>
                  <p id="invitation-otp-help" className="mt-1 text-2xs text-slate-500 dark:text-slate-400">Ingresa los 6 dígitos recibidos.</p>
                </div>
                <div>
                  <label htmlFor="invitation-password" className="block text-xs font-semibold text-slate-500 mb-2">
                    Contraseña {passwordRequired ? '(obligatoria)' : '(solo para una cuenta nueva)'}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <input id="invitation-password" name="password" type="password" required={passwordRequired}
                      minLength={12} maxLength={128} autoComplete="new-password"
                      aria-describedby={`invitation-password-help${error ? ' invitation-error' : ''}`}
                      placeholder="Mínimo 12 caracteres" value={password} onChange={e => setPassword(e.target.value)} className="input-field pl-10" />
                  </div>
                  <p id="invitation-password-help" className="mt-1 text-2xs text-slate-500 dark:text-slate-400">Si ya tienes cuenta, puedes dejarla vacía.</p>
                </div>
                <p className="text-2xs text-slate-500 dark:text-slate-400">Al aceptar, generaremos tu configuración WireGuard lista para usar.</p>
                <button type="submit" disabled={busy || !email.trim() || otp.length !== 6 || (password.length > 0 && password.length < 12) || (passwordRequired && !password)}
                  className="btn-primary btn-md w-full flex items-center justify-center">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Aceptar y unirme
                </button>
              </form>
            )}

            <button type="button" onClick={onBack} className="w-full mt-4 text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a iniciar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
