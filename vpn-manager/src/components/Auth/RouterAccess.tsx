import { useState, useEffect } from 'react';
import { Radio, Lock, User, Server, ShieldCheck, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

import { API_BASE_URL } from '../config';

export default function RouterAccess() {
  const { handleLoginSuccess } = useVpn();
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        },
        15_000,
      );
      
      const data: any = await response.json();
      if (response.ok && data.success) {
        setSyncStatus('success');
        setTimeout(() => handleLoginSuccess({ 
            user: data.user, 
            token: data.token,
            role: data.role
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

  if (needsSetup === null) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
           <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">

      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-100 rounded-full -translate-x-1/2 -translate-y-1/2 opacity-60 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-100 rounded-full translate-x-1/2 translate-y-1/2 opacity-60 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-200 overflow-hidden">

          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-8 pt-10 pb-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="relative z-10">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm">
                  {needsSetup ? <ShieldCheck className="w-6 h-6 text-white" /> : <Radio className="w-6 h-6 text-white" />}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">MikroTikVPN</h1>
                  <p className="text-indigo-200 text-sm">{needsSetup ? 'Configuración Inicial' : 'Remote Core Manager'}</p>
                </div>
              </div>
              <p className="text-indigo-100 text-sm mt-2">
                {needsSetup ? 'Cree la cuenta administrativa maestra para acceder al sistema de gestión.' : 'Inicie sesión con su cuenta para acceder al panel.'}
              </p>
            </div>
          </div>

          <div className="px-8 py-8 -mt-4 relative">
            {syncStatus !== 'idle' && (
              <div className="mb-6">
                {syncStatus === 'loading' && (
                  <div className="flex items-center space-x-3 px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100">
                    <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-indigo-700">Autenticando...</p>
                    </div>
                  </div>
                )}
                {syncStatus === 'success' && (
                  <div className="flex items-center space-x-3 px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-sm font-semibold text-emerald-700">¡Conexión exitosa! Entrando...</p>
                  </div>
                )}
                {syncStatus === 'error' && (
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 px-4 py-3 bg-red-50 rounded-xl border border-red-100">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-red-700">Error de conexión</p>
                        <p className="text-xs text-red-500 mt-0.5">{errorDetail}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Usuario {needsSetup && 'Administrador'}
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder={needsSetup ? "admin" : "juan_soporte"}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input-field pl-10 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isConnecting || !username || !password}
                className="w-full relative flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-xl font-semibold text-sm transition-all focus:ring-4 focus:ring-indigo-100 disabled:opacity-70 disabled:cursor-not-allowed group overflow-hidden mt-6"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <Server className="w-4 h-4 relative z-10" />
                <span className="relative z-10">
                    {needsSetup ? 'Crear Cuenta Administrador' : 'Iniciar Sesión'}
                </span>
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 font-medium mt-6">
          Microservicios encriptados AES-256-GCM.
        </p>
      </div>
    </div>
  );
}
