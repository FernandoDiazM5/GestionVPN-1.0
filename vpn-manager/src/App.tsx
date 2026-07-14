import { useState, useEffect, lazy, Suspense } from 'react';
import { Server, AlertTriangle } from 'lucide-react';
import { BrowserRouter } from 'react-router-dom';
import { VpnProvider, useVpn } from './context';

import Sidebar from './components/Layout/Sidebar';
import { WorkspaceSessionProvider } from './context/WorkspaceSession';
import ModuleSkeleton from './components/Common/ModuleSkeleton';
import RouterMaintenanceOverlay from './components/Common/RouterMaintenanceOverlay';
import ModuleErrorBoundary from './components/Common/ModuleErrorBoundary';
import NotFoundPage from './components/Common/NotFoundPage';
import AsyncQueryState from './components/Common/AsyncQueryState';

// ── Code-splitting (FASE 10 del REFACTOR_PLAN) ─────────────────────
//  Cada módulo se carga bajo demanda en su propio chunk. Esto baja el
//  bundle inicial del monolítico ~1090 KB a algo proporcional al login
//  + layout + módulo activo.
//
//  Sidebar, ModuleSkeleton y RouterAccess siguen siendo eagerly imported
//  porque son universales: el sidebar se ve en TODOS los módulos y el
//  skeleton es el fallback de Suspense, no tiene sentido lazify-arlos
//  (fallback de un fallback = pantalla blanca momentánea).
const RouterAccess              = lazy(() => import('./components/Auth/RouterAccess'));
const AdminDashboard            = lazy(() => import('./components/Admin/AdminDashboard/AdminDashboard'));
const ModeratorsModule          = lazy(() => import('./components/Admin/ModeratorsModule/ModeratorsModule'));
const NodeAccessPanel           = lazy(() => import('./components/Devices/NodeAccessPanel'));
// UserManagementPanel ya no es un módulo independiente: el TeamModule lo
// monta como sub-tab "Usuarios VPN" dentro del módulo Workspace.
const TeamModule                = lazy(() => import('./components/Team/TeamModule'));
const NetworkDevicesModule      = lazy(() => import('./components/Devices/NetworkDevicesModule'));
const ApMonitorModule           = lazy(() => import('./components/Monitor/ApMonitorModule'));
const SettingsModule            = lazy(() => import('./components/Settings/SettingsModule'));
const ModeratorSettingsModule   = lazy(() => import('./components/Settings/ModeratorSettings/ModeratorSettingsModule'));

import { useWorkspaceSession } from './context/WorkspaceSession';
import { isPlatformAdmin, visibleModules, type ModuleId } from './utils/permissions';
import { useDeepLinks, PENDING_ACTIVATE_KEY, PENDING_DEACTIVATE_KEY } from './context/hooks/useDeepLinks';

function AppContent() {
  const {
    isAuthenticated,
    credentials,
    isReady,

    activeModule,
    setActiveModule,
    isNotFound,
  } = useVpn();

  const [configAlert, setConfigAlert] = useState<string | null>(null);

  // M1 — captura deep-links del bot (?activate=VRF-X / ?deactivate=1)
  // ANTES de chequear auth: si el usuario no está logueado, la acción
  // queda guardada en sessionStorage y se ejecuta tras el login.
  useDeepLinks();

  // Tras login, si hay una acción pendiente del bot, navegar al módulo nodes
  // (donde NodeAccessPanel la consume y dispara). El módulo del módulo activo
  // anterior se descarta. NO consumimos aquí — solo cambiamos de módulo.
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const hasPending = sessionStorage.getItem(PENDING_ACTIVATE_KEY)
                      || sessionStorage.getItem(PENDING_DEACTIVATE_KEY);
      if (hasPending && activeModule !== 'nodes') setActiveModule('nodes');
    } catch { /* sessionStorage no disponible */ }
  }, [isAuthenticated, activeModule, setActiveModule]);

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail || 'Configura las credenciales MikroTik en Ajustes.';
      setConfigAlert(msg);
    };
    window.addEventListener('mikrotik_needs_config', handler);
    return () => window.removeEventListener('mikrotik_needs_config', handler);
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/30 animate-pulse">
            <Server className="w-8 h-8 text-white" />
          </div>
          <p className="text-sm text-slate-500 font-medium">Iniciando sistema...</p>
        </div>
      </div>
    );
  }

  if (isNotFound && (!isAuthenticated || !credentials)) {
    return <NotFoundPage />;
  }

  if (!isAuthenticated || !credentials) {
    // Fallback liviano para el chunk de auth (RouterAccess + sus 3
    // sub-componentes: AcceptInvitationForm, PasswordResetRequest,
    // PasswordResetConfirm). El ModuleSkeleton de la app autenticada
    // se vería raro aquí: este flujo es público y debe sentirse instantáneo.
    return (
      <ModuleErrorBoundary resetKey="auth">
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
              <div className="flex flex-col items-center space-y-4">
                <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/30 animate-pulse">
                  <Server className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          }
        >
          <RouterAccess />
        </Suspense>
      </ModuleErrorBoundary>
    );
  }

  return (
    <WorkspaceSessionProvider>
    <RouterMaintenanceOverlay />
    <div className="page-bg text-slate-900 flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar (desktop) + barra superior y drawer (móvil) */}
      <Sidebar />

      {/* Contenido */}
      <main className="flex-1 min-w-0 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 anim-fade-up">

        {/* Banner: MikroTik no configurado (solo en módulos operativos) — no es lazy. */}
        {configAlert && !['settings', 'dashboard', 'moderators'].includes(activeModule) && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 dark:bg-amber-500/10 dark:border-amber-500/30">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Conexión al router no disponible</p>
              <p className="text-sm text-amber-700 mt-0.5">{configAlert} El Administrador debe configurar el router core.</p>
            </div>
          </div>
        )}

        <ModuleRouter />
      </main>

    </div>
    </WorkspaceSessionProvider>
  );
}

function ModuleRouter() {
  const { activeModule, setActiveModule, isNotFound } = useVpn();
  const { session, loading, error, refresh } = useWorkspaceSession();
  const allowed = visibleModules(session);
  const canOpen = allowed.includes(activeModule as ModuleId);

  useEffect(() => {
    if (!isNotFound && !loading && session && !canOpen) setActiveModule(allowed[0] ?? 'nodes');
  }, [allowed, canOpen, isNotFound, loading, session, setActiveModule]);

  if (isNotFound) return <NotFoundPage authenticated />;

  if (loading) return <ModuleSkeleton />;
  if (!session) {
    return (
      <AsyncQueryState
        loading={false}
        error={error || 'No se pudo recuperar la sesion del workspace.'}
        onRetry={() => { void refresh(); }}
      >
        <div />
      </AsyncQueryState>
    );
  }
  if (!canOpen) return <ModuleSkeleton />;

  return (
    <ModuleErrorBoundary resetKey={activeModule}>
      <Suspense fallback={<ModuleSkeleton />}>
        {activeModule === 'dashboard'   && <AdminDashboard />}
        {activeModule === 'moderators'  && <ModeratorsModule />}
        {activeModule === 'nodes'       && <NodeAccessPanel />}
        {activeModule === 'team'        && <TeamModule />}
        {activeModule === 'devices'     && <NetworkDevicesModule />}
        {activeModule === 'monitor'     && <ApMonitorModule />}
        {activeModule === 'settings'    && <SettingsModuleRouter />}
      </Suspense>
    </ModuleErrorBoundary>
  );
}


// Decide qué módulo de Ajustes mostrar según el rol:
//  • platform_admin → SettingsModule (config del router MikroTik core)
//  • Moderador (OWNER) → ModeratorSettingsModule (perfil + workspace + I/O)
function SettingsModuleRouter() {
  const { session } = useWorkspaceSession();
  if (isPlatformAdmin(session)) return <SettingsModule />;
  return <ModeratorSettingsModule />;
}

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <BrowserRouter basename={basename}>
      <ModuleErrorBoundary resetKey="application">
        <VpnProvider>
          <AppContent />
        </VpnProvider>
      </ModuleErrorBoundary>
    </BrowserRouter>
  );
}
