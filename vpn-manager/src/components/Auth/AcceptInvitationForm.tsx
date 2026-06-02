import { useState } from 'react';
import { Mail, KeyRound, Lock, ArrowLeft, Loader2, Check, Copy, Router, ShieldCheck } from 'lucide-react';
import { teamApi } from '../../services/teamApi';
import type { RouterCredentials } from '../../store/db';
import type { WgServerConfig } from '../../types/account';

/**
 * Pantalla pública para aceptar una invitación con código (OTP) — para personas
 * nuevas sin cuenta. Recoge email + código + clave + (opcional) clave pública WG.
 * Al aceptar, el backend crea la cuenta, asigna el túnel y provisiona WireGuard;
 * aquí mostramos los datos del servidor para completar el .conf en el dispositivo.
 */
export default function AcceptInvitationForm({
  onBack, onLoggedIn,
}: { onBack: () => void; onLoggedIn: (creds: RouterCredentials) => void }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ user: { email: string; role: string }; tunnel: string | null; wg: WgServerConfig | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await teamApi.accept(email.trim(), otp.trim(), password || undefined, name.trim() || undefined, publicKey.trim() || undefined);
      setResult({ user: r.user, tunnel: r.tunnel, wg: r.wireguard });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aceptar la invitación');
    } finally { setBusy(false); }
  };

  const confTemplate = result?.wg
    ? `[Interface]\nPrivateKey = <TU CLAVE PRIVADA>\nAddress = ${result.wg.allowedIp}/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = ${result.wg.serverPublicKey}\nEndpoint = ${result.wg.endpoint}\nAllowedIPs = ${result.wg.allowedIps}\nPersistentKeepalive = 25`
    : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-100 rounded-full -translate-x-1/2 -translate-y-1/2 opacity-60 blur-3xl pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-200 overflow-hidden">
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
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center"><Check className="w-4 h-4 text-emerald-600" /></div>
                  <p className="text-sm font-bold text-slate-700">¡Listo, {result.user.email}!</p>
                </div>
                {result.tunnel && (
                  <p className="text-sm text-slate-600 flex items-center gap-2">
                    <Router className="w-4 h-4 text-indigo-500" /> Túnel asignado:
                    <span className="badge badge-info font-mono">{result.tunnel}</span>
                  </p>
                )}
                {result.wg ? (
                  <>
                    <p className="text-2xs text-slate-500">Completa este <strong>.conf</strong> en tu app WireGuard con <strong>tu clave privada</strong>:</p>
                    <pre className="text-2xs font-mono bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre">{confTemplate}</pre>
                    <button onClick={() => { navigator.clipboard.writeText(confTemplate).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                      className="btn-outline px-3 py-1.5 text-xs flex items-center gap-1.5">
                      <Copy className="w-3.5 h-3.5" /> {copied ? 'Copiado' : 'Copiar configuración'}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-amber-600">Acceso WireGuard pendiente (sin clave pública o router no disponible). Lo verás en tu perfil al entrar.</p>
                )}
                <button
                  onClick={() => onLoggedIn({ user: result.user.email, token: '', role: result.user.role === 'MEMBER' ? 'viewer' : 'admin' })}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold text-sm mt-2 flex items-center justify-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Entrar al panel
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {error && <p className="text-sm text-rose-600 font-medium bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="email" required placeholder="Tu correo invitado" value={email} onChange={e => setEmail(e.target.value)} className="input-field pl-10" />
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input required inputMode="numeric" maxLength={6} placeholder="Código de 6 dígitos" value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} className="input-field pl-10 font-mono tracking-widest" />
                </div>
                <input placeholder="Tu nombre (opcional)" value={name} onChange={e => setName(e.target.value)} className="input-field" />
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="password" placeholder="Crea tu contraseña (mín. 8)" value={password} onChange={e => setPassword(e.target.value)} className="input-field pl-10" />
                </div>
                <div className="relative">
                  <Router className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input placeholder="Clave pública WireGuard (opcional)" value={publicKey} onChange={e => setPublicKey(e.target.value)} className="input-field pl-10 font-mono text-xs" />
                </div>
                <p className="text-2xs text-slate-400">Genera el par de claves en tu app WireGuard y pega aquí solo la <strong>pública</strong>. La privada nunca se envía.</p>
                <button type="submit" disabled={busy || !email.trim() || otp.length !== 6}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Aceptar y unirme
                </button>
              </form>
            )}

            <button onClick={onBack} className="w-full mt-4 text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a iniciar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
