import type { SavedDevice } from '../../../types/devices';
import type { PollResult } from '../../../types/apMonitor';

type ApStatus = 'online' | 'partial' | 'inactive' | 'connecting';

function getApStatus(
  d: SavedDevice,
  pollResults: Record<string, PollResult>,
  activeNodeName: string | null,
  tunnelActive: boolean,
): ApStatus {
  const belongsToActiveNode = !!activeNodeName && d.nodeName === activeNodeName;
  if (!tunnelActive || !belongsToActiveNode) {
    const r = pollResults[d.id];
    if (r && (r.stations.length > 0 || r.polledAt > 0)) return 'partial';
    return 'inactive';
  }
  const r = pollResults[d.id];
  if (!r) return 'inactive';
  if (r.loading && !r.polledAt) return 'connecting';
  if (r.error) return r.stations.length > 0 ? 'partial' : 'inactive';
  if (r.stations.length > 0) return 'online';
  return 'partial';
}

export { getApStatus, type ApStatus };
