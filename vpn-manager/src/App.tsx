import { useState, useEffect } from 'react';
import { Server, AlertTriangle } from 'lucide-react';
import { VpnProvider, useVpn } from './context';

import RouterAccess from './components/Auth/RouterAccess';
import Sidebar from './components/Layout/Sidebar';
import { WorkspaceSessionProvider } from './context/WorkspaceSession';

import AdminDashboard from './components/Admin/AdminDashboard/AdminDashboard';
import ModeratorsModule from './components/Admin/ModeratorsModule/ModeratorsModule';
import NodeAccessPanel from './components/Devices/NodeAccessPanel';
import UserManagementPanel from './components/Users/UserManagementPanel';
import TeamModule from './components/Team/TeamModule';
import NetworkDevicesModule from './components/Devices/NetworkDevicesModule';
import ApMonitorModule from './components/Monitor/ApMonitorModule';
import SettingsModule from './components/Settings/SettingsModule';

function AppContent() {
  const {
    isAuthenticated,
    credentials,
    isReady,

    activeModule,
  } = useVpn();

  const [configAlert, setConfigAlert] = useState<string | null>(null);

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
    return <RouterAccess />;
  }

  return (
    <WorkspaceSessionProvider>
    <div className="page-bg text-slate-900 flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar (desktop) + barra superior y drawer (móvil) */}
      <Sidebar />

      {/* Contenido */}
      <main className="flex-1 min-w-0 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-3 duration-400">

        {activeModule === 'dashboard' && <AdminDashboard />}

        {activeModule === 'moderators' && <ModeratorsModule />}

        {/* Banner: MikroTik no configurado (solo en módulos operativos) */}
        {configAlert && !['settings', 'dashboard', 'moderators'].includes(activeModule) && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Conexión al router no disponible</p>
              <p className="text-sm text-amber-700 mt-0.5">{configAlert} El Administrador debe configurar el router core.</p>
            </div>
          </div>
        )}

        {activeModule === 'nodes' && <NodeAccessPanel />}

        {activeModule === 'users' && <UserManagementPanel />}

        {activeModule === 'team' && <TeamModule />}

        {activeModule === 'devices' && <NetworkDevicesModule />}

        {activeModule === 'monitor' && <ApMonitorModule />}

        {activeModule === 'settings' && <SettingsModule />}
      </main>

    </div>
    </WorkspaceSessionProvider>
  );
}


export default function App() {
  return (
    <VpnProvider>
      <AppContent />
    </VpnProvider>
  );
}
