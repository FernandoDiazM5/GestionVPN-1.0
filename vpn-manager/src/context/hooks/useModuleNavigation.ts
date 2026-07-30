import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SessionUser } from '../../types/account';
import { LS_ACTIVE_MODULE } from '../constants';

export type ActiveModule = 'dashboard' | 'moderators' | 'nodes' | 'users' | 'team' | 'devices' | 'monitor' | 'settings';

const MODULE_SEGMENTS: Record<ActiveModule, string> = {
  dashboard: 'dashboard',
  moderators: 'moderators',
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
  const wrongWorkspace = parsed.kind === 'workspace'
    && !!workspaceSlug
    && parsed.slug !== workspaceSlug;
  const isNotFound = authenticated
    && !sessionLoading
    && (!!session && (parsed.kind === 'unknown' || wrongWorkspace));

  useEffect(() => {
    if (!authenticated || sessionLoading || !session || !workspaceSlug || isNotFound) return;

    try { localStorage.setItem(LS_ACTIVE_MODULE, activeModule); } catch { /* storage opcional */ }

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
