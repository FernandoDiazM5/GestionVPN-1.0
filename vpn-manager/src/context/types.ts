import type { RouterCredentials } from '../store/db';
import type { NodeInfo } from '../types/api';
import type { SessionUser } from '../types/account';
import type { ActiveModule } from './hooks/useModuleNavigation';

export interface VpnContextType {
  // Auth
  isAuthenticated: boolean;
  credentials: RouterCredentials | undefined;
  isReady: boolean;
  handleLoginSuccess: (creds: RouterCredentials) => Promise<void>;
  handleLogout: () => Promise<void>;
  workspaceSession: SessionUser | null;
  workspaceSessionLoading: boolean;
  refreshWorkspaceSession: () => Promise<SessionUser | null>;

  // VPNs gestionados
  // Estado del escáner (lifted para persistir entre cambios de tab)
  // Nodos VRF
  nodes: NodeInfo[];
  setNodes: React.Dispatch<React.SetStateAction<NodeInfo[]>>;
  activeNodeVrf: string | null;
  setActiveNodeVrf: React.Dispatch<React.SetStateAction<string | null>>;
  tunnelExpiry: number | null;
  setTunnelExpiry: React.Dispatch<React.SetStateAction<number | null>>;
  deactivateAllNodes: () => Promise<void>;
  removeNodeFromState: (pppUser: string) => void;

  // Navegación
  activeModule: ActiveModule;
  setActiveModule: (module: ActiveModule) => void;

  // Tema
  darkMode: boolean;
  toggleDarkMode: () => void;
}
