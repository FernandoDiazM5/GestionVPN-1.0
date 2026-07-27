import type { SavedDevice } from '../../../../types/devices';
import type { PollResult } from '../../../../types/apMonitor';

type ApStatus = 'online' | 'partial' | 'inactive' | 'connecting';
type NodeApStatus = ApStatus | 'empty';

export const AP_POLL_STALE_MS = 5 * 60_000;

function getApStatus(
  d: SavedDevice,
  pollResults: Record<string, PollResult>,
  activeNodeName: string | null,
  tunnelActive: boolean,
  now = Date.now(),
): ApStatus {
  const belongsToActiveNode = !!activeNodeName && d.nodeName === activeNodeName;
  const r = pollResults[d.id];
  if (!tunnelActive || !belongsToActiveNode) {
    if (r && (r.stations.length > 0 || r.polledAt > 0)) return 'partial';
    return 'inactive';
  }
  if (!r) return 'inactive';
  if (r.loading && !r.polledAt) return 'connecting';
  if (r.error) return 'partial';
  if (!r.polledAt) return 'inactive';
  if (now - r.polledAt > AP_POLL_STALE_MS) return 'partial';
  // Un poll exitoso sin estaciones significa que el AP respondió y tiene 0 CPE.
  return 'online';
}

function getNodeApStatus(statuses: ApStatus[]): NodeApStatus {
  if (statuses.length === 0) return 'empty';
  if (statuses.every(status => status === 'online')) return 'online';
  if (statuses.every(status => status === 'connecting')) return 'connecting';
  if (statuses.some(status => status === 'online' || status === 'partial')) return 'partial';
  if (statuses.some(status => status === 'connecting')) return 'connecting';
  return 'inactive';
}

export { getApStatus, getNodeApStatus, type ApStatus, type NodeApStatus };
