import { useState, useMemo } from 'react';
import { Settings as SettingsIcon, User, Briefcase, Database, Bell, Shield, PlugZap } from 'lucide-react';
import ProfileTab from './tabs/ProfileTab';
import WireGuardTab from './tabs/WireGuardTab';
import WorkspaceTab from './tabs/WorkspaceTab';
import ImportExportTab from './tabs/ImportExportTab';
import NotificationsTab from './tabs/NotificationsTab';
import IntegrationsTab from './tabs/IntegrationsTab';
import type { IntegrationProvider } from '../../../services/integrationsApi';
import { useWorkspaceSession } from '../../../context/WorkspaceSession';
import { PageHeader } from '../../Common/ui';

type TabId = 'profile' | 'wireguard' | 'workspace' | 'notifications' | 'integrations' | 'import-export';

interface TabDef { id: TabId; label: string; icon: typeof User; description: string }

const ALL_TABS: TabDef[] = [
  { id: 'profile',       label: 'Perfil',           icon: User,      description: 'Tu correo y contraseña' },
  { id: 'wireguard',     label: 'WireGuard',        icon: Shield,    description: 'Tu acceso VPN + QR' },
  { id: 'workspace',     label: 'Workspace',        icon: Briefcase, description: 'Nombre de tu espacio' },
  { id: 'notifications', label: 'Notificaciones',   icon: Bell,      description: 'Email y Telegram' },
  { id: 'integrations',  label: 'Integraciones',    icon: PlugZap,   description: 'Brevo, Gmail, Telegram y Gemini' },
  { id: 'import-export', label: 'Respaldo y datos', icon: Database,  description: 'Exportar / importar JSON' },
];

// MEMBER: perfil + su WireGuard + notificaciones (sin workspace ni import/export).
// El moderador (OWNER) ve todo.
const MEMBER_TAB_IDS: TabId[] = ['profile', 'wireguard', 'notifications'];

/**
 * Ajustes del Moderador (Fase C).
 *
 * NO se confunde con el SettingsModule del Administrador de plataforma — ese
 * configura el router MikroTik core compartido. Este módulo solo gestiona los
 * datos del workspace propio.
 */
export default function ModeratorSettingsModule() {
  const { session } = useWorkspaceSession();
  const isMember = session?.role === 'MEMBER';
  const tabs = useMemo<TabDef[]>(
    () => (isMember ? ALL_TABS.filter(t => MEMBER_TAB_IDS.includes(t.id)) : ALL_TABS),
    [isMember],
  );
  const [tab, setTab] = useState<TabId>('profile');
  const [integrationFocus, setIntegrationFocus] = useState<IntegrationProvider | null>(null);

  return (
    <div className="space-y-5">
      {/* ── Cabecera ── */}
      <PageHeader title="Ajustes" description={isMember ? 'Gestiona tu perfil y vincula Telegram para activar túneles desde el bot' : 'Gestiona tu perfil, el workspace y los respaldos'} icon={SettingsIcon} titleId="moderator-settings-title" />

      {/* ── Tabs ── */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-5">
        {/* Sidebar de tabs */}
        <div className="grid grid-cols-2 gap-2 md:block md:space-y-1" role="tablist" aria-label="Secciones de ajustes">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                role="tab"
                aria-selected={active}
                className={`flex min-h-14 w-full min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all md:min-h-0
                  ${active
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{t.label}</div>
                  <div className={`hidden text-2xs truncate min-[380px]:block ${active ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-500'}`}>
                    {t.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Contenido */}
        <div className="min-w-0">
          {tab === 'profile'       && <ProfileTab />}
          {tab === 'wireguard'     && <WireGuardTab />}
          {tab === 'workspace'     && !isMember && <WorkspaceTab />}
          {tab === 'notifications' && <NotificationsTab memberMode={isMember} onOpenIntegrations={!isMember ? (provider) => { setIntegrationFocus(provider === 'email' ? 'BREVO' : 'TELEGRAM'); setTab('integrations'); } : undefined} />}
          {tab === 'integrations'  && !isMember && <IntegrationsTab initialProvider={integrationFocus} />}
          {tab === 'import-export' && !isMember && <ImportExportTab />}
        </div>
      </div>
    </div>
  );
}
