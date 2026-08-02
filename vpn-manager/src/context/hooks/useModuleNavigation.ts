import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { SessionUser } from '../../types/account';
import { LS_ACTIVE_MODULE } from '../constants';

export type ActiveModule = 'dashboard' | 'moderators' | 'security' | 'nodes' | 'users' | 'team' | 'devices' | 'monitor' | 'settings';

const MODULE_SEGMENTS: Record<ActiveModule, string> = {
  dashboard: 'dashboard',
  moderators: 'moderators',
  security: 'security',
  nodes: 'nodes',
  users: 'team',
  team: 'team',
  devices: 'scan',
  monitor: 'monitor',
  settings: 'settings',
};

const SEGMENT_MODULES = new Map<string, ActiveModule>([
  ['dashboard', 'dashboard'],
  ['moderators', 'moderators'],
  ['security', 'security'],
  ['nodes', 'nodes'],
  ['users', 'team'],
  ['team', 'team'],
  ['devices', 'devices'],
  ['scan', 'devices'],
  ['monitor', 'monitor'],
  ['settings', 'settings'],
]);

interface ParsedRoute {
  kind: 'root' | 'workspace' | 'legacy-module' | 'unknown';
  slug?: string;
  module?: ActiveModule;
}

function parseRoute(pathname: string): ParsedRoute {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return { kind: 'root' };

  if (segments[0] === 'GestionVPN-1.0') {
    if (segments.length === 1) return { kind: 'root' };
    if (segments.length === 2) {
      const legacyModule = SEGMENT_MODULES.get(segments[1]);
      return legacyModule
        ? { kind: 'legacy-module', module: legacyModule }
        : { kind: 'unknown' };
    }
    return { kind: 'unknown' };
  }

  if (segments.length === 1) {
    const legacyModule = SEGMENT_MODULES.get(segments[0]);
    return legacyModule
      ? { kind: 'legacy-module', module: legacyModule }
      : { kind: 'unknown' };
  }

  if (segments[0] !== 'dm' || segments.length > 3) return { kind: 'unknown' };
  const module = segments[2] ? SEGMENT_MODULES.get(segments[2]) : undefined;
  if (segments[2] && !module) return { kind: 'unknown' };
  return { kind: 'workspace', slug: segments[1], module };
}

function storedModule(): ActiveModule {
  try {
    const value = localStorage.getItem(LS_ACTIVE_MODULE) as ActiveModule | null;
    if (value && value in MODULE_SEGMENTS) return value === 'users' ? 'team' : value;
  } catch { /* storage opcional */ }
  return 'nodes';
}

export function modulePath(module: ActiveModule, workspaceSlug?: string): string {
  const segment = MODULE_SEGMENTS[module];
  return workspaceSlug ? `/dm/${workspaceSlug}/${segment}` : `/${segment}`;
}

export function useModuleNavigation(
  authenticated: boolean,
  session: SessionUser | null,
  sessionLoading: boolean,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = useMemo(() => parseRoute(location.pathname), [location.pathname]);
  const activeModule = parsed.module ?? storedModule();
  const workspaceSlug = session?.workspace_slug;
  const isNotFound = authenticated
    && !sessionLoading
    && !!session
    && parsed.kind === 'unknown';

  useEffect(() => {
    if (!authenticated || sessionLoading || !session || !workspaceSlug || isNotFound) return;

    try { localStorage.setItem(LS_ACTIVE_MODULE, activeModule); } catch { /* storage opcional */ }

    // El slug de la URL es solo navegacion, nunca una fuente de autorizacion.
    // Una URL guardada con un slug anterior se autocorrige al workspace que
    // el servidor ya autorizo en la sesion, conservando el modulo solicitado.
    const canonicalPath = modulePath(activeModule, workspaceSlug);
    if (location.pathname !== canonicalPath) {
      navigate({ pathname: canonicalPath, search: location.search }, { replace: true });
    }
  }, [
    activeModule,
    authenticated,
    isNotFound,
    location.pathname,
    location.search,
    navigate,
    session,
    sessionLoading,
    workspaceSlug,
  ]);

  const setActiveModule = useCallback((module: ActiveModule) => {
    const next = module === 'users' ? 'team' : module;
    navigate(modulePath(next, workspaceSlug));
  }, [navigate, workspaceSlug]);

  return { activeModule, setActiveModule, isNotFound };
}
