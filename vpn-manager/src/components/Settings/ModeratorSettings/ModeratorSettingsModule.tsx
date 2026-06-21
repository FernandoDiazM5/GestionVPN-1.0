import { useState, useMemo } from 'react';
import { Settings as SettingsIcon, User, Briefcase, Database, Bell, Shield } from 'lucide-react';
import ProfileTab from './tabs/ProfileTab';
import WireGuardTab from './tabs/WireGuardTab';
import WorkspaceTab from './tabs/WorkspaceTab';
import ImportExportTab from './tabs/ImportExportTab';
import NotificationsTab from './tabs/NotificationsTab';
import { useWorkspaceSession } from '../../../context/WorkspaceSession';

type TabId = 'profile' | 'wireguard' | 'workspace' | 'notifications' | 'import-export';

interface TabDef { id: TabId; label: string; icon: typeof User; description: string }

const ALL_TABS: TabDef[] = [
  { id: 'profile',       label: 'Perfil',           icon: User,      description: 'Tu correo y contraseña' },
  { id: 'wireguard',     label: 'WireGuard',        icon: Shield,    description: 'Tu acceso VPN + QR' },
  { id: 'workspace',     label: 'Workspace',        icon: Briefcase, description: 'Nombre de tu espacio' },
  { id: 'notifications', label: 'Notificaciones',   icon: Bell,      description: 'Email y Telegram' },
  { id: 'import-export', label: 'Respaldo y datos', icon: Database,  description: 'Exportar / importar JSON' },
];

// MEMBER: perfil + su WireGuard + notificaciones (sin workspace ni import/export).
// El moderador (OWNER/CO_MOD) ve todo.
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

  return (
    <div className="space-y-5">
      {/* ── Cabecera ── */}
      <div className="card p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Ajustes</h2>
            <p className="text-slate-400 dark:text-slate-500 text-sm">
              {isMember
                ? 'Gestiona tu perfil y vincula Telegram para activar túneles desde el bot'
                : 'Gestiona tu perfil, el workspace y los respaldos'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5">
        {/* Sidebar de tabs */}
        <div className="space-y-1">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-all
                  ${active
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{t.label}</div>
                  <div className={`text-2xs truncate ${active ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'}`}>
                    {t.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Contenido */}
        <div>
          {tab === 'profile'       && <ProfileTab />}
          {tab === 'wireguard'     && <WireGuardTab />}
          {tab === 'workspace'     && !isMember && <WorkspaceTab />}
          {tab === 'notifications' && <NotificationsTab memberMode={isMember} />}
          {tab === 'import-export' && !isMember && <ImportExportTab />}
        </div>
      </div>
    </div>
  );
}
