import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useLiveQuery } from 'dexie-react-hooks';
import { topologyDb } from '../../db/db';
import { useTopoUiStore } from '../../store/topoUiStore';

export default function AddPTPModal() {
  const { showAddPTPModal, setShowAddPTPModal } = useTopoUiStore();
  const towers = useLiveQuery(() => topologyDb.towers.toArray());

  const [towerId, setTowerId] = useState('');
  const [mainName, setMainName] = useState('');
  const [stationName, setStationName] = useState('');
  const [model, setModel] = useState('airFiber');
  const [mainIp, setMainIp] = useState('');
  const [stationIp, setStationIp] = useState('');
  const [saving, setSaving] = useState(false);

  if (!showAddPTPModal) return null;

  const handleCreate = async () => {
    if (!towerId || !mainName.trim()) return;
    setSaving(true);
    try {
      const now = Date.now();
      const mainId = uuidv4();
      const stationId = uuidv4();

      const tower = await topologyDb.towers.get(towerId);
      const towerX = tower?.canvasX ?? 80;
      const towerY = tower?.canvasY ?? 80;
      const towerW = tower?.canvasWidth ?? 550;

      // Main PTP inside tower
      await topologyDb.devices.add({
        id: mainId,
        towerId,
        type: 'ptp',
        role: 'ptp_main',
        name: mainName.trim(),
        model: model.trim() || 'airFiber',
        brand: 'Ubiquiti',
        ipAddress: mainIp.trim() || undefined,
        sourceType: 'ptp_manual',
        canvasX: 300,
        canvasY: 60,
        status: 'online',
        createdAt: now,
        updatedAt: now,
      });

      // Station PTP outside tower
      await topologyDb.devices.add({
        id: stationId,
        towerId: null,
        type: 'ptp',
        role: 'ptp_station',
        name: stationName.trim() || `${mainName.trim()}-STA`,
        model: model.trim() || 'airFiber',
        brand: 'Ubiquiti',
        ipAddress: stationIp.trim() || undefined,
        sourceType: 'ptp_manual',
        canvasX: towerX + towerW + 200,
        canvasY: towerY + 60,
        status: 'online',
        createdAt: now,
        updatedAt: now,
      });

      // Wireless PTP link
      await topologyDb.links.add({
        id: uuidv4(),
        name: `${mainName.trim()} ↔ ${stationName.trim() || 'Station'}`,
        sourceId: mainId,
        targetId: stationId,
        linkType: 'wireless_ptp',
        status: 'active',
        sourceType: 'manual',
        createdAt: now,
        updatedAt: now,
      });

      // Reset form
      setTowerId('');
      setMainName('');
      setStationName('');
      setModel('airFiber');
      setMainIp('');
      setStationIp('');
      setShowAddPTPModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setTowerId('');
    setMainName('');
    setStationName('');
    setShowAddPTPModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800">Agregar Enlace PTP</h3>
          <button onClick={handleClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Torre destino *</label>
            <select
              value={towerId}
              onChange={(e) => setTowerId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Seleccionar torre...</option>
              {towers?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre Main *</label>
              <input
                value={mainName}
                onChange={(e) => setMainName(e.target.value)}
                placeholder="PTP-Main"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre Station</label>
              <input
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                placeholder="PTP-Station"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Modelo</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="airFiber 60 LR"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">IP Main</label>
              <input
                value={mainIp}
                onChange={(e) => setMainIp(e.target.value)}
                placeholder="192.168.1.2"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">IP Station</label>
              <input
                value={stationIp}
                onChange={(e) => setStationIp(e.target.value)}
                placeholder="192.168.2.1"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!towerId || !mainName.trim() || saving}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1"
          >
            <Plus size={12} />
            Crear PTP
          </button>
        </div>
      </div>
    </div>
  );
}
