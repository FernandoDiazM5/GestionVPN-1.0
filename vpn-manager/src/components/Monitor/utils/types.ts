import type { SavedDevice } from '../../../types/devices';

interface NodeGroup { nodeId: string; nodeName: string; aps: SavedDevice[]; stas: SavedDevice[]; }

export type { NodeGroup };
