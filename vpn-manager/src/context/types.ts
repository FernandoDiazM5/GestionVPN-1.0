import type { VpnSecret, RouterCredentials } from '../store/db';
import type { NodeInfo } from '../types/api';

export interface VpnContextType {
  // Auth
  isAuthenticated: boolean;
  credentials: RouterCredentials | undefined;
  isReady: boolean;
  handleLoginSuccess: (creds: RouterCredentials) => void;
  handleLogout: () => Promise<void>;

  // VPNs gestionados
  managedVpns: VpnSecret[];
  setManagedVpns: React.Dispatch<React.SetStateAction<VpnSecret[]>>;

  // Estado del escáner (lifted para persistir entre cambios de tab)
  scannedSecrets: VpnSecret[];
  setScannedSecrets: React.Dispatch<React.SetStateAction<VpnSecret[]>>;
  hasScanned: boolean;
  setHasScanned: React.Dispatch<React.SetStateAction<boolean>>;

  // Nodos VRF
  nodes: NodeInfo[];
  setNodes: React.Dispatch<React.SetStateAction<NodeInfo[]>>;
  activeNodeVrf: string | null;
  setActiveNodeVrf: React.Dispatch<React.SetStateAction<string | null>>;
  tunnelExpiry: number | null;
  setTunnelExpiry: React.Dispatch<React.SetStateAction<number | null>>;
  adminIP: string;
  setAdminIP: React.Dispatch<React.SetStateAction<string>>;
  deactivateAllNodes: () => Promise<void>;
  removeNodeFromState: (pppUser: string) => void;

  // Navegación
  activeModule: 'nodes' | 'devices' | 'monitor' | 'settings';
  setActiveModule: React.Dispatch<React.SetStateAction<'nodes' | 'devices' | 'monitor' | 'settings'>>;

  // Tema
  darkMode: boolean;
  toggleDarkMode: () => void;
}
