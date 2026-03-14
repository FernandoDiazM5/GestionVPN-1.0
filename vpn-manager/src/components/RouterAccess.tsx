import { useState } from 'react';
import { Radio, Lock, User, Server, Globe, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { ConnectResponse } from '../types/api';

export default function RouterAccess() {
  const { handleLoginSuccess } = useVpn();
  const [ip, setIp] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'handshake' | 'success' | 'error'>('idle');
  const [errorDetail, setErrorDetail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip || !user) return;
    const targetIp = ip.trim();
    setIsConnecting(true);
    setSyncStatus('handshake');
    setErrorDetail('');
    try {
      const response = await fetchWithTimeout(
        'http://localhost:3001/api/connect',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: targetIp, user, pass: password }),
        },
        15_000,
      );
      const data: ConnectResponse = await response.json();
      if (response.ok && data.success) {
        setSyncStatus('success');
        setTimeout(() => handleLoginSuccess({ ip: targetIp, user, pass: password }), 1500);
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
                  <div className="flex items-start space-x-3 px-4 py-3 bg-red-50 rounded-xl border border-red-100">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-700">Error de conexión</p>
                      <p className="text-xs text-red-500 mt-0.5">{errorDetail}</p>
                    </div>
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
