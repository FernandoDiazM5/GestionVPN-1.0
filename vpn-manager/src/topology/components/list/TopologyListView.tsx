import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { topologyDb } from '../../db/db';
import { useTopoUiStore } from '../../store/topoUiStore';
import { TowerContainer } from './TowerContainer';
import { CollapsibleNode } from './CollapsibleNode';
import { Server, Wifi, Network, Radio } from 'lucide-react';
import type { Device, Tower } from '../../db/tables';

export default function TopologyListView() {
  const { selectedTowerId } = useTopoUiStore();
  const towers = useLiveQuery(() => topologyDb.towers.toArray()) || [];
  const devices = useLiveQuery(() => topologyDb.devices.toArray()) || [];

  // Pre-compute CPEs by sourceId (AP device ID) to avoid O(n²) in TowerBlock
  const cpesBySourceId = useMemo(() => {
    const map = new Map<string, Device[]>();
    devices.forEach(d => {
      if (d.role === 'cpe' && d.sourceId) {
        if (!map.has(d.sourceId)) map.set(d.sourceId, []);
        map.get(d.sourceId)!.push(d);
      }
    });
    return map;
  }, [devices]);

  const getTowerDevices = (towerId: string) => {
    // Internal devices belonging to this tower
    const internal = devices.filter(d => d.towerId === towerId);
    // AP IDs inside this tower
    const apIds = new Set(internal.filter(d => d.role === 'ap').map(d => d.id));
    // External CPEs linked to those APs (towerId is null but sourceId is the apDevId)
    const externalCpes = devices.filter(d => d.role === 'cpe' && d.towerId === null && d.sourceId && apIds.has(d.sourceId));
    return [...internal, ...externalCpes];
  };

  const displayTowers = selectedTowerId 
    ? towers.filter(t => t.id === selectedTowerId) 
    : [];

  if (!selectedTowerId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center max-w-sm text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <Network size={32} className="text-blue-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Seleccione una Torre</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Haga clic en una torre del panel lateral izquierdo para inspeccionar a detalle su jerarquía de red (PTP, Nodo VPN y Access Points).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        {displayTowers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 italic border border-slate-200 rounded-lg">
            No hay torres creadas o encontradas. Puedes agregarlas usando el panel lateral.
          </div>
        ) : (
          displayTowers.map(tower => (
            <TowerBlock key={tower.id} tower={tower} devices={getTowerDevices(tower.id)} cpesBySourceId={cpesBySourceId} />
          ))
        )}
      </div>
    </div>
  );
}

function MockNodeCard({ device, onClick }: { device: Device; onClick?: () => void }) {
  const { setSelectedDeviceId } = useTopoUiStore();
  const isVpn = device.role === 'vpn_node';
  const isPtp = device.role === 'ptp_main' || device.role === 'ptp_station';
  const Icon = isVpn ? Network : isPtp ? Radio : device.role === 'ap' ? Wifi : Server;
  const color = isVpn ? 'text-indigo-600' : isPtp ? 'text-emerald-600' : device.role === 'ap' ? 'text-blue-500' : 'text-slate-600';
  const bg = isVpn ? 'bg-indigo-50' : isPtp ? 'bg-emerald-50' : device.role === 'ap' ? 'bg-blue-50' : 'bg-slate-100';

  return (
    <div 
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick();
        else setSelectedDeviceId(device.id);
      }}
      className="bg-white rounded-lg shadow-sm border border-slate-200 px-4 py-3 flex items-center gap-3 max-w-sm cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
    >
      <div className={`p-2 rounded-md ${bg}`}>
        <Icon size={18} className={color} />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-bold text-slate-800 leading-tight">{device.name}</span>
        <span className="text-xs text-slate-400 capitalize">{device.role.replace('_', ' ')}</span>
      </div>
    </div>
  );
}

function MockGenericCard({ title, name, ip, model, onClick }: { title: string; name: string; ip: string; model: string; onClick?: () => void }) {
  // Use a specialized emerald styling similar to ptp role
  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="bg-emerald-50/50 rounded-lg shadow-sm border border-emerald-100 px-4 py-3 flex items-center gap-3 w-full flex-1 cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all group"
    >
      <div className="p-2 rounded-md bg-white border border-emerald-100">
        <Radio size={18} className="text-emerald-600" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide">{title}</span>
        <span className="text-sm font-bold text-slate-800 leading-tight block truncate" title={name || 'Sin nombre'}>{name || 'Sin nombre'}</span>
        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
          <span className="font-medium bg-emerald-100 text-emerald-700 px-1.5 rounded">{ip}</span>
          <span className="text-slate-300">•</span>
          <span className="truncate max-w-[120px]">{model || 'Variante Genérica'}</span>
        </div>
      </div>
    </div>
  );
}

function TowerBlock({ tower, devices, cpesBySourceId }: { tower: Tower; devices: Device[]; cpesBySourceId: Map<string, Device[]> }) {
  const { setShowTowerSettings } = useTopoUiStore();
  const nodeDevice = devices.find(d => d.role === 'vpn_node' || d.role === 'tower_router');
  const aps = devices.filter(d => d.role === 'ap');
  const standaloneCpes = devices.filter(d => d.role === 'cpe' && !d.sourceId);

  const ptpUI = (tower.ptp_emisor_ip || tower.ptp_receptor_ip) ? (
    <div className="flex flex-col md:flex-row gap-3 w-full">
      {tower.ptp_emisor_ip && <MockGenericCard title="Emisor PTP" name={tower.ptp_emisor_nombre || ''} ip={tower.ptp_emisor_ip} model={tower.ptp_emisor_modelo || ''} onClick={() => setShowTowerSettings(true)} />}
      {tower.ptp_receptor_ip && <MockGenericCard title="Receptor PTP" name={tower.ptp_receptor_nombre || ''} ip={tower.ptp_receptor_ip} model={tower.ptp_receptor_modelo || ''} onClick={() => setShowTowerSettings(true)} />}
    </div>
  ) : null;

  return (
    <TowerContainer
      towerName={tower.name}
      ptpDevice={ptpUI}
      nodeDevice={nodeDevice ? <MockNodeCard device={nodeDevice} /> : null}
    >
      {aps.length > 0 && (
        <CollapsibleNode
          title={<span className="font-semibold text-slate-700">Access Points de la Torre ({aps.length})</span>}
          levelLabel="Ver APs"
          defaultOpen={false}
        >
          <div className="flex flex-col gap-3">
            {aps.map(ap => {
              const cpes = cpesBySourceId.get(ap.id) ?? [];
              return (
                <CollapsibleNode
                  key={ap.id}
                  title={<MockNodeCard device={ap} />}
                  levelLabel={cpes.length > 0 ? `Ver ${cpes.length} CPEs` : "Sin CPEs"}
                  defaultOpen={false}
                >
                  <div className="flex flex-col gap-2 pl-4">
                    {cpes.length > 0 ? cpes.map(cpe => (
                      <MockNodeCard key={cpe.id} device={cpe} />
                    )) : (
                      <span className="text-xs text-slate-400 italic">No hay CPEs registrados</span>
                    )}
                  </div>
                </CollapsibleNode>
              );
            })}
          </div>
        </CollapsibleNode>
      )}

      {standaloneCpes.length > 0 && (
        <CollapsibleNode
          title={<span className="font-semibold text-red-500">CPEs sin AP Asignado ({standaloneCpes.length})</span>}
          levelLabel="Ver Huérfanos"
          defaultOpen={true}
        >
          <div className="flex flex-col gap-2">
            {standaloneCpes.map(cpe => <MockNodeCard key={cpe.id} device={cpe} />)}
          </div>
        </CollapsibleNode>
      )}
    </TowerContainer>
  );
}