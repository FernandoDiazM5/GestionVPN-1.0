import { useState, useEffect } from 'react';
import { LS_ACTIVE_MODULE } from '../constants';

type ActiveModule = 'nodes' | 'users' | 'team' | 'devices' | 'monitor' | 'settings';

export function useModuleNavigation() {
  const [activeModule, setActiveModule] = useState<ActiveModule>(() => {
    const stored = localStorage.getItem(LS_ACTIVE_MODULE);
    return (['nodes', 'users', 'team', 'devices', 'monitor', 'settings'].includes(stored ?? '') ? stored : 'nodes') as ActiveModule;
  });

  useEffect(() => {
    localStorage.setItem(LS_ACTIVE_MODULE, activeModule);
  }, [activeModule]);

  return {
    activeModule,
    setActiveModule,
  };
}
