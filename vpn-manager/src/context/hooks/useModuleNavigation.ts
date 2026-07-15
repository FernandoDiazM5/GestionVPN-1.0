import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LS_ACTIVE_MODULE } from '../constants';

export type ActiveModule = 'dashboard' | 'moderators' | 'nodes' | 'users' | 'team' | 'devices' | 'monitor' | 'settings';

const MODULE_ROUTES: Record<ActiveModule, string> = {
  dashboard: '/dashboard',
  moderators: '/moderators',
  nodes: '/nodes',
  users: '/team',
  team: '/team',
  devices: '/scan',
  monitor: '/monitor',
  settings: '/settings',
};

const ROUTE_MODULES = new Map<string, ActiveModule>([
  ['/dashboard', 'dashboard'],
  ['/moderators', 'moderators'],
  ['/nodes', 'nodes'],
  ['/users', 'team'],
  ['/team', 'team'],
  ['/devices', 'devices'],
  ['/scan', 'devices'],
  ['/monitor', 'monitor'],
  ['/settings', 'settings'],
]);

function storedModule(): ActiveModule {
  try {
    const value = localStorage.getItem(LS_ACTIVE_MODULE) as ActiveModule | null;
    if (value && value in MODULE_ROUTES) return value === 'users' ? 'team' : value;
  } catch { /* storage opcional */ }
  return 'nodes';
}

export function modulePath(module: ActiveModule): string {
  return MODULE_ROUTES[module];
}

export function useModuleNavigation(authenticated: boolean) {
  const location = useLocation();
  const navigate = useNavigate();
  const isNotFound = location.pathname !== '/' && !ROUTE_MODULES.has(location.pathname);

  const activeModule = useMemo<ActiveModule>(() => {
    return ROUTE_MODULES.get(location.pathname) ?? storedModule();
  }, [location.pathname]);

  useEffect(() => {
    if (isNotFound) return;
    if (!authenticated) {
      if (location.pathname !== '/') {
        navigate('/', { replace: true });
      } else {
        // Vite sirve la app bajo /GestionVPN-1.0/. React Router omite la barra
        // final al navegar a '/', y una recarga de /GestionVPN-1.0 muestra el
        // aviso de public base URL en vez del login.
        const publicRoot = import.meta.env.BASE_URL;
        if (window.location.pathname !== publicRoot) {
          window.history.replaceState(window.history.state, '', `${publicRoot}${location.search}`);
        }
      }
      return;
    }
    try { localStorage.setItem(LS_ACTIVE_MODULE, activeModule); } catch { /* storage opcional */ }

    const canonicalPath = modulePath(activeModule);
    if (location.pathname !== canonicalPath) {
      navigate({ pathname: canonicalPath, search: location.search }, { replace: true });
    }
  }, [activeModule, authenticated, isNotFound, location.pathname, location.search, navigate]);

  const setActiveModule = useCallback((module: ActiveModule) => {
    const next = module === 'users' ? 'team' : module;
    navigate(modulePath(next));
  }, [navigate]);

  return { activeModule, setActiveModule, isNotFound };
}
