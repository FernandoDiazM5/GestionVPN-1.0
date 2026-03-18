import { useEffect, useRef, useState } from 'react';
import { Activity, Loader2, LayoutGrid, RefreshCw, Search, X } from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { ActiveSession } from '../types/api';
import VpnCard from './VpnCard';
import NodeProvisionForm from './NodeProvisionForm';
import { API_BASE_URL } from '../config';

const POLL_INTERVAL_MS = 30_000;

export default function ControlPanel() {
  const { credentials, managedVpns, setManagedVpns } = useVpn();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [search, setSearch] = useState('');

  const performSyncRef = useRef<(isInitial: boolean) => Promise<void>>(undefined);

  useEffect(() => {
    performSyncRef.current = async (isInitial: boolean) => {
      if (!credentials || managedVpns.length === 0) return;
      if (isInitial) setIsSyncing(true);
      setSyncError('');
      try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/api/active`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
        });
        if (!res.ok) throw new Error(`Backend respondió ${res.status}`);
        const activeList: ActiveSession[] = await res.json();
        setManagedVpns(prev =>
          prev.map(vpn => {
            const session = Array.isArray(activeList) && activeList.find(a => a.name === vpn.name);
            return { ...vpn, running: !!session, ip: session ? session.address : undefined, uptime: session ? session.uptime : undefined };
          })
        );
        setLastSync(new Date());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        if (isInitial) setSyncError(msg);
      } finally {
        if (isInitial) setIsSyncing(false);
      }
    };
  });

  useEffect(() => {
    performSyncRef.current?.(true);
    const id = setInterval(() => performSyncRef.current?.(false), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const activeCount = managedVpns.filter(v => v.running).length;
  const q = search.trim().toLowerCase();
  const filteredVpns = q
    ? managedVpns.filter(v =>
      v.name?.toLowerCase().includes(q) ||
      v.service?.toLowerCase().includes(q) ||
      v.profile?.toLowerCase().includes(q) ||
      v.ip?.toLowerCase().includes(q)
    )
    : managedVpns;

  if (managedVpns.length === 0) {
    return (
      <div className="space-y-5">
        <NodeProvisionForm />
        <div className="card py-20 flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
            <LayoutGrid className="w-8 h-8 text-slate-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-700">Sin túneles en gestión</h2>
            <p className="text-slate-400 text-sm mt-1 max-w-xs">
              Ve al Escáner PPP, selecciona los secretos que quieres gestionar y aparecerán aquí.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Provisionar nuevo nodo */}
      <NodeProvisionForm />

      {/* Error */}
      {syncError && !isSyncing && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-center space-x-3">
          <Activity className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-sm text-amber-700 font-medium">{syncError}</span>
        </div>
      )}

      {/* Tabla */}
      <div className="card overflow-hidden">

        {/* Barra superior: stats + búsqueda + sync */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">

          {/* Stats + sync */}
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-700">
                <span className="text-emerald-600">{activeCount}</span>
                <span className="text-slate-400"> / </span>
                <span>{managedVpns.length}</span>
                <span className="text-slate-500 font-normal ml-1">túneles activos</span>
              </span>
            </div>
            {lastSync && (
              <span className="text-slate-400 hidden sm:block font-mono">
                sync {lastSync.toLocaleTimeString()}
              </span>
            )}
            {isSyncing ? (
              <div className="flex items-center gap-1.5 text-indigo-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="font-medium">Sincronizando...</span>
              </div>
            ) : (
              <button
                onClick={() => performSyncRef.current?.(true)}
                className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 font-semibold transition-colors"
                title="Sincronizar ahora"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Actualizar</span>
              </button>
            )}
          </div>

          {/* Búsqueda */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar nombre, servicio, IP…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 text-xs rounded-xl border border-slate-200
                         bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                         placeholder:text-slate-400 text-slate-700"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/40">
                <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider w-8">#</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Servicio</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Perfil</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">IP Asignada</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">Uptime</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredVpns.map((vpn, idx) => (
                <VpnCard
                  key={vpn.id}
                  vpn={vpn}
                  rowIndex={idx}
                  onUpdate={updated => setManagedVpns(prev => prev.map(v => v.id === updated.id ? updated : v))}
                  onRemove={() => setManagedVpns(prev => prev.filter(v => v.id !== vpn.id))}
                />
              ))}
              {filteredVpns.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Sin resultados para <span className="font-mono font-bold">"{search}"</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
