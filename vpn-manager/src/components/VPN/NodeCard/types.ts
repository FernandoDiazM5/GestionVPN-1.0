import type { NodeInfo, TunnelActivateResponse } from '../../../types/api';

export type { NodeInfo, TunnelActivateResponse };

export interface NodeCardProps {
  node: NodeInfo;
  rowIndex: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onScript?: () => void;
  onRename?: (newName: string) => void;
  onHistory?: () => void;
  tags?: string[];
  onTagClick?: () => void;
  onDiagnose?: () => void;
  /** Permitir acciones de gestión (kebab, edición de nombre, SSH, etc.). Falso para MEMBER. */
  canManage?: boolean;
  /** §44: columnas de datos visibles (vrf/lan/ip_tunnel/ppp_user/tags/service/disabled/uptime).
   *  Se pasa desde NodesTable, derivado de useNodesPreferences.visibleCols.
   *  Si no se pasa → fallback al set histórico para no romper otros consumidores. */
  visibleCols?: string[];
}

export interface SshCred {
  user: string;
  pass: string;
}

export interface KebabCoords {
  top?: number;
  bottom?: number;
  right: number;
}
