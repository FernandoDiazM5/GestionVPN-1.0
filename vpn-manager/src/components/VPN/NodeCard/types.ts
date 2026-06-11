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
