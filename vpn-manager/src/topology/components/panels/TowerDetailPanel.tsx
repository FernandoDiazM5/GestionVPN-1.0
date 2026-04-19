import { useEffect, useState } from 'react';
import { X, Save, FileText } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { topologyDb } from '../../db/db';
import { useTopoUiStore } from '../../store/topoUiStore';
import { useVpn } from '../../../context/VpnContext';
import { API_BASE_URL } from '../../../config';
import { apiFetch } from '../../../utils/apiClient';

export default function TowerDetailPanel() {
  const { selectedTowerId, setShowTowerSettings, showTowerSettings } = useTopoUiStore();
  const { nodes: vpnNodes } = useVpn();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load the tower from Dexie. Wait, tower `id` in dexie has `tower-` prefix vs SQLite internal id.
  const rawTower = useLiveQuery(
    () => (selectedTowerId ? topologyDb.towers.get(selectedTowerId) : undefined),
    [selectedTowerId]
  );

  // Local form state
  const [formData, setFormData] = useState({
    nodo_id: '',
    ptp_emisor_ip: '',
    ptp_emisor_nombre: '',
    ptp_emisor_modelo: '',
    ptp_receptor_ip: '',
    ptp_receptor_nombre: '',
    ptp_receptor_modelo: '',
  });

  useEffect(() => {
    if (rawTower) {
      setFormData({
        nodo_id: rawTower.nodo_id || '',
        ptp_emisor_ip: rawTower.ptp_emisor_ip || '',
        ptp_emisor_nombre: rawTower.ptp_emisor_nombre || '',
        ptp_emisor_modelo: rawTower.ptp_emisor_modelo || '',
        ptp_receptor_ip: rawTower.ptp_receptor_ip || '',
        ptp_receptor_nombre: rawTower.ptp_receptor_nombre || '',
        ptp_receptor_modelo: rawTower.ptp_receptor_modelo || '',
      });
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [rawTower]);

  if (!rawTower || !showTowerSettings) return null;

  // Extract real UUID from 'tower-UUID'
  const realTowerId = rawTower.id.replace('tower-', '');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`${API_BASE_URL}/api/topology/torre`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          id: realTowerId,
          nombre: rawTower.name
        })
      });
      await topologyDb.towers.update(rawTower.id, formData);
      setShowTowerSettings(false);
      alert('Configuración guardada correctamente.');
    } catch {
      alert('Error guardando configuración');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-2xl transition-transform duration-300 z-30 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ maxHeight: '60vh', overflowY: 'auto' }}
    >
      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{rawTower.name}</h2>
            <div className="text-xs text-slate-500 mt-0.5 space-x-3">
              {rawTower.location && <span>Ubicación: {rawTower.location}</span>}
              {rawTower.tramos && <span>Tramos: {rawTower.tramos}</span>}
              {rawTower.contacto && <span>Contacto: {rawTower.contacto}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {rawTower.pdf_path && (
              <a 
                href={`${API_BASE_URL}/uploads/${rawTower.pdf_path}`} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-md text-xs font-semibold hover:bg-blue-100 transition-colors"
                title="Ver Contrato PDF"
              >
                <FileText size={14} /> Contrato
              </a>
            )}
            <button
              onClick={() => setShowTowerSettings(false)}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3 border-t border-slate-100">
          
          {/* Nodo Seleccion */}
          <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <h3 className="text-xs font-bold uppercase text-indigo-600 tracking-wider mb-2">Asignar Nodo VPN</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nodo Activo</label>
              <select
                name="nodo_id"
                value={formData.nodo_id}
                onChange={handleChange}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:border-indigo-500 outline-none"
              >
                <option value="">-- Sin Nodo --</option>
                {vpnNodes.map(n => (
                  <option key={n.ppp_user} value={n.ppp_user}>{n.nombre_nodo} ({n.ip_tunnel})</option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Los Access Points y CPEs correspondientes a este nodo se cargarán automáticamente en la topología de esta torre.
            </p>
          </div>

          {/* PTP Emisor */}
          <div className="space-y-3 bg-emerald-50 p-3 rounded-lg border border-emerald-100">
            <h3 className="text-xs font-bold uppercase text-emerald-600 tracking-wider mb-2">PTP Emisor (Origen)</h3>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">IP *</label>
              <input name="ptp_emisor_ip" value={formData.ptp_emisor_ip} onChange={handleChange} className="w-full px-2 py-1 text-sm border rounded" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Nombre Dispositivo</label>
                <input name="ptp_emisor_nombre" value={formData.ptp_emisor_nombre} onChange={handleChange} className="w-full px-2 py-1 text-sm border rounded" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Modelo</label>
                <input name="ptp_emisor_modelo" value={formData.ptp_emisor_modelo} onChange={handleChange} className="w-full px-2 py-1 text-sm border rounded" />
              </div>
            </div>
          </div>

          {/* PTP Receptor */}
          <div className="space-y-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
            <h3 className="text-xs font-bold uppercase text-blue-600 tracking-wider mb-2">PTP Receptor (Destino)</h3>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">IP *</label>
              <input name="ptp_receptor_ip" value={formData.ptp_receptor_ip} onChange={handleChange} className="w-full px-2 py-1 text-sm border rounded" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Nombre Dispositivo</label>
                <input name="ptp_receptor_nombre" value={formData.ptp_receptor_nombre} onChange={handleChange} className="w-full px-2 py-1 text-sm border rounded" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Modelo</label>
                <input name="ptp_receptor_modelo" value={formData.ptp_receptor_modelo} onChange={handleChange} className="w-full px-2 py-1 text-sm border rounded" />
              </div>
            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div className="flex justify-end mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm shadow-indigo-200"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  );
}
