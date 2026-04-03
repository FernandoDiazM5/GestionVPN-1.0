import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type NodeMouseHandler,
  type Node,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useTopologyBuilder } from '../../hooks/useTopologyBuilder';
import { useTopoUiStore } from '../../store/topoUiStore';
import { topologyDb } from '../../db/db';

import { TowerGroupNode } from '../nodes/TowerGroupNode';
import { SwitchNode } from '../nodes/SwitchNode';
import { VpnNodeNode } from '../nodes/VpnNodeNode';
import { PTPNode } from '../nodes/PTPNode';
import { APNode } from '../nodes/APNode';
import { CPENode } from '../nodes/CPENode';

import { WiredEdge } from '../edges/WiredEdge';
import { WirelessActiveEdge } from '../edges/WirelessActiveEdge';
import { NoLinkEdge } from '../edges/NoLinkEdge';

/* Node & edge types must be stable refs outside the component */
const nodeTypes = {
  towerGroup: TowerGroupNode,
  switchNode: SwitchNode,
  vpnNodeNode: VpnNodeNode,
  ptpNode: PTPNode,
  apNode: APNode,
  cpeNode: CPENode,
} as const;

const edgeTypes = {
  wiredEdge: WiredEdge,
  wirelessActiveEdge: WirelessActiveEdge,
  noLinkEdge: NoLinkEdge,
} as const;

export default function TopologyCanvas() {
  const { nodes: builderNodes, edges: builderEdges, isLoading } = useTopologyBuilder();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();
  const setSelectedDeviceId = useTopoUiStore((s) => s.setSelectedDeviceId);

  // Sync builder data into local state
  useEffect(() => {
    if (builderNodes.length > 0) {
      setNodes(builderNodes);
    }
  }, [builderNodes, setNodes]);

  useEffect(() => {
    setEdges(builderEdges);
  }, [builderEdges, setEdges]);

  // Fit view on first meaningful load
  useEffect(() => {
    if (builderNodes.length > 0) {
      const timer = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 200);
      return () => clearTimeout(timer);
    }
  }, [builderNodes.length, fitView]);

  // Persist position on drag stop
  const onNodeDragStop: NodeMouseHandler = useCallback(
    async (_event, node: Node) => {
      const now = Date.now();
      // Check if it's a tower group node
      const tower = await topologyDb.towers.get(node.id);
      if (tower) {
        await topologyDb.towers.update(node.id, {
          canvasX: node.position.x,
          canvasY: node.position.y,
          updatedAt: now,
        });
      } else {
        await topologyDb.devices.update(node.id, {
          canvasX: node.position.x,
          canvasY: node.position.y,
          updatedAt: now,
        });
      }
    },
    []
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node: Node) => {
      // Only select device nodes, not tower groups
      if (node.type !== 'towerGroup') {
        setSelectedDeviceId(node.id);
      }
    },
    [setSelectedDeviceId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedDeviceId(null);
  }, [setSelectedDeviceId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Cargando topologia...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ animated: false }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
      </ReactFlow>
    </div>
  );
}
