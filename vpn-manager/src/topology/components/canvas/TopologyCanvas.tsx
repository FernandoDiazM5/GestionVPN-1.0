import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type Node,
  type Edge,
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
import { Network, Trash2, X } from 'lucide-react';

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

// ── Context menu panel ────────────────────────────────────────────────
interface ContextMenuProps {
  x: number;
  y: number;
  nodeId?: string;
  edgeId?: string;
  onDelete: () => void;
  onClose: () => void;
}

function ContextMenu({ x, y, nodeId, edgeId, onDelete, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 min-w-[160px] animate-in zoom-in-95 duration-150"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-1.5 border-b border-slate-100">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {nodeId ? 'Dispositivo' : 'Enlace'}
        </span>
      </div>
      <button
        onClick={onDelete}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
      >
        <Trash2 size={14} />
        Eliminar
      </button>
      <button
        onClick={onClose}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
      >
        <X size={14} />
        Cancelar
      </button>
    </div>
  );
}

// ── Main Canvas ───────────────────────────────────────────────────────
export default function TopologyCanvas() {
  const { nodes: builderNodes, edges: builderEdges, isLoading } = useTopologyBuilder();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();
  const { setSelectedDeviceId, setSelectedLinkId, selectedTowerId, selectedDeviceId, selectedLinkId } = useTopoUiStore();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; nodeId?: string; edgeId?: string;
  } | null>(null);

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
      if (node.type !== 'towerGroup') {
        setSelectedDeviceId(node.id);
      }
      setContextMenu(null);
    },
    [setSelectedDeviceId]
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge: Edge) => {
      setSelectedLinkId(edge.id);
      setContextMenu(null);
    },
    [setSelectedLinkId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedDeviceId(null);
    setSelectedLinkId(null);
    setContextMenu(null);
  }, [setSelectedDeviceId, setSelectedLinkId]);

  // Right-click context menu on nodes
  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node: Node) => {
      event.preventDefault();
      if (node.type === 'towerGroup') return; // Don't delete towers from canvas
      setSelectedDeviceId(node.id);
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    [setSelectedDeviceId]
  );

  // Right-click context menu on edges
  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event, edge: Edge) => {
      event.preventDefault();
      setSelectedLinkId(edge.id);
      setContextMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
    },
    [setSelectedLinkId]
  );

  // Delete selected node or edge
  const handleDelete = useCallback(async () => {
    if (contextMenu?.nodeId) {
      const devId = contextMenu.nodeId;
      // Delete device from Dexie
      await topologyDb.devices.delete(devId);
      // Delete all links connected to this device
      const relatedLinks = await topologyDb.links.toArray();
      const toDelete = relatedLinks.filter(l => l.sourceId === devId || l.targetId === devId);
      if (toDelete.length > 0) {
        await topologyDb.links.bulkDelete(toDelete.map(l => l.id));
      }
      // Delete ApCpeGroup if this is an AP
      const groups = await topologyDb.apCpeGroups.where('apDeviceId').equals(devId).toArray();
      if (groups.length > 0) {
        await topologyDb.apCpeGroups.bulkDelete(groups.map(g => g.id));
      }
      setSelectedDeviceId(null);
    } else if (contextMenu?.edgeId) {
      await topologyDb.links.delete(contextMenu.edgeId);
      setSelectedLinkId(null);
    }
    setContextMenu(null);
  }, [contextMenu, setSelectedDeviceId, setSelectedLinkId]);

  // Keyboard: Delete/Backspace to remove selected
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Ignore if user is typing in an input
        if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

        if (selectedDeviceId) {
          await topologyDb.devices.delete(selectedDeviceId);
          const relatedLinks = await topologyDb.links.toArray();
          const toDelete = relatedLinks.filter(l => l.sourceId === selectedDeviceId || l.targetId === selectedDeviceId);
          if (toDelete.length > 0) {
            await topologyDb.links.bulkDelete(toDelete.map(l => l.id));
          }
          setSelectedDeviceId(null);
        } else if (selectedLinkId) {
          await topologyDb.links.delete(selectedLinkId);
          setSelectedLinkId(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedDeviceId, selectedLinkId, setSelectedDeviceId, setSelectedLinkId]);

  // Highlight selected edges
  const styledEdges = edges.map(e => ({
    ...e,
    selected: e.id === selectedLinkId,
    style: e.id === selectedLinkId
      ? { stroke: '#ef4444', strokeWidth: 3 }
      : undefined,
  }));

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

  if (!selectedTowerId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center max-w-sm text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <Network size={32} className="text-blue-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Seleccione una Torre</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Haga clic en una torre del panel lateral izquierdo para inspeccionar a detalle su topología en el lienzo 2D.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ animated: false }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null} // We handle delete ourselves
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
      </ReactFlow>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          edgeId={contextMenu.edgeId}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
