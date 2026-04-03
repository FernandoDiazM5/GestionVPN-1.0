import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Node, Edge } from '@xyflow/react';
import { topologyDb } from '../db/db';
import type { Tower, Device, Link } from '../db/tables';

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

  const isLoading = towers === undefined || devices === undefined || links === undefined;

  const nodes = useMemo<Node[]>(() => {
    if (!towers || !devices) return [];

    const result: Node[] = [];

    // Tower group nodes
    for (const t of towers) {
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
          deviceCount: devices.filter((d) => d.towerId === t.id).length,
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

    // Device nodes
    for (const d of devices) {
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
  }, [towers, devices]);

  const edges = useMemo<Edge[]>(() => {
    if (!links) return [];

    return links.map((l) => ({
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
    }));
  }, [links]);

  return { nodes, edges, isLoading };
}
