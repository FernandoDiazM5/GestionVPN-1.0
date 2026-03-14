import { useState } from 'react';
import { Router, Lock, User, Server, Cpu, Activity, Globe } from 'lucide-react';
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
        15_000, // 15s para handshake inicial
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
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Fondo ambiental */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_10%,transparent_100%)]" />
      </div>

      <div className="w-full max-w-md p-8 relative z-10">
        {/* Logo / Header */}
        <div className="flex flex-col items-center justify-center mb-10">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-30 rounded-full animate-pulse" />
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 p-4 rounded-2xl relative shadow-2xl">
              <Router className="w-10 h-10 text-indigo-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mt-6">
            MikroTik<span className="text-indigo-400">Core</span>
          </h1>
          <p className="text-slate-400 mt-2 font-medium flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>VPN Tunnel Manager</span>
          </p>
        </div>

        {/* Formulario */}
        <div className="relative glassmorphism-dark rounded-3xl p-8 transition-all duration-500 hover:shadow-indigo-500/10 hover:border-indigo-500/30">
          {/* Overlay handshake */}
          {syncStatus === 'handshake' && (
            <div className="absolute inset-0 z-20 bg-slate-900/90 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center animate-in fade-in duration-300">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <Globe className="w-6 h-6 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <h3 className="text-white font-bold tracking-widest mt-6 animate-pulse">
                ESTABLECIENDO HANDSHAKE
              </h3>
              <p className="console-text text-indigo-400 mt-2">Petición Real REST API v7.x</p>
            </div>
          )}

          {/* Overlay éxito */}
          {syncStatus === 'success' && (
            <div className="absolute inset-0 z-20 bg-emerald-950/90 backdrop-blur-sm rounded-3xl border border-emerald-500/30 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
              <div className="bg-emerald-500/20 p-4 rounded-full">
                <Server className="w-12 h-12 text-emerald-400" />
              </div>
              <h3 className="text-emerald-400 font-bold text-xl tracking-widest mt-6">
                SINCRONIZACIÓN EXITOSA
              </h3>
              <p className="console-text text-emerald-500/70 mt-2">Conectado a {ip}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error banner */}
            {syncStatus === 'error' && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start space-x-3">
                <Cpu className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-rose-400 font-semibold text-sm">Error de Conexión</h4>
                  <p className="text-rose-400 text-xs mt-1">
                    {errorDetail || 'Verifica credenciales y que el backend en localhost:3001 esté activo.'}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Server className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Router IP/Host (ej. 192.168.88.1)"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-900/50 border border-slate-700/50 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono text-sm"
                />
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="API Username"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-900/50 border border-slate-700/50 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono text-sm"
                />
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <input
                  type="password"
                  placeholder="API Password (opcional)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-900/50 border border-slate-700/50 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isConnecting}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group flex items-center justify-center space-x-2"
            >
              <span>INICIAR CONEXIÓN REAL</span>
              <Activity className="w-5 h-5 group-hover:animate-pulse" />
            </button>
          </form>
        </div>

        <div className="text-center mt-8">
          <p className="console-text text-slate-600">v1.3.0 · MikroTik REST API (v7.1+)</p>
        </div>
      </div>
    </div>
  );
}
