import localforage from 'localforage';
import type { NodeInfo } from '../types/api';

export interface RouterCredentials {
  user: string;
  role: string;
  /** @deprecated El backend obtiene estas credenciales desde app_settings. */
  ip?: string;
  pass?: string;
}

export interface VpnStoreData {
  activeNodeVrf?: string | null;
  tunnelExpiry?: number | null;
  nodes?: NodeInfo[];
}

interface StoredData extends VpnStoreData {
  version: 4;
}

const STORAGE_KEY = 'mikrotik_vpn_store_v4';
const LEGACY_STORAGE_KEY = 'mikrotik_vpn_store_v3';

localforage.config({
  name: 'MikroTikVPNManager',
  storeName: 'vpn_store',
  description: 'Estado local no sensible de VPN',
});

export const dbService = {
  async getStore(): Promise<VpnStoreData> {
    try {
      await localforage.removeItem(LEGACY_STORAGE_KEY);
      const raw = await localforage.getItem<StoredData>(STORAGE_KEY);
      if (!raw || raw.version !== 4) return {};
      return {
        activeNodeVrf: raw.activeNodeVrf ?? null,
        tunnelExpiry: raw.tunnelExpiry ?? null,
        nodes: raw.nodes ?? [],
      };
    } catch {
      return {};
    }
  },

  async saveStore(data: VpnStoreData): Promise<void> {
    const stored: StoredData = {
      version: 4,
      activeNodeVrf: data.activeNodeVrf,
      tunnelExpiry: data.tunnelExpiry,
      nodes: data.nodes,
    };
    await localforage.setItem(STORAGE_KEY, stored);
  },

  async clearStore(): Promise<void> {
    await Promise.all([
      localforage.removeItem(STORAGE_KEY),
      localforage.removeItem(LEGACY_STORAGE_KEY),
    ]);
  },
};
