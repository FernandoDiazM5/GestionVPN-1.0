import type { ComponentType } from 'react';
import type { ModuleId } from '../utils/permissions';

type ComponentModule = { default: ComponentType };
type Loader = () => Promise<ComponentModule>;
type ModuleLoaderKey = Exclude<ModuleId, 'settings' | 'users'>
  | 'platformSettings'
  | 'workspaceSettings';

export const moduleLoaders: Record<ModuleLoaderKey, Loader> = {
  dashboard: () => import('../components/Admin/AdminDashboard/AdminDashboard'),
  moderators: () => import('../components/Admin/ModeratorsModule/ModeratorsModule'),
  nodes: () => import('../components/Devices/NodeAccessPanel'),
  team: () => import('../components/Team/TeamModule'),
  devices: () => import('../components/Devices/NetworkDevicesModule'),
  monitor: () => import('../components/Monitor/ApMonitorModule'),
  platformSettings: () => import('../components/Settings/SettingsModule'),
  workspaceSettings: () => import('../components/Settings/ModeratorSettings/ModeratorSettingsModule'),
};

export function preloadModule(moduleId: ModuleId, platformAdmin: boolean): void {
  const loader = moduleId === 'settings'
    ? (platformAdmin ? moduleLoaders.platformSettings : moduleLoaders.workspaceSettings)
    : moduleId === 'users'
      ? null
      : moduleLoaders[moduleId];

  // La precarga es oportunista: absorbemos el fallo para no generar una
  // promesa rechazada sin manejar. El límite de errores conserva el flujo de
  // recuperación si la navegación posterior tampoco puede descargar el chunk.
  void loader?.().catch(() => undefined);
}
