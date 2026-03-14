import localforage from 'localforage';
import { encryptText, decryptText, clearEncryptionKey } from '../utils/crypto';

export interface RouterCredentials {
  ip: string;
  user: string;
  pass: string;
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
}

/** Formato serializado en disco — la contraseña se almacena cifrada */
interface StoredData {
  version: 2;
  isAuthenticated: boolean;
  credentials?: {
    ip: string;
    user: string;
    encPass: string; // AES-GCM encrypted + base64
  };
  managedVpns: VpnSecret[];
}

const STORAGE_KEY = 'mikrotik_vpn_store_v2';

localforage.config({
  name: 'MikroTikVPNManager',
  storeName: 'vpn_store',
  description: 'Almacenamiento persistente para configuraciones y estados de VPN',
});

export const dbService = {
  async getStore(): Promise<VpnStoreData> {
    try {
      const raw = await localforage.getItem<StoredData>(STORAGE_KEY);
      if (!raw || raw.version !== 2) {
        return { isAuthenticated: false, managedVpns: [] };
      }
      let credentials: RouterCredentials | undefined;
      if (raw.credentials) {
        const pass = await decryptText(raw.credentials.encPass);
        credentials = { ip: raw.credentials.ip, user: raw.credentials.user, pass };
      }
      return {
        isAuthenticated: raw.isAuthenticated,
        credentials,
        managedVpns: raw.managedVpns ?? [],
      };
    } catch {
      // Fallo de descifrado (llave perdida u otro error): estado limpio
      return { isAuthenticated: false, managedVpns: [] };
    }
  },

  async saveStore(data: VpnStoreData): Promise<void> {
    let storedCredentials: StoredData['credentials'];
    if (data.credentials) {
      const encPass = await encryptText(data.credentials.pass);
      storedCredentials = {
        ip: data.credentials.ip,
        user: data.credentials.user,
        encPass,
      };
    }
    const stored: StoredData = {
      version: 2,
      isAuthenticated: data.isAuthenticated,
      credentials: storedCredentials,
      managedVpns: data.managedVpns,
    };
    await localforage.setItem(STORAGE_KEY, stored);
  },

  async clearStore(): Promise<void> {
    await localforage.removeItem(STORAGE_KEY);
    await clearEncryptionKey();
  },
};
