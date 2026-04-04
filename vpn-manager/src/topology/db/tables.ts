export interface Tower {
  id: string;
  name: string;
  location?: string;
  /** Source VPN node ID (NodeInfo.id) — null for manually created towers */
  sourceNodeId?: string;
  /** 'vpn_node' = auto-synced from VPN context, 'manual' = user-created */
  sourceType: 'vpn_node' | 'manual';
  /** VPN protocol (sstp | wireguard) — only for sourceType=vpn_node */
  vpnProtocol?: 'sstp' | 'wireguard';
  /** VPN tunnel running state */
  vpnRunning?: boolean;
  canvasX: number;
  canvasY: number;
  canvasWidth: number;
  canvasHeight: number;
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
  // Nuevos campos de Base de Datos
  tramos?: number;
  contacto?: string;
  pdf_path?: string;
  nodo_id?: string;
  ptp_emisor_ip?: string;
  ptp_emisor_nombre?: string;
  ptp_emisor_modelo?: string;
  ptp_emisor_desc?: string;
  ptp_receptor_ip?: string;
  ptp_receptor_nombre?: string;
  ptp_receptor_modelo?: string;
  ptp_receptor_desc?: string;
}

export type DeviceType = 'vpn_node' | 'router' | 'ptp' | 'ap' | 'cpe' | 'backbone';

export type DeviceRole =
  | 'vpn_node'
  | 'tower_router'
  | 'ptp_main'
  | 'ptp_station'
  | 'ap'
  | 'cpe';

export type LinkType = 'wired' | 'fiber' | 'wireless_ptp' | 'wireless_ptmp' | 'vpn_tunnel';

export type LinkStatus = 'active' | 'no_link' | 'degraded' | 'unknown';

export interface Device {
  id: string;
  towerId: string | null;
  type: DeviceType;
  role: DeviceRole;
  name: string;
  model: string;
  brand: string;
  ipAddress?: string;
  macAddress?: string;
  /** Source ID from live data (SavedDevice.id for APs, CPE mac, NodeInfo.id) */
  sourceId?: string;
  /** 'ap' | 'cpe' | 'vpn_node' = auto-synced, 'ptp_manual' = user-created */
  sourceType?: 'ap' | 'cpe' | 'vpn_node' | 'ptp_manual' | 'ptp_virtual';
  /** Signal dBm — for CPEs */
  signal?: number;
  /** CCQ % — for CPEs */
  ccq?: number;
  /** TX rate Mbps */
  txRate?: number;
  /** RX rate Mbps */
  rxRate?: number;
  /** Number of connected CPEs — for APs */
  cpeCount?: number;
  /** VPN tunnel IP — for vpn_node devices */
  vpnIp?: string;
  /** VPN service type */
  vpnService?: 'sstp' | 'wireguard';
  /** LAN segment — for vpn_node devices */
  lanSegment?: string;
  canvasX: number;
  canvasY: number;
  status: 'online' | 'offline' | 'unknown';
  importedFrom?: string;
  rawData?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Link {
  id: string;
  name?: string;
  sourceId: string;
  targetId: string;
  linkType: LinkType;
  status: LinkStatus;
  capacityGbps?: number;
  distanceMeters?: number;
  /** Source type to distinguish auto-generated vs manual links */
  sourceType?: 'auto' | 'manual';
  createdAt: number;
  updatedAt: number;
}

export interface ApCpeGroup {
  id: string;
  apDeviceId: string;
  cpeDeviceIds: string[];
  expanded: boolean;
  updatedAt: number;
}

export interface ImportSession {
  id: string;
  importedAt: number;
  source: 'manual' | 'json_paste' | 'api_fetch';
  rawPayload: string;
  devicesImported: number;
  towerId?: string;
  notes?: string;
}
