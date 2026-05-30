import type { SavedDevice } from '../../../../types/devices';

export interface NodeGroup {
  nodeId: string;
  nodeName: string;
  aps: SavedDevice[];
  stas: SavedDevice[];
}
