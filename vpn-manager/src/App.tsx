import { Network, Server, Radio, Moon, Sun } from 'lucide-react';
import { VpnProvider, useVpn } from './context/VpnContext';
import RouterAccess from './components/RouterAccess';
import ScannerModule from './components/ScannerModule';
import ControlPanel from './components/ControlPanel';

function AppContent() {
  const {
    isAuthenticated,
    credentials,
    isReady,
    activeModule,
    setActiveModule,
    handleLogout,
    darkMode,
    toggleDarkMode,
  } = useVpn();

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Server className="w-12 h-12 text-indigo-500 animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated || !credentials) {
    return <RouterAccess />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 glassmorphism dark:glassmorphism-dark px-6 py-4 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/30">
            <Radio className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              MikroTik<span className="text-indigo-600 dark:text-indigo-400">VPN</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">Remote Core Manager</p>
          </div>
        </div>

        {/* Tabs de navegación */}
        <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveModule('control')}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center space-x-2 ${
              activeModule === 'control'
                ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Gestión</span>
          </button>
          <button
            onClick={() => setActiveModule('scanner')}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center space-x-2 ${
              activeModule === 'scanner'
                ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Network className="w-4 h-4" />
            <span>Escáner PPP</span>
          </button>
        </div>

        {/* Acciones derecha */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tracking-wide">
              SYSTEM ONLINE
            </span>
          </div>

          {/* Toggle dark mode */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={handleLogout}
            className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-wider"
          >
            Desconectar
          </button>
        </div>
      </nav>

      {/* Contenido principal */}
      <main className="max-w-7xl mx-auto p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeModule === 'scanner' ? <ScannerModule /> : <ControlPanel />}
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
