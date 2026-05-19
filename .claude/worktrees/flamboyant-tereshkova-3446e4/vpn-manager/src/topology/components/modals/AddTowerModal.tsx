import { useState, useRef } from 'react';
import { X, Plus, Upload } from 'lucide-react';
import { useTopoUiStore } from '../../store/topoUiStore';
import { API_BASE_URL } from '../../../config';
import { apiFetch } from '../../../utils/apiClient';

export default function AddTowerModal() {
  const { showAddTowerModal, setShowAddTowerModal } = useTopoUiStore();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [tramos, setTramos] = useState<number>(0);
  const [contacto, setContacto] = useState('');
  const [file, setFile] = useState<File | null>(null);
  
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!showAddTowerModal) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const formData = new FormData();
      const torreData = {
        nombre: name.trim(),
        ubicacion: location.trim(),
        tramos: Number(tramos),
        contacto: contacto.trim()
      };
      
      formData.append('torreData', JSON.stringify(torreData));
      if (file) {
        formData.append('contrato', file);
      }

      await apiFetch(`${API_BASE_URL}/api/topology/torre`, {
        method: 'POST',
        // apiFetch normally sets Content-Type to undefined/auto when body is FormData
        body: formData,
      });

      handleClose();
    } catch(err) {
      console.error('Error al subir torre:', err);
      alert('Error guardando la torre');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName('');
    setLocation('');
    setTramos(0);
    setContacto('');
    setFile(null);
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
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
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
            <label className="block text-xs font-semibold text-slate-600 mb-1">Ubicación (opcional)</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ej: Sector Norte"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cant. Tramos (opcional)</label>
              <input
                type="number"
                value={tramos}
                onChange={(e) => setTramos(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Contacto Encargado</label>
              <input
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
                placeholder="Ej: 999111222"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Contrato PDF (opcional)</label>
            <div 
              className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef}
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <Upload size={18} className="mx-auto text-slate-400 mb-2" />
              <div className="text-xs text-slate-500">
                {file ? <span className="text-indigo-600 font-semibold">{file.name}</span> : 'Haz clic para seleccionar o subir PDF'}
              </div>
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
