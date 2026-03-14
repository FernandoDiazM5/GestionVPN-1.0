import { useEffect, useRef, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { ActiveSession } from '../types/api';
import VpnCard from './VpnCard';

const POLL_INTERVAL_MS = 30_000;

export default function ControlPanel() {
  const { credentials, managedVpns, setManagedVpns } = useVpn();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  // "Latest ref" pattern: siempre ejecuta la versión más reciente de performSync
  // sin provocar que el setInterval se reinicie con cada re-render.
  const performSyncRef = useRef<(isInitial: boolean) => Promise<void>>();

  useEffect(() => {
    performSyncRef.current = async (isInitial: boolean) => {
      if (!credentials || managedVpns.length === 0) return;
      if (isInitial) setIsSyncing(true);
      setSyncError('');
      try {
        const res = await fetchWithTimeout('http://localhost:3001/api/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: credentials.ip,
            user: credentials.user,
            pass: credentials.pass,
          }),
        });
        if (!res.ok) throw new Error(`Backend respondió ${res.status}`);
        const activeList: ActiveSession[] = await res.json();

        setManagedVpns((prev) =>
          prev.map((vpn) => {
            const session =
              Array.isArray(activeList) && activeList.find((a) => a.name === vpn.name);
            return {
              ...vpn,
              running: !!session,
              ip: session ? session.address : undefined,
              uptime: session ? session.uptime : undefined,
              // vpn.disabled no se toca — es un atributo del secreto, no de la sesión activa
            };
          }),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.error('Error sincronizando estado Live VPNs:', msg);
        if (isInitial) setSyncError(`No se pudo sincronizar con el router: ${msg}`);
      } finally {
        if (isInitial) setIsSyncing(false);
      }
    };
  }); // Sin deps → se actualiza en cada render con closures frescas

  // Sync inicial + polling cada 30s
  useEffect(() => {
    performSyncRef.current?.(true);
    const id = setInterval(() => performSyncRef.current?.(false), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []); // Solo en mount

  if (managedVpns.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 p-6 text-center">
        <div className="bg-slate-200 dark:bg-slate-800 p-6 rounded-full mb-6">
          <Activity className="w-16 h-16 text-slate-400 dark:text-slate-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-300">
          Ningún túnel en gestión
        </h2>
        <p className="mt-2 max-w-md text-sm">
          Dirígete al módulo "Escáner PPP" para importar secretos del Router y comenzar a
          administrarlos aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Banner de sincronización inicial */}
      {isSyncing && (
        <div className="flex items-center space-x-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl px-5 py-3 text-indigo-700 dark:text-indigo-300 text-sm font-semibold animate-in fade-in duration-300">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>Sincronizando estado en tiempo real con el router...</span>
        </div>
      )}
      {syncError && !isSyncing && (
        <div className="flex items-center space-x-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-3 text-amber-700 dark:text-amber-300 text-sm font-semibold animate-in fade-in duration-300">
          <Activity className="w-4 h-4 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in zoom-in-95 duration-500">
        {managedVpns.map((vpn) => (
          <VpnCard
            key={vpn.id}
            vpn={vpn}
            onUpdate={(updated) =>
              setManagedVpns((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
            }
            onRemove={() =>
              setManagedVpns((prev) => prev.filter((v) => v.id !== vpn.id))
            }
          />
        ))}
      </div>
    </div>
  );
}
