import localforage from 'localforage';
import { encryptText, decryptText, clearEncryptionKey } from '../utils/crypto';
import type { NodeInfo } from '../types/api';

export interface RouterCredentials {
  user: string;
  role: string;
  token?: string; // JWT token
  /** @deprecated Las credenciales MikroTik se leen desde app_settings en el backend (req.mikrotik). Estos campos son ignorados por el servidor. */
  ip?: string;
  pass?: string;
}

export interface VpnSecret {
  id: string;
  name: string;
  service: 'sstp' | 'l2tp' | string;
  profile: string;
  disabled: boolean;
  running: boolean;
  uptime?: string; // Uptime real de RouterOS (e.g. "2h30m15s")
  ip?: string;
}

/** Interfaz pública usada por los componentes */
export interface VpnStoreData {
  isAuthenticated: boolean;
  credentials?: RouterCredentials;
  managedVpns: VpnSecret[];
  scannedSecrets?: VpnSecret[];
  activeNodeVrf?: string | null;
  tunnelExpiry?: number | null;
  adminIP?: string;
  nodes?: NodeInfo[];
}

/** Formato serializado en disco — la contraseña se almacena cifrada */
interface StoredData {
  version: 3;
  isAuthenticated: boolean;
  credentials?: {
    user: string;
    role: string;
    encPass: string; // AES-GCM encrypted + base64 (now stores JWT)
  };
  managedVpns: VpnSecret[];
  scannedSecrets?: VpnSecret[];
  activeNodeVrf?: string | null;
  tunnelExpiry?: number | null;
  adminIP?: string;
  nodes?: NodeInfo[];
}

const STORAGE_KEY = 'mikrotik_vpn_store_v3';

localforage.config({
  name: 'MikroTikVPNManager',
  storeName: 'vpn_store',
  description: 'Almacenamiento persistente para configuraciones y estados de VPN',
});

export const dbService = {
  async getStore(): Promise<VpnStoreData> {
    try {
      const raw = await localforage.getItem<StoredData>(STORAGE_KEY);
      if (!raw || raw.version !== 3) {
        return { isAuthenticated: false, managedVpns: [] };
      }
      let credentials: RouterCredentials | undefined;
      if (raw.credentials) {
        const tokenOrPass = await decryptText(raw.credentials.encPass);
        credentials = { user: raw.credentials.user, role: raw.credentials.role, token: tokenOrPass };
      }
      return {
        isAuthenticated: raw.isAuthenticated,
        credentials,
        managedVpns:    raw.managedVpns    ?? [],
        scannedSecrets: raw.scannedSecrets ?? [],
        activeNodeVrf:  raw.activeNodeVrf  ?? null,
        tunnelExpiry:   raw.tunnelExpiry   ?? null,
        adminIP:        raw.adminIP,
        nodes:          raw.nodes          ?? [],
      };
    } catch {
      // Fallo de descifrado (llave perdida u otro error): estado limpio
      return { isAuthenticated: false, managedVpns: [] };
    }
  },

  async saveStore(data: VpnStoreData): Promise<void> {
    let storedCredentials: StoredData['credentials'];
    if (data.credentials && data.credentials.token) {
      // Encriptamos el JWT localmente para máxima seguridad
      const encPass = await encryptText(data.credentials.token);
      storedCredentials = {
        user: data.credentials.user,
        role: data.credentials.role,
        encPass,
      };
    }
    const stored: StoredData = {
      version: 3,
      isAuthenticated: data.isAuthenticated,
      credentials:    storedCredentials,
      managedVpns:    data.managedVpns,
      scannedSecrets: data.scannedSecrets,
      activeNodeVrf:  data.activeNodeVrf,
      tunnelExpiry:   data.tunnelExpiry,
      adminIP:        data.adminIP,
      nodes:          data.nodes,
    };
    await localforage.setItem(STORAGE_KEY, stored);
  },

  async clearStore(): Promise<void> {
    await localforage.removeItem(STORAGE_KEY);
    await clearEncryptionKey();
  },
};
