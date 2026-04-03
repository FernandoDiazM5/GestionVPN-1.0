import { ReactFlowProvider } from '@xyflow/react';
import TopologyCanvas from './components/canvas/TopologyCanvas';
import TopoToolbar from './components/toolbar/TopoToolbar';
import TopoSidebar from './components/sidebar/TopoSidebar';
import DeviceDetailPanel from './components/panels/DeviceDetailPanel';
import AddTowerModal from './components/modals/AddTowerModal';
import AddPTPModal from './components/modals/AddPTPModal';
import ImportDevicesModal from './components/modals/ImportDevicesModal';
import { useTopologySync } from './hooks/useTopologySync';

function TopologyContent() {
  const { syncing } = useTopologySync();

  return (
    <div className="flex h-[calc(100vh-140px)] bg-slate-50 rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Sidebar */}
      <TopoSidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <TopoToolbar syncing={syncing} />
        <TopologyCanvas />
        <DeviceDetailPanel />
      </div>
    </div>
  );
}

export default function TopologyPage() {
  return (
    <ReactFlowProvider>
      <TopologyContent />

      {/* Modals */}
      <AddTowerModal />
      <AddPTPModal />
      <ImportDevicesModal />
    </ReactFlowProvider>
  );
}
