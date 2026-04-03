import { useState } from 'react';
import { User, GitBranch, Building2, Calculator, Plus, ChevronRight, ChevronDown, Wifi, Network, Radio } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { topologyDb } from '../../db/db';
import { useTopoUiStore } from '../../store/topoUiStore';

type SidebarTab = 'topology' | 'profile' | 'infrastructure' | 'tools';

const tabs: Array<{ id: SidebarTab; icon: typeof User; label: string }> = [
  { id: 'profile', icon: User, label: 'Perfil' },
  { id: 'topology', icon: GitBranch, label: 'Topologia' },
  { id: 'infrastructure', icon: Building2, label: 'Infraestructura' },
  { id: 'tools', icon: Calculator, label: 'Herramientas' },
];

const roleIcon: Record<string, typeof Wifi> = {
  vpn_node: Network,
  ap: Wifi,
  ptp_main: Radio,
  ptp_station: Radio,
  cpe: Radio,
};

function TowerList() {
  const towers = useLiveQuery(() => topologyDb.towers.toArray());
  const devices = useLiveQuery(() => topologyDb.devices.toArray());
  const { setShowAddTowerModal, setShowAddPTPModal, setSelectedDeviceId } = useTopoUiStore();
  const [expandedTowers, setExpandedTowers] = useState<Set<string>>(new Set());

  const toggleTower = (id: string) => {
    setExpandedTowers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nodos</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowAddPTPModal(true)}
              className="p-1 rounded hover:bg-blue-50 text-blue-500 transition-colors"
              title="Agregar enlace PTP"
            >
              <Radio size={14} />
            </button>
            <button
              onClick={() => setShowAddTowerModal(true)}
              className="p-1 rounded hover:bg-blue-50 text-blue-500 transition-colors"
              title="Agregar torre manual"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {towers?.map((t) => {
          const towerDevices = devices?.filter((d) => d.towerId === t.id) ?? [];
          const isOpen = expandedTowers.has(t.id);
          const isVpn = t.sourceType === 'vpn_node';

          return (
            <div key={t.id} className="mb-1">
              <button
                onClick={() => toggleTower(t.id)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-100 text-left transition-colors"
              >
                {isOpen ? (
                  <ChevronDown size={12} className="text-slate-400" />
                ) : (
                  <ChevronRight size={12} className="text-slate-400" />
                )}
                {isVpn ? (
                  <Network size={12} className={t.vpnRunning ? 'text-indigo-500' : 'text-slate-400'} />
                ) : (
                  <Wifi size={12} className="text-blue-500" />
                )}
                <span className="text-xs font-medium text-slate-700 truncate flex-1">{t.name}</span>
                <div className="flex items-center gap-1">
                  {isVpn && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        t.vpnRunning ? 'bg-emerald-400' : 'bg-red-400'
                      }`}
                    />
                  )}
                  <span className="text-[10px] text-slate-400">{towerDevices.length}</span>
                </div>
              </button>

              {isOpen && (
                <div className="ml-5 pl-2 border-l border-slate-100">
                  {towerDevices.map((d) => {
                    const Icon = roleIcon[d.role] ?? Wifi;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDeviceId(d.id)}
                        className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 rounded cursor-pointer text-left"
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            d.status === 'online' ? 'bg-emerald-400' : 'bg-slate-300'
                          }`}
                        />
                        <Icon size={10} className="text-slate-400 shrink-0" />
                        <span className="truncate">{d.name}</span>
                        {d.role === 'ap' && d.cpeCount != null && d.cpeCount > 0 && (
                          <span className="text-[9px] text-slate-400 ml-auto">{d.cpeCount} CPE</span>
                        )}
                      </button>
                    );
                  })}

                  {/* Standalone CPEs linked to this tower's APs */}
                  {(() => {
                    const apIds = towerDevices.filter(d => d.role === 'ap').map(d => d.id);
                    if (apIds.length === 0) return null;
                    // Show CPE count summary
                    const totalCpes = towerDevices
                      .filter(d => d.role === 'ap')
                      .reduce((sum, d) => sum + (d.cpeCount ?? 0), 0);
                    if (totalCpes > 0) {
                      return (
                        <div className="px-2 py-1 text-[10px] text-slate-400 italic">
                          {totalCpes} CPE{totalCpes !== 1 ? 's' : ''} conectados
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>
          );
        })}

        {towers && towers.length === 0 && (
          <div className="text-center py-6">
            <p className="text-xs text-slate-400">Sin nodos</p>
            <p className="text-[10px] text-slate-300 mt-1">Activa un tunel VPN para ver los nodos</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TopoSidebar() {
  const { sidebarTab, setSidebarTab } = useTopoUiStore();
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="flex shrink-0 h-full">
      {/* Icon rail */}
      <div className="w-12 border-r border-slate-200 bg-white flex flex-col items-center py-4 gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = sidebarTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                if (sidebarTab === t.id) {
                  setExpanded((p) => !p);
                } else {
                  setSidebarTab(t.id);
                  setExpanded(true);
                }
              }}
              className={`p-2 rounded-lg transition-colors ${
                isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
              title={t.label}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>

      {/* Expandable panel */}
      {expanded && sidebarTab === 'topology' && (
        <div className="w-56 border-r border-slate-200 bg-white">
          <TowerList />
        </div>
      )}
    </div>
  );
}
