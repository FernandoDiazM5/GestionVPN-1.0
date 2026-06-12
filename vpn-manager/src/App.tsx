import { useState, useEffect, lazy, Suspense } from 'react';
import { Server, AlertTriangle } from 'lucide-react';
import { VpnProvider, useVpn } from './context';

import Sidebar from './components/Layout/Sidebar';
import { WorkspaceSessionProvider } from './context/WorkspaceSession';
import ModuleSkeleton from './components/Common/ModuleSkeleton';

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
import { isPlatformAdmin } from './utils/permissions';
import { useDeepLinks, PENDING_ACTIVATE_KEY, PENDING_DEACTIVATE_KEY } from './context/hooks/useDeepLinks';

function AppContent() {
  const {
    isAuthenticated,
    credentials,
    isReady,

    activeModule,
    setActiveModule,
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/30 animate-pulse">
            <Server className="w-8 h-8 text-white" />
          </div>
          <p className="text-sm text-slate-500 font-medium">Iniciando sistema...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !credentials) {
    // Fallback liviano para el chunk de auth (RouterAccess + sus 3
    // sub-componentes: AcceptInvitationForm, PasswordResetRequest,
    // PasswordResetConfirm). El ModuleSkeleton de la app autenticada
    // se vería raro aquí: este flujo es público y debe sentirse instantáneo.
    return (
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
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
    );
  }

  return (
    <WorkspaceSessionProvider>
    <div className="page-bg text-slate-900 flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar (desktop) + barra superior y drawer (móvil) */}
      <Sidebar />

      {/* Contenido */}
      <main className="flex-1 min-w-0 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-3 duration-400">

        {/* Banner: MikroTik no configurado (solo en módulos operativos) — no es lazy. */}
        {configAlert && !['settings', 'dashboard', 'moderators'].includes(activeModule) && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Conexión al router no disponible</p>
              <p className="text-sm text-amber-700 mt-0.5">{configAlert} El Administrador debe configurar el router core.</p>
            </div>
          </div>
        )}

        {/* Suspense único — se reusa al cambiar de módulo. La key fuerza un nuevo
            boundary cuando cambia activeModule para que el skeleton aparezca
            limpio aunque el chunk anterior ya estuviera resuelto. */}
        <Suspense key={activeModule} fallback={<ModuleSkeleton />}>
          {activeModule === 'dashboard'   && <AdminDashboard />}
          {activeModule === 'moderators'  && <ModeratorsModule />}
          {activeModule === 'nodes'       && <NodeAccessPanel />}
          {activeModule === 'team'        && <TeamModule />}
          {activeModule === 'devices'     && <NetworkDevicesModule />}
          {activeModule === 'monitor'     && <ApMonitorModule />}
          {activeModule === 'settings'    && <SettingsModuleRouter />}
        </Suspense>
      </main>

    </div>
    </WorkspaceSessionProvider>
  );
}


// Decide qué módulo de Ajustes mostrar según el rol:
//  • platform_admin → SettingsModule (config del router MikroTik core)
//  • Moderador (OWNER/CO_MOD) → ModeratorSettingsModule (perfil + workspace + I/O)
function SettingsModuleRouter() {
  const { session } = useWorkspaceSession();
  if (isPlatformAdmin(session)) return <SettingsModule />;
  return <ModeratorSettingsModule />;
}

export default function App() {
  return (
    <VpnProvider>
      <AppContent />
    </VpnProvider>
  );
}
