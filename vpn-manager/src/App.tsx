import { useState, useEffect } from 'react';
import { Server, Radio, LogOut, Wifi, Cpu, Activity, Network, GitBranch, Settings, AlertTriangle } from 'lucide-react';
import { VpnProvider, useVpn } from './context/VpnContext';

import RouterAccess from './components/RouterAccess';

import NodeAccessPanel from './components/NodeAccessPanel';
import NetworkDevicesModule from './components/NetworkDevicesModule';
import ApMonitorModule from './components/ApMonitorModule';
import NetworkTopologyModule from './components/NetworkTopologyModule';
import TopologyPage from './topology/TopologyPage';
import SettingsModule from './components/SettingsModule';

function AppContent() {
  const {
    isAuthenticated,
    credentials,
    isReady,

    activeModule,
    setActiveModule,
    handleLogout,
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
    <div className="page-bg text-slate-900">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 glass-nav">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-4">

          {/* Logo */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-2.5 rounded-xl shadow-md shadow-indigo-500/25">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-bold text-slate-800 leading-none">
                MikroTik<span className="text-indigo-600">VPN</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Remote Manager</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveModule('nodes')}
              className={`tab-btn ${activeModule === 'nodes' ? 'tab-active' : 'tab-inactive'}`}
            >
              <Radio className="w-4 h-4" />
              <span>Nodos</span>
            </button>

            <button
              onClick={() => setActiveModule('devices')}
              className={`tab-btn ${activeModule === 'devices' ? 'tab-active' : 'tab-inactive'}`}
            >
              <Cpu className="w-4 h-4" />
              <span>Escanear</span>
            </button>
            <button
              onClick={() => setActiveModule('monitor')}
              className={`tab-btn ${activeModule === 'monitor' ? 'tab-active' : 'tab-inactive'}`}
            >
              <Activity className="w-4 h-4" />
              <span>Monitor AP</span>
            </button>
            <button
              onClick={() => setActiveModule('topology')}
              className={`tab-btn ${activeModule === 'topology' ? 'tab-active' : 'tab-inactive'}`}
            >
              <GitBranch className="w-4 h-4" />
              <span className="hidden sm:inline">Topología UISP</span>
            </button>
            {credentials?.role === 'admin' && (
               <button
                 onClick={() => setActiveModule('settings')}
                 className={`tab-btn ${activeModule === 'settings' ? 'tab-active' : 'tab-inactive'}`}
               >
                 <Settings className="w-4 h-4" />
                 <span className="hidden sm:inline">Ajustes</span>
               </button>
            )}
          </div>

          {/* Derecha */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="status-online">
              <Wifi className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">@{credentials.user} ({credentials.role})</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-1" />
            </div>

            <button
              onClick={handleLogout}
              className="btn-ghost p-2 flex items-center space-x-1.5 text-sm"
              title="Desconectar"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-semibold">Salir</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Contenido */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-in fade-in slide-in-from-bottom-3 duration-400">

        {/* Banner: MikroTik no configurado */}
        {configAlert && activeModule !== 'settings' && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Configuración requerida</p>
              <p className="text-sm text-amber-700 mt-0.5">{configAlert}</p>
            </div>
            {credentials?.role === 'admin' && (
              <button
                onClick={() => { setActiveModule('settings'); setConfigAlert(null); }}
                className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                Ir a Ajustes
              </button>
            )}
          </div>
        )}

        {activeModule === 'nodes' && <NodeAccessPanel />}

        {activeModule === 'devices' && <NetworkDevicesModule />}

        {activeModule === 'monitor' && <ApMonitorModule />}

        {activeModule === 'topology' && <TopologyPage />}
        
        {activeModule === 'settings' && <SettingsModule />}
      </main>

    </div>
  );
}


export default function App() {
  return (
    <VpnProvider>
      <AppContent />
    </VpnProvider>
  );
}
