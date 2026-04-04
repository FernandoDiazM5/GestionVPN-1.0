import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Node, Edge } from '@xyflow/react';
import { topologyDb } from '../db/db';
import { useTopoUiStore } from '../store/topoUiStore';
import type { Device, Link } from '../db/tables';

/** Map device role to custom node type */
function deviceNodeType(role: Device['role']): string {
  switch (role) {
    case 'vpn_node':
      return 'vpnNodeNode';
    case 'tower_router':
      return 'switchNode';
    case 'ptp_main':
    case 'ptp_station':
      return 'ptpNode';
    case 'ap':
      return 'apNode';
    case 'cpe':
      return 'cpeNode';
    default:
      return 'switchNode';
  }
}

/** Map link to custom edge type */
function linkEdgeType(link: Link): string {
  if (link.status === 'no_link') return 'noLinkEdge';
  if (link.linkType === 'wired' || link.linkType === 'fiber' || link.linkType === 'vpn_tunnel')
    return 'wiredEdge';
  return 'wirelessActiveEdge';
}

function buildEdgeLabel(link: Link): string {
  if (link.status === 'no_link') return 'No Link';
  if (link.capacityGbps != null) return `${link.capacityGbps.toFixed(2)} Gbps`;
  return '';
}

export function useTopologyBuilder(): {
  nodes: Node[];
  edges: Edge[];
  isLoading: boolean;
} {
  const towers = useLiveQuery(() => topologyDb.towers.toArray());
  const devices = useLiveQuery(() => topologyDb.devices.toArray());
  const links = useLiveQuery(() => topologyDb.links.toArray());
  const apCpeGroups = useLiveQuery(() => topologyDb.apCpeGroups.toArray());
  const { selectedTowerId } = useTopoUiStore();

  const isLoading = towers === undefined || devices === undefined || links === undefined;

  const nodes = useMemo<Node[]>(() => {
    if (!towers || !devices) return [];

    const result: Node[] = [];

    // Build a set of AP device IDs that belong to the selected tower
    // (needed to resolve external devices: PTP Emisor + CPEs)
    const towerApDevIds = new Set<string>();
    const towerPtpSourceIds = new Set<string>(); // sourceId (torre.id) for PTP devices

    // Tower group nodes
    for (const t of towers) {
      if (selectedTowerId && t.id !== selectedTowerId) continue;

      // Count only devices with towerId set to this tower (internal devices)
      const internalCount = devices.filter((d) => d.towerId === t.id).length;
      // Also count external devices linked to this tower's APs
      const towerInternalAps = devices.filter(d => d.towerId === t.id && d.role === 'ap');
      towerInternalAps.forEach(ap => towerApDevIds.add(ap.id));

      // Track PTP sourceIds for this tower
      const towerIdStripped = t.id.replace('tower-', '');
      towerPtpSourceIds.add(towerIdStripped);

      // Count external CPEs linked to internal APs
      const externalCpeCount = devices.filter(d => 
        d.role === 'cpe' && d.towerId === null && d.sourceId && towerApDevIds.has(d.sourceId)
      ).length;

      // Count external PTP emisor
      const externalPtpCount = devices.filter(d => 
        d.role === 'ptp_main' && d.towerId === null && d.sourceId === towerIdStripped
      ).length;

      result.push({
        id: t.id,
        type: 'towerGroup',
        position: { x: t.canvasX, y: t.canvasY },
        data: {
          label: t.name,
          location: t.location ?? '',
          collapsed: t.collapsed,
          width: t.canvasWidth,
          height: t.canvasHeight,
          deviceCount: internalCount + externalCpeCount + externalPtpCount,
          vpnRunning: t.vpnRunning,
          vpnProtocol: t.vpnProtocol,
          sourceType: t.sourceType,
        },
        style: {
          width: t.canvasWidth,
          height: t.collapsed ? 60 : t.canvasHeight,
          padding: 0,
        },
        draggable: true,
      });
    }

    // Build set of hidden CPE IDs (collapsed groups)
    const hiddenCpeIds = new Set<string>();
    if (apCpeGroups) {
      for (const g of apCpeGroups) {
        if (!g.expanded) {
          g.cpeDeviceIds.forEach(id => hiddenCpeIds.add(id));
        }
      }
    }

    // Device nodes
    for (const d of devices) {
      // For devices WITH a towerId, filter by selectedTowerId
      if (d.towerId) {
        if (selectedTowerId && d.towerId !== selectedTowerId) continue;
      } else {
        // External devices (towerId === null): PTP Emisor and CPEs
        // Only show if they belong to the selected tower's context
        if (selectedTowerId) {
          const isPtpEmisor = d.role === 'ptp_main' && d.sourceType === 'ptp_virtual';
          const isCpe = d.role === 'cpe';

          if (isPtpEmisor) {
            // PTP Emisor: sourceId is torre.id, check if it matches selected tower
            if (!towerPtpSourceIds.has(d.sourceId ?? '')) continue;
          } else if (isCpe) {
            // CPE: sourceId is apDevId, check if it belongs to a tower AP
            if (!d.sourceId || !towerApDevIds.has(d.sourceId)) continue;
          } else {
            continue; // Skip other external devices
          }
        } else {
          continue; // No tower selected → don't show external devices
        }
      }

      // Hide CPEs whose group is collapsed
      if (d.role === 'cpe' && hiddenCpeIds.has(d.id)) continue;

      const node: Node = {
        id: d.id,
        type: deviceNodeType(d.role),
        position: { x: d.canvasX, y: d.canvasY },
        data: {
          label: d.name,
          model: d.model,
          brand: d.brand,
          status: d.status,
          role: d.role,
          type: d.type,
          ipAddress: d.ipAddress ?? '',
          deviceId: d.id,
          macAddress: d.macAddress ?? '',
          // VPN node specific
          vpnIp: d.vpnIp ?? '',
          vpnService: d.vpnService ?? '',
          lanSegment: d.lanSegment ?? '',
          // AP specific
          cpeCount: d.cpeCount ?? 0,
          // CPE specific
          signal: d.signal,
          ccq: d.ccq,
          txRate: d.txRate,
          rxRate: d.rxRate,
        },
        draggable: true,
      };

      if (d.towerId) {
        node.parentId = d.towerId;
        node.extent = 'parent' as const;
      }

      result.push(node);
    }

    return result;
  }, [towers, devices, selectedTowerId, apCpeGroups]);

  // Build a set of visible node IDs for edge filtering
  const visibleNodeIds = useMemo(() => {
    return new Set(nodes.map(n => n.id));
  }, [nodes]);

  const edges = useMemo<Edge[]>(() => {
    if (!links) return [];

    // Only show edges where both source and target nodes are visible
    return links
      .filter(l => visibleNodeIds.has(l.sourceId) && visibleNodeIds.has(l.targetId))
      .map((l) => {
        const edge: Edge = {
          id: l.id,
          source: l.sourceId,
          target: l.targetId,
          type: linkEdgeType(l),
          data: {
            label: buildEdgeLabel(l),
            linkType: l.linkType,
            status: l.status,
            capacityGbps: l.capacityGbps,
          },
          label: buildEdgeLabel(l),
        };

        // VPN→Receptor link: use specific handles (Receptor bottom → VPN top)
        // The link is stored as source=vpnDevId, target=receptorId
        // But we want cable from Receptor bottom to VPN top, so we swap and use handles
        if (l.id.startsWith('link-ptp-vpn-')) {
          // Swap source/target for visual routing: Receptor bottom → VPN top
          edge.source = l.targetId; // receptorId
          edge.target = l.sourceId; // vpnDevId
          edge.sourceHandle = 'bottom';
          edge.targetHandle = 'top';
        }

        return edge;
      });
  }, [links, visibleNodeIds]);

  return { nodes, edges, isLoading };
}
