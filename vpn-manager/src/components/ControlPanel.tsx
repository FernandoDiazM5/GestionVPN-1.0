import { useEffect, useRef, useState } from 'react';
import { Activity, Loader2, LayoutGrid, RefreshCw } from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { ActiveSession } from '../types/api';
import VpnCard from './VpnCard';
import NodeProvisionForm from './NodeProvisionForm';

const POLL_INTERVAL_MS = 30_000;

export default function ControlPanel() {
  const { credentials, managedVpns, setManagedVpns } = useVpn();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const performSyncRef = useRef<(isInitial: boolean) => Promise<void>>(undefined);

  useEffect(() => {
    performSyncRef.current = async (isInitial: boolean) => {
      if (!credentials || managedVpns.length === 0) return;
      if (isInitial) setIsSyncing(true);
      setSyncError('');
      try {
        const res = await fetchWithTimeout('http://localhost:3001/api/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass }),
        });
        if (!res.ok) throw new Error(`Backend respondió ${res.status}`);
        const activeList: ActiveSession[] = await res.json();

        setManagedVpns((prev) =>
          prev.map((vpn) => {
            const session = Array.isArray(activeList) && activeList.find((a) => a.name === vpn.name);
            return {
              ...vpn,
              running: !!session,
              ip: session ? session.address : undefined,
              uptime: session ? session.uptime : undefined,
            };
          }),
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

  const activeCount = managedVpns.filter((v) => v.running).length;

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

      {/* Stats bar */}
      <div className="card p-4 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-semibold text-slate-700">
              <span className="text-emerald-600">{activeCount}</span>
              <span className="text-slate-400"> / </span>
              <span>{managedVpns.length}</span>
              <span className="text-slate-500 font-normal ml-1">túneles activos</span>
            </span>
          </div>
          {lastSync && (
            <span className="text-xs text-slate-400 hidden sm:block">
              Sync {lastSync.toLocaleTimeString()}
            </span>
          )}
        </div>

        {isSyncing ? (
          <div className="flex items-center space-x-2 text-indigo-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-medium">Sincronizando...</span>
          </div>
        ) : (
          <button
            onClick={() => performSyncRef.current?.(true)}
            className="btn-ghost p-2 flex items-center space-x-1.5 text-xs font-semibold"
            title="Sincronizar ahora"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        )}
      </div>

      {/* Error */}
      {syncError && !isSyncing && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-center space-x-3">
          <Activity className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-sm text-amber-700 font-medium">{syncError}</span>
        </div>
      )}

      {/* Grid de cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {managedVpns.map((vpn) => (
          <VpnCard
            key={vpn.id}
            vpn={vpn}
            onUpdate={(updated) =>
              setManagedVpns((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
            }
            onRemove={() => setManagedVpns((prev) => prev.filter((v) => v.id !== vpn.id))}
          />
        ))}
      </div>
    </div>
  );
}
