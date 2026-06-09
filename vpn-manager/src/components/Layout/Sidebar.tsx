import { useState, useEffect } from 'react';
import {
  Radio, Cpu, Users, Briefcase, Activity, Settings, LayoutDashboard, UserCog,
  LogOut, ChevronLeft, Menu, X, Wifi, Server, Sun, Moon,
} from 'lucide-react';
import { useVpn } from '../../context';
import { useWorkspaceSession } from '../../context/WorkspaceSession';
import { visibleModules, type ModuleId } from '../../utils/permissions';

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
    ],
  },
  {
    category: 'Red',
    items: [
      { id: 'nodes', label: 'Nodos', icon: Radio },
      { id: 'devices', label: 'Escanear', icon: Cpu },
    ],
  },
  {
    category: 'Acceso',
    items: [
      { id: 'users', label: 'Usuarios', icon: Users },
      { id: 'team', label: 'Equipo', icon: Briefcase },
    ],
  },
  {
    category: 'Monitoreo',
    items: [
      { id: 'monitor', label: 'Monitor AP', icon: Activity },
    ],
  },
  {
    category: 'Sistema',
    items: [
      { id: 'settings', label: 'Ajustes', icon: Settings },
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
  const visible = visibleModules(session);

  // Si el módulo activo no es visible para este rol, salta al primero permitido
  useEffect(() => {
    if (session && !visible.includes(activeModule as ModuleId)) {
      setActiveModule(visible[0] as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeModule]);

  const handleNav = (id: ModuleId) => {
    setActiveModule(id as never);
    setMobileOpen(false);
  };

  /** Cuerpo del sidebar. `mini` = modo icono (solo desktop colapsado). */
  const renderBody = (mini: boolean) => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 dark:bg-slate-900 dark:border-slate-800">
      {/* ── Cabecera: logo + colapsar ── */}
      <div className={`flex items-center gap-3 px-4 py-4 border-b border-slate-100 dark:border-slate-800 ${mini ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-2 rounded-xl shadow-md shadow-indigo-500/25 shrink-0">
            <Radio className="w-5 h-5 text-white" />
          </div>
          {!mini && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-none truncate">
                MikroTik<span className="text-indigo-600 dark:text-indigo-400">VPN</span>
              </h1>
              <p className="text-2xs text-slate-400 dark:text-slate-500 font-medium mt-0.5">Remote Manager</p>
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

      {/* ── Router activo ── */}
      <div className={`px-3 py-3 border-b border-slate-100 dark:border-slate-800 ${mini ? 'flex justify-center' : ''}`}>
        <div className={`flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 ${mini ? 'p-2' : 'px-3 py-2.5'}`}>
          <div className="relative shrink-0">
            <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          {!mini && (
            <div className="min-w-0">
              <p className="text-2xs font-bold uppercase tracking-wide text-emerald-600/70 dark:text-emerald-400/70 leading-none">Router activo</p>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 truncate mt-0.5">MikroTik</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Navegación por categorías ── */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {NAV.map(group => {
          const items = group.items.filter(it => visible.includes(it.id));
          if (items.length === 0) return null;
          return (
            <div key={group.category}>
              {!mini && (
                <p className="px-5 mb-1.5 text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
                      title={mini ? item.label : undefined}
                      aria-label={item.label}
                      className={`relative w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all
                        ${mini ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
                        ${active
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-indigo-600 dark:bg-indigo-400" />
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

      {/* ── Footer: estado + tema + usuario + salir ── */}
      <div className="border-t border-slate-100 dark:border-slate-800 p-3 space-y-2">
        {!mini && (
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="flex items-center gap-2 text-2xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Sistema en línea
            </span>
          </div>
        )}

        {/* Toggle tema */}
        <button
          onClick={toggleDarkMode}
          title={darkMode ? 'Modo claro' : 'Modo oscuro'}
          aria-label={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
          className={`w-full flex items-center gap-2.5 rounded-xl text-sm font-semibold text-slate-500
            hover:text-slate-800 hover:bg-slate-100 transition-colors
            dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800
            ${mini ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}`}
        >
          {darkMode ? <Sun className="w-[18px] h-[18px] shrink-0" /> : <Moon className="w-[18px] h-[18px] shrink-0" />}
          {!mini && <span>{darkMode ? 'Modo claro' : 'Modo oscuro'}</span>}
        </button>

        <div className={`flex items-center gap-2.5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 ${mini ? 'p-2 justify-center' : 'px-3 py-2'}`}>
          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
            <Wifi className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          {!mini && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate leading-none">@{credentials?.user}</p>
              <p className="text-2xs text-slate-400 dark:text-slate-500 mt-0.5 capitalize">{credentials?.role}</p>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          title={mini ? 'Cerrar sesión' : undefined}
          aria-label="Cerrar sesión"
          className={`w-full flex items-center gap-2.5 rounded-xl text-sm font-semibold text-slate-500
            hover:text-rose-600 hover:bg-rose-50 transition-colors
            dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-500/10
            ${mini ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}`}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!mini && <span>Cerrar sesión</span>}
        </button>

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
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-2 rounded-xl shadow-md shadow-indigo-500/25">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            MikroTik<span className="text-indigo-600 dark:text-indigo-400">VPN</span>
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
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full animate-in slide-in-from-left duration-200">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 z-10 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Cerrar menú"
            >
              <X className="w-4 h-4" />
            </button>
            {renderBody(false)}
          </aside>
        </div>
      )}
    </>
  );
}
