import { useState } from 'react';
import { UserPlus, X, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useVpn } from '../../../../context';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import type { WgPeer } from '../../../../types/api';

interface NuevoAdminProps {
  peers: WgPeer[];
  onClose: () => void;
  onSuccess: (newPeer: WgPeer) => void;
}

export default function NuevoAdmin({ peers, onClose, onSuccess }: NuevoAdminProps) {
  const { credentials } = useVpn();
  const [name, setName] = useState('');
  const [pubKey, setPubKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ assignedIP: string; message: string } | null>(null);

  const usedIPs = peers
    .map(p => p.allowedAddress)
    .filter(a => a?.startsWith('192.168.21.'))
    .map(a => parseInt(a.split('.')[3]))
    .filter(n => !isNaN(n));
  const maxIP = usedIPs.length > 0 ? Math.max(...usedIPs) : 19;
  const nextIP = `192.168.21.${maxIP + 1}`;

  const handleCreate = async () => {
    if (!credentials || !pubKey.trim()) return;
    setSaving(true);
    setError('');
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/wireguard/peer/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: credentials.ip, user: credentials.user, pass: credentials.pass, name: name.trim() || 'Admin', publicKey: pubKey.trim() }),
      }, 15_000);
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Error al crear');
      setResult({ assignedIP: d.assignedIP, message: d.message });
      onSuccess({
        id: d.id ?? d.assignedIP,
        name: name.trim() || 'Admin',
        allowedAddress: d.assignedIP,
        publicKey: pubKey.trim(),
        lastHandshakeSecs: null,
        active: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-indigo-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-bold text-white">Nuevo Administrador</p>
          </div>
          {!saving && !result && (
            <button onClick={onClose} className="p-1.5 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-700">Administrador creado</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{result.message}</p>
                  <p className="text-xs font-mono font-bold text-indigo-600 mt-1">IP asignada: {result.assignedIP}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configura el cliente WireGuard con esta IP y conecta para activarlo.</p>
              <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-xl px-4 py-3 border border-indigo-100">
                <p className="text-xs text-indigo-600 font-medium">IP asignada automáticamente: <span className="font-mono font-bold">{nextIP}</span></p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nombre del administrador</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Laptop Victor, Celular Office"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Clave pública WireGuard <span className="text-rose-500">*</span></label>
                <textarea value={pubKey} onChange={e => setPubKey(e.target.value)} rows={3}
                  placeholder="Pega aquí la Public Key del cliente WireGuard"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono resize-none" />
                <p className="text-2xs text-slate-400 mt-0.5">Se obtiene en el cliente WireGuard → Interface → Public Key</p>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleCreate} disabled={!pubKey.trim() || saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>{saving ? 'Creando...' : 'Crear administrador'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
