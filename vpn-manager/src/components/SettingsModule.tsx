import { useState, useEffect } from 'react';
import { Settings, Save, Server, Shield, Loader2, Key, Users } from 'lucide-react';
import { apiFetch } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import UserManagementModule from './UserManagementModule';

interface AppSettings {
  MT_IP?: string;
  MT_USER?: string;
  MT_PASS?: string;
}

export default function SettingsModule() {
  const [activeTab, setActiveTab] = useState<'core' | 'users'>('core');
  const [settings, setSettings] = useState<AppSettings>({ MT_IP: '', MT_USER: '', MT_PASS: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/settings/get`);
      const data = await response.json();
      if (data.success && data.settings) {
        setSettings({
            MT_IP: data.settings.MT_IP || '',
            MT_USER: data.settings.MT_USER || '',
            MT_PASS: data.settings.MT_PASS || ''
        });
      } else setErrorMsg('Error al cargar la configuración.');
    } catch (error) {
       setErrorMsg('Error de red al cargar configuración.');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSetting = async (key: string, value: string) => {
      const resp = await apiFetch(`${API_BASE_URL}/api/settings/save`, {
          method: 'POST', body: JSON.stringify({ key, value })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.message || 'Fallo guardando valor');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
        await saveSetting('MT_IP', settings.MT_IP || '');
        await saveSetting('MT_USER', settings.MT_USER || '');
        await saveSetting('MT_PASS', settings.MT_PASS || '');
        setSuccessMsg('Configuración guardada exitosamente. El Core ahora está provisionado en el servidor.');
    } catch (e: any) {
        setErrorMsg(e.message || 'Error desconocido');
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Tabs Menu */}
      <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200">
        <button onClick={() => setActiveTab('core')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'core' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Server className="w-4 h-4" /> Configuración Global Core
        </button>
        <button onClick={() => setActiveTab('users')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Users className="w-4 h-4" /> Personal y Roles
        </button>
      </div>

      {activeTab === 'users' && <UserManagementModule />}

      {activeTab === 'core' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div className="bg-indigo-50 p-2 rounded-lg">
              <Settings className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Inyección de Core (RouterOS)</h2>
              <p className="text-sm text-slate-500 font-medium">Configura de forma oculta los accesos supremos para que el Backend opere.</p>
            </div>
          </div>

          <div className="p-6">
            {isLoading ? (
               <div className="flex justify-center items-center h-48"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /></div>
            ) : (
                <>
                    {successMsg && (
                    <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 font-medium text-sm flex gap-2 items-center">
                        <Shield className="w-4 h-4 shrink-0" /> {successMsg}
                    </div>
                    )}
                    {errorMsg && (
                    <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 font-medium text-sm">
                        {errorMsg}
                    </div>
                    )}

                    <form onSubmit={handleSave} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">IP / Host del Router MikroTik</label>
                            <div className="relative">
                            <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="text" required value={settings.MT_IP} onChange={(e) => setSettings({...settings, MT_IP: e.target.value})} className="input-field pl-10 h-11" placeholder="192.168.88.1" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Usuario Full-Access RouterOS</label>
                            <div className="relative">
                            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="text" required value={settings.MT_USER} onChange={(e) => setSettings({...settings, MT_USER: e.target.value})} className="input-field pl-10 h-11" placeholder="admin" />
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contraseña del RouterOS</label>
                            <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="password" required value={settings.MT_PASS} onChange={(e) => setSettings({...settings, MT_PASS: e.target.value})} className="input-field pl-10 h-11" placeholder="••••••••" />
                            </div>
                            <p className="text-xs text-slate-400 mt-2 font-medium">Esta contraseña se cifrará con AES-256-GCM en la DB del servidor.</p>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-slate-100">
                        <button type="submit" disabled={isSaving} className="btn-primary px-6 py-2.5">
                            {isSaving ? <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Guardando...</> : <><Save className="w-4 h-4 shrink-0" /> Guardar Cambios</>}
                        </button>
                    </div>
                    </form>
                </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
