import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { topologyDb } from '../../db/db';
import { useTopoUiStore } from '../../store/topoUiStore';

export default function AddTowerModal() {
  const { showAddTowerModal, setShowAddTowerModal } = useTopoUiStore();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  if (!showAddTowerModal) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const now = Date.now();
      await topologyDb.towers.add({
        id: uuidv4(),
        name: name.trim(),
        location: location.trim() || undefined,
        sourceType: 'manual',
        canvasX: 100 + Math.random() * 200,
        canvasY: 100 + Math.random() * 200,
        canvasWidth: 500,
        canvasHeight: 380,
        collapsed: false,
        createdAt: now,
        updatedAt: now,
      });
      setName('');
      setLocation('');
      setShowAddTowerModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName('');
    setLocation('');
    setShowAddTowerModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800">Nueva Torre</h3>
          <button onClick={handleClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Torre Central"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Ubicacion</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ej: Sector Norte"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
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
            disabled={!name.trim() || saving}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1"
          >
            <Plus size={12} />
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}
