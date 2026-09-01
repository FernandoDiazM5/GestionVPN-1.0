import { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, PlugZap, Radar, Server, ServerCog, Settings as SettingsIcon, User } from 'lucide-react';
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
import IntegrationsTab from '../ModeratorSettings/tabs/IntegrationsTab';
import { PageHeader } from '../../Common/ui';
import { post } from '../../../services/sessionClient';
import type { AppSettings } from './types';

type TabId = 'core' | 'server' | 'scan' | 'reports' | 'integrations' | 'account';

const TABS = [
  { id: 'core', label: 'Router Core', icon: Server, description: 'RouterOS, IP publica y SSTP' },
  { id: 'server', label: 'Servidor VPN', icon: ServerCog, description: 'Estado, respaldo y provision' },
  { id: 'scan', label: 'Escaneo', icon: Radar, description: 'Origen VPS o equipo local' },
  { id: 'reports', label: 'Reportes tecnicos', icon: Mail, description: 'Destinatario y correo de prueba' },
  { id: 'integrations', label: 'Integraciones', icon: PlugZap, description: 'Correo, Telegram y Google Login' },
  { id: 'account', label: 'Cuenta', icon: User, description: 'Correo y contrasena' },
] satisfies Array<{ id: TabId; label: string; icon: typeof Server; description: string }>;

function coreFingerprint(settings: AppSettings) {
  return JSON.stringify({
    MT_IP: (settings.MT_IP || '').trim(), MT_USER: (settings.MT_USER || '').trim(), MT_PASS: settings.MT_PASS,
    server_public_ip: (settings.server_public_ip || '').trim(), sstp_port: (settings.sstp_port || '').trim(),
    core_internal_ip: (settings.core_internal_ip || '').trim(), core_local_networks: (settings.core_local_networks || '').trim(),
  });
}

export default function SettingsModule() {
  const [tab, setTab] = useState<TabId>('core');
  const loadState = useLoadSettings();
  const saveState = useSaveSettings();
  const savedCoreRef = useRef('');
  const settingsWereLoadingRef = useRef(true);

  useEffect(() => {
    if (loadState.isLoading) settingsWereLoadingRef.current = true;
    else if (settingsWereLoadingRef.current) {
      savedCoreRef.current = coreFingerprint(loadState.settings);
      settingsWereLoadingRef.current = false;
    }
  }, [loadState.isLoading, loadState.settings]);

  const hasCoreChanges = useMemo(
    () => !loadState.isLoading && savedCoreRef.current !== coreFingerprint(loadState.settings),
    [loadState.isLoading, loadState.settings]
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await saveState.handleSave(loadState.settings);
    if (saved) savedCoreRef.current = coreFingerprint(loadState.settings);
  };

  const saveCurrentSettings = async () => {
    await saveState.handleSave(loadState.settings);
  };

  const testCoreConnection = () => post<{ success: true; connected: true; identity: string; version: string; board: string }>(
    '/api/settings/test-core-connection', {
      ip: (loadState.settings.MT_IP || '').trim(),
      user: (loadState.settings.MT_USER || '').trim(),
      pass: loadState.settings.MT_PASS,
    }
  );

  // La gestión de usuarios/roles vive ahora en los paneles "Moderadores"
  // (Administrador) y "Equipo" (Moderador). Aquí solo va la configuración global.
  return (
    <div className="space-y-5">
      <PageHeader title="Ajustes del sistema" description="Configura la plataforma, los reportes y tu cuenta de Administrador" icon={SettingsIcon} titleId="system-settings-title" />

      <label className="block md:hidden"><span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Sección de configuración</span><select className="input-field min-h-11" value={tab} onChange={event => setTab(event.target.value as TabId)}>{TABS.map(item => <option key={item.id} value={item.id}>{item.label} — {item.description}</option>)}</select></label>

      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-5">
        <nav className="hidden space-y-1 md:block" aria-label="Secciones de ajustes del Administrador">
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
              <div className="p-4 sm:p-6">
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
                      hasChanges={hasCoreChanges}
                      onTestConnection={testCoreConnection}
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
            <ScanModeToggle />
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
          {tab === 'integrations' && <IntegrationsTab scope="platform" />}
        </div>
      </div>
    </div>
  );
}
