import { useState } from 'react';
import { Mail, Radar, Server, ServerCog, Settings as SettingsIcon, User } from 'lucide-react';
import {
  SettingsHeader,
  SettingsForm,
  SettingsMessages,
  ScanModeToggle,
  ErrorReportingSettings,
  CoreServerPanel,
} from './components';
import { useLoadSettings, useSaveSettings } from './hooks';
import AsyncQueryState from '../../Common/AsyncQueryState';
import ProfileTab from '../ModeratorSettings/tabs/ProfileTab';

type TabId = 'core' | 'server' | 'scan' | 'reports' | 'account';

const TABS = [
  { id: 'core', label: 'Router Core', icon: Server, description: 'RouterOS, IP publica y SSTP' },
  { id: 'server', label: 'Servidor VPN', icon: ServerCog, description: 'Estado, respaldo y provision' },
  { id: 'scan', label: 'Escaneo', icon: Radar, description: 'Origen VPS o equipo local' },
  { id: 'reports', label: 'Reportes tecnicos', icon: Mail, description: 'Destinatario y correo de prueba' },
  { id: 'account', label: 'Cuenta', icon: User, description: 'Correo y contrasena' },
] satisfies Array<{ id: TabId; label: string; icon: typeof Server; description: string }>;

export default function SettingsModule() {
  const [tab, setTab] = useState<TabId>('core');
  const loadState = useLoadSettings();
  const saveState = useSaveSettings();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveState.handleSave(loadState.settings);
  };

  const saveCurrentSettings = async () => {
    await saveState.handleSave(loadState.settings);
  };

  // La gestión de usuarios/roles vive ahora en los paneles "Moderadores"
  // (Administrador) y "Equipo" (Moderador). Aquí solo va la configuración global.
  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Ajustes del sistema</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Configura la plataforma, los reportes y tu cuenta de Administrador
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-5">
        <nav className="space-y-1" aria-label="Secciones de ajustes del Administrador">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-all
                  ${active
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{item.label}</span>
                  <span className={`block text-2xs truncate ${active ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {tab === 'core' && (
            <div className="card overflow-hidden">
              <SettingsHeader />
              <div className="p-6">
                <AsyncQueryState
                  loading={loadState.isLoading}
                  error={loadState.errorMsg}
                  onRetry={() => { void loadState.loadSettings(); }}
                  loadingLabel="Cargando ajustes..."
                  skeletonRows={3}
                >
                  <>
                    <SettingsMessages successMsg={saveState.successMsg} errorMsg={saveState.errorMsg} />
                    <SettingsForm
                      settings={loadState.settings}
                      onSettingsChange={loadState.setSettings}
                      onSubmit={handleSave}
                      isSaving={saveState.isSaving}
                    />
                  </>
                </AsyncQueryState>
              </div>
            </div>
          )}

          {tab === 'server' && !loadState.isLoading && (
            <CoreServerPanel
              settings={loadState.settings}
              onSettingsChange={loadState.setSettings}
              onSave={saveCurrentSettings}
              onChangeRouter={() => setTab('core')}
              isSaving={saveState.isSaving}
              successMsg={saveState.successMsg}
              errorMsg={saveState.errorMsg}
            />
          )}

          {tab === 'scan' && !loadState.isLoading && (
            <ScanModeToggle
              scanMode={loadState.settings.scan_mode ?? 'vps'}
              localScanIp={loadState.settings.local_scan_ip ?? ''}
              onChange={(patch) => loadState.setSettings({ ...loadState.settings, ...patch })}
            />
          )}

          {tab === 'reports' && !loadState.isLoading && (
            <ErrorReportingSettings
              email={loadState.settings.error_report_email ?? ''}
              onEmailChange={(email) => loadState.setSettings({ ...loadState.settings, error_report_email: email })}
            />
          )}

          {(tab === 'server' || tab === 'scan' || tab === 'reports') && loadState.isLoading && (
            <AsyncQueryState loading error={null} onRetry={() => { void loadState.loadSettings(); }}
              loadingLabel="Cargando ajustes..." skeletonRows={3}>
              <div />
            </AsyncQueryState>
          )}

          {tab === 'account' && <ProfileTab />}
        </div>
      </div>
    </div>
  );
}
