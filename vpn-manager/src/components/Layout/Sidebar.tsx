import { useState, useEffect, useMemo } from 'react';
import {
  Radio, Cpu, Briefcase, Activity, Settings, LayoutDashboard, UserCog,
  LogOut, ChevronLeft, Menu, X, Wifi, Sun, Moon, ShieldCheck, BookOpenText,
} from 'lucide-react';
import { useVpn } from '../../context';
import { useWorkspaceSession } from '../../context/WorkspaceSession';
import { visibleModules, roleLabel, type ModuleId } from '../../utils/permissions';
import Drawer from '../Common/Drawer';
import { preloadModule } from '../../performance/moduleLoaders';
import { markNavigationStart } from '../../performance/navigationMetrics';
import JoinpointLogo from '../Common/JoinpointLogo';

interface NavItem {
  id: ModuleId;
  label: string;
  icon: typeof Radio;
}

interface NavGroup {
  category: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    category: 'Plataforma',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'moderators', label: 'Moderadores', icon: UserCog },
      { id: 'security', label: 'Seguridad', icon: ShieldCheck },
    ],
  },
  {
    category: 'Operación',
    items: [
      { id: 'nodes', label: 'Sitios', icon: Radio },
      { id: 'devices', label: 'Buscar equipos', icon: Cpu },
      { id: 'monitor', label: 'Estado de equipos', icon: Activity },
      { id: 'client-history', label: 'Grupos operativos', icon: BookOpenText },
    ],
  },
  {
    category: 'Cuenta',
    items: [
      // 'Workspace' unifica los antiguos "Usuarios" (WG peers) y "Equipo"
      // (miembros del workspace) en una sola vista con sub-tabs.
      { id: 'team', label: 'Mi equipo', icon: Briefcase },
      { id: 'settings', label: 'Configuración', icon: Settings },
    ],
  },
];

const LS_COLLAPSED = 'vpn_sidebar_collapsed';

export default function Sidebar() {
  const { activeModule, setActiveModule, credentials, handleLogout, darkMode, toggleDarkMode } = useVpn();
  const { session } = useWorkspaceSession();

  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(LS_COLLAPSED) === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(LS_COLLAPSED, String(collapsed));
  }, [collapsed]);

  // Módulos visibles según la sesión (rol + plataforma)
  const visible = useMemo(() => visibleModules(session), [session]);
  const profileName = session?.name?.trim()
    || session?.email?.split('@')[0]
    || credentials?.user
    || 'Usuario';
  const profileEmail = session?.email || credentials?.user || '';

  // Si el módulo activo no es visible para este rol, salta al primero permitido
  useEffect(() => {
    if (session && !visible.includes(activeModule as ModuleId)) {
      setActiveModule(visible[0] as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeModule]);

  useEffect(() => {
    const likelyNext = (['nodes', 'devices'] as ModuleId[])
      .filter(id => id !== activeModule && visible.includes(id));
    if (likelyNext.length === 0) return undefined;

    const preloadLikelyNext = () => {
      likelyNext.forEach(id => preloadModule(id, !!session?.platform_admin));
    };
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preloadLikelyNext, { timeout: 2_000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timerId = setTimeout(preloadLikelyNext, 1_500);
    return () => clearTimeout(timerId);
  }, [activeModule, session?.platform_admin, visible]);

  const handleNav = (id: ModuleId) => {
    if (id !== activeModule) markNavigationStart(id);
    setActiveModule(id as never);
    setMobileOpen(false);
  };

  const prepareModule = (id: ModuleId) => {
    if (!visible.includes(id)) return;
    preloadModule(id, !!session?.platform_admin);
  };

  /** Cuerpo del sidebar. `mini` = modo icono (solo desktop colapsado). */
  const renderBody = (mini: boolean) => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 dark:bg-slate-900 dark:border-slate-800">
      {/* ── Cabecera: logo + colapsar ── */}
      <div className={`flex items-center gap-3 px-4 py-4 border-b border-slate-100 dark:border-slate-800 ${mini ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <JoinpointLogo className="h-9 w-9 shrink-0 drop-shadow-sm" />
          {!mini && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-none truncate">
                JOINPOINT <span className="text-indigo-600 dark:text-indigo-400">NOC</span>
              </h1>
              <p className="text-2xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Tu red, bajo control</p>
            </div>
          )}
        </div>
        {!mini && (
          <button
            onClick={() => setCollapsed(true)}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors dark:hover:text-slate-200 dark:hover:bg-slate-800"
            title="Colapsar menú" aria-label="Colapsar menú"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Navegación por categorías ── */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {NAV.map(group => {
          const items = group.items.filter(it => visible.includes(it.id));
          if (items.length === 0) return null;
          return (
            <div key={group.category}>
              {!mini && (
                <p className="px-5 mb-1.5 text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                  {group.category}
                </p>
              )}
              <div className="px-3 space-y-0.5">
                {items.map(item => {
                  const active = activeModule === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNav(item.id)}
                      onPointerEnter={() => prepareModule(item.id)}
                      onFocus={() => prepareModule(item.id)}
                      onTouchStart={() => prepareModule(item.id)}
                      title={mini ? item.label : undefined}
                      aria-label={item.label}
                      className={`relative w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all
                        ${mini ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
                        ${active
                          ? 'bg-indigo-100 text-indigo-800 shadow-sm ring-1 ring-inset ring-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-200 dark:ring-indigo-400/30'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800'}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      {active && (
                        <span className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-indigo-600 dark:bg-indigo-300" />
                      )}
                      <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-indigo-600 dark:text-indigo-400' : ''}`} />
                      {!mini && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Footer: usuario + tema + salir ── */}
      <div className="border-t border-slate-100 dark:border-slate-800 p-3 space-y-2">
        <div
          className={`flex items-center gap-2.5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 ${mini ? 'p-2 justify-center' : 'px-3 py-2.5'}`}
          title={profileEmail}
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
            <Wifi className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          {!mini && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate leading-none">{profileName}</p>
              <p className="text-2xs font-medium text-slate-500 dark:text-slate-400 mt-1">{roleLabel(session) || credentials?.role}</p>
            </div>
          )}
        </div>

        <div className={`flex items-center gap-2 ${mini ? 'flex-col' : ''}`}>
          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
            aria-label={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>

          <button
            onClick={handleLogout}
            title={mini ? 'Cerrar sesión' : undefined}
            aria-label="Cerrar sesión"
            className={`flex h-11 items-center gap-2.5 rounded-xl text-sm font-semibold text-slate-500
              hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors
              dark:text-slate-400 dark:hover:text-rose-400
              ${mini ? 'w-11 justify-center' : 'flex-1 px-3'}`}
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            {!mini && <span>Cerrar sesión</span>}
          </button>
        </div>

        {/* Expandir (solo visible colapsado) */}
        {mini && (
          <button
            onClick={() => setCollapsed(false)}
            className="hidden lg:flex w-full justify-center p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors dark:hover:text-slate-200 dark:hover:bg-slate-800"
            title="Expandir menú" aria-label="Expandir menú"
          >
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* ── Barra superior móvil ── */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur-xl border-b border-slate-200 dark:bg-slate-900/95 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <JoinpointLogo className="h-9 w-9 drop-shadow-sm" />
          <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            JOINPOINT <span className="text-indigo-600 dark:text-indigo-400">NOC</span>
          </h1>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* ── Sidebar desktop ── */}
      <aside className={`hidden lg:flex flex-col sticky top-0 h-screen shrink-0 transition-all duration-200 ${collapsed ? 'w-[76px]' : 'w-64'}`}>
        {renderBody(collapsed)}
      </aside>

      {/* ── Drawer móvil (siempre expandido) ── */}
      {mobileOpen && (
        <Drawer
          title="Navegación principal"
          onClose={() => setMobileOpen(false)}
          overlayClassName="lg:hidden fixed inset-0 z-50 flex bg-slate-900/50 backdrop-blur-sm anim-fade-in"
        >
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-4 right-3 z-10 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Cerrar menú"
          >
            <X className="w-4 h-4" />
          </button>
          {renderBody(false)}
        </Drawer>
      )}
    </>
  );
}
