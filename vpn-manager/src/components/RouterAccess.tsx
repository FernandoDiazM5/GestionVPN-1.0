import { useState } from 'react';
import { Radio, Lock, User, Server, Globe, CheckCircle, AlertCircle, Loader2, Stethoscope } from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { ConnectResponse } from '../types/api';
import { API_BASE_URL } from '../config';

interface DiagStep { port: number; open: boolean; reason?: string; }
interface DiagResult { steps: DiagStep[]; authOk: boolean; authMsg: string; apiReachable: boolean; }

export default function RouterAccess() {
  const { handleLoginSuccess } = useVpn();
  const [ip, setIp] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'handshake' | 'success' | 'error'>('idle');
  const [errorDetail, setErrorDetail] = useState('');
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip || !user) return;
    const targetIp = ip.trim();
    setIsConnecting(true);
    setSyncStatus('handshake');
    setErrorDetail('');
    setDiagResult(null);
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: targetIp, user, pass: password }),
        },
        15_000,
      );
      // Hack tipado temporal si ConnectResponse no tiene token aún
      const data: any = await response.json();
      if (response.ok && data.success) {
        setSyncStatus('success');
        setTimeout(() => handleLoginSuccess({ ip: targetIp, user, pass: '', token: data.token }), 1500);
      } else {
        setErrorDetail(data.message ?? 'El router rechazó la conexión.');
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

  const handleDiagnose = async () => {
    if (!ip.trim()) return;
    setIsDiagnosing(true);
    setDiagResult(null);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: ip.trim(), user: user.trim(), pass: password }),
      }, 20_000);
      const d: DiagResult = await r.json();
      setDiagResult(d);
    } catch {
      setDiagResult({ steps: [], authOk: false, authMsg: 'No se pudo contactar el servidor backend', apiReachable: false });
    }
    setIsDiagnosing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">

      {/* Círculos decorativos de fondo */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-100 rounded-full -translate-x-1/2 -translate-y-1/2 opacity-60 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-100 rounded-full translate-x-1/2 translate-y-1/2 opacity-60 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Card principal */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-200 overflow-hidden">

          {/* Header del card */}
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-8 pt-10 pb-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="relative z-10">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm">
                  <Radio className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">MikroTikVPN</h1>
                  <p className="text-indigo-200 text-sm">Remote Core Manager</p>
                </div>
              </div>
              <p className="text-indigo-100 text-sm mt-2">
                Conecta tu router MikroTik para gestionar túneles VPN en tiempo real.
              </p>
            </div>
          </div>

          {/* Formulario */}
          <div className="px-8 py-8 -mt-4 relative">
            {syncStatus !== 'idle' && (
              <div className="mb-6">
                {syncStatus === 'handshake' && (
                  <div className="flex items-center space-x-3 px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100">
                    <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-indigo-700">Conectando al router...</p>
                      <p className="text-xs text-indigo-500">Estableciendo sesión API RouterOS</p>
                    </div>
                  </div>
                )}
                {syncStatus === 'success' && (
                  <div className="flex items-center space-x-3 px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-sm font-semibold text-emerald-700">¡Conexión exitosa! Redirigiendo...</p>
                  </div>
                )}
                {syncStatus === 'error' && (
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 px-4 py-3 bg-red-50 rounded-xl border border-red-100">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-red-700">Error de conexión</p>
                        <p className="text-xs text-red-500 mt-0.5">{errorDetail}</p>
                        {(errorDetail.toLowerCase().includes('agotado') || errorDetail.toLowerCase().includes('timed') || errorDetail.toLowerCase().includes('alcanzar')) && (
                          <p className="text-xs text-amber-600 mt-1.5 font-medium">⚠ Verifica que WireGuard esté activo en tu equipo</p>
                        )}
                      </div>
                    </div>
                    {/* Botón diagnóstico */}
                    <button
                      type="button"
                      onClick={handleDiagnose}
                      disabled={isDiagnosing || !ip.trim()}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      {isDiagnosing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />}
                      <span>{isDiagnosing ? 'Diagnosticando...' : 'Diagnosticar conectividad'}</span>
                    </button>
                    {/* Resultado del diagnóstico */}
                    {diagResult && (
                      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Resultado del diagnóstico</p>
                        {diagResult.steps.map(s => (
                          <div key={s.port} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${s.open ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${s.open ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span className="font-bold text-slate-700">Puerto {s.port}</span>
                            <span className={`ml-auto font-mono font-bold ${s.open ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {s.open ? 'ABIERTO' : `CERRADO (${s.reason || 'sin respuesta'})`}
                            </span>
                          </div>
                        ))}
                        {!diagResult.apiReachable && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 font-medium">
                            🔒 API no accesible — ¿WireGuard activo? La API MikroTik solo acepta conexiones desde la red VPN (192.168.21.x)
                          </p>
                        )}
                        {diagResult.apiReachable && (
                          <div className={`text-xs px-3 py-2 rounded-lg border font-medium ${diagResult.authOk ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                            {diagResult.authOk ? '✓ ' : '✗ '}{diagResult.authMsg}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  IP / Host del Router
                </label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="192.168.88.1"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    className="input-field pl-10 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Usuario API
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="admin"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    className="input-field pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Contraseña <span className="text-slate-400 normal-case font-normal">(opcional)</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isConnecting}
                className="btn-primary w-full py-3.5 flex items-center justify-center space-x-2 mt-4"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <Server className="w-4 h-4" />
                    <span>Conectar al Router</span>
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-6 font-mono">
              RouterOS API · Puerto 8728 / 8729
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
