import { useEffect, useRef } from 'react';
import { dbService, type VpnSecret, type RouterCredentials } from '../../store/db';
import type { NodeInfo } from '../../types/api';
import { DEBOUNCE_SAVE_MS } from '../constants';

interface ContextState {
  isAuthenticated: boolean;
  credentials?: RouterCredentials;
  managedVpns: VpnSecret[];
  scannedSecrets: VpnSecret[];
  activeNodeVrf: string | null;
  tunnelExpiry: number | null;
  nodes: NodeInfo[];
}

export function usePersistence(
  isReady: boolean,
  isLoggingOut: boolean,
  state: ContextState
) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const immediateSaveRef = useRef(false);

  // Cargar estado desde DB al montar
  useEffect(() => {
    const initApp = async () => {
      try {
        const store = await dbService.getStore();
        return store;
      } catch (err) {
        console.error('Error cargando DB', err);
        return null;
      }
    };
    initApp();
  }, []);

  // Persistir en DB cuando el estado cambie
  useEffect(() => {
    if (!isReady || isLoggingOut) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const delay = immediateSaveRef.current ? 0 : DEBOUNCE_SAVE_MS;
    immediateSaveRef.current = false;
    saveTimerRef.current = setTimeout(() => {
      dbService.saveStore(state);
    }, delay);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state, isReady, isLoggingOut]);

  return { saveTimerRef, immediateSaveRef };
}
