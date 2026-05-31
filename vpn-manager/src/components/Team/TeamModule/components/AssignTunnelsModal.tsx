import { useState, useEffect } from 'react';
import { Waypoints, X, Loader2, Plus, Trash2 } from 'lucide-react';
import { teamApi } from '../../../../services/teamApi';
import type { Member, Assignment } from '../../../../types/account';

interface Props {
  member: Member;
  onClose: () => void;
}

export default function AssignTunnelsModal({ member, onClose }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tunnelId, setTunnelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await teamApi.listAssignments();
      setAssignments(r.assignments.filter(a => a.user_id === member.user_id));
    } catch { /* */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [member.user_id]);

  const add = async () => {
    const t = tunnelId.trim();
    if (!t) return;
    setBusy(true); setError(null);
    try { await teamApi.assignTunnel(member.user_id, t); setTunnelId(''); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo asignar'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try { await teamApi.removeAssignment(id); await load(); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-indigo-600 rounded-t-2xl px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0"><Waypoints className="w-4 h-4 text-white" /></div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">Túneles asignados</p>
              <p className="text-2xs text-indigo-200 truncate">{member.name || member.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Agregar */}
          <div className="flex items-center gap-2">
            <input value={tunnelId} onChange={e => setTunnelId(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
              placeholder="VRF o usuario PPP del túnel"
              className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 text-slate-700 placeholder:text-slate-400 font-mono dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500" />
            <button onClick={add} disabled={busy || !tunnelId.trim()} className="btn-primary px-4 py-2.5 flex items-center gap-1.5 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Asignar
            </button>
          </div>
          {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}

          {/* Lista */}
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
          ) : assignments.length === 0 ? (
            <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-6">Sin túneles asignados. Agrega uno arriba.</p>
          ) : (
            <ul className="space-y-2">
              {assignments.map(a => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <Waypoints className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-200 flex-1 truncate">{a.tunnel_id}</span>
                  <button onClick={() => remove(a.id)} title="Quitar" aria-label="Quitar túnel"
                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
