import { useState, useEffect, useMemo } from 'react';
import { Waypoints, X, Loader2, Plus, Trash2 } from 'lucide-react';
import { teamApi } from '../../../../services/teamApi';
import type { Member, Assignment } from '../../../../types/account';

interface Props {
  member: Member;
  onClose: () => void;
}

interface WorkspaceTunnel {
  ppp_user: string;
  nombre_vrf: string | null;
  nombre_nodo: string | null;
}

export default function AssignTunnelsModal({ member, onClose }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [workspaceTunnels, setWorkspaceTunnels] = useState<WorkspaceTunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [tunnelId, setTunnelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, t] = await Promise.all([
        teamApi.listAssignments(),
        teamApi.listWorkspaceTunnels().catch(() => ({ tunnels: [] as WorkspaceTunnel[] })),
      ]);
      setAssignments(a.assignments.filter(x => x.user_id === member.user_id));
      setWorkspaceTunnels(t.tunnels);
    } catch { /* */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [member.user_id]);

  // Túneles disponibles para asignar = workspace - ya asignados al miembro
  const assignedIds = useMemo(() => new Set(assignments.map(a => a.tunnel_id)), [assignments]);
  const availableTunnels = useMemo(
    () => workspaceTunnels.filter(t => {
      const key = t.nombre_vrf || t.ppp_user;
      return !assignedIds.has(key) && !assignedIds.has(t.ppp_user);
    }),
    [workspaceTunnels, assignedIds]
  );

  const add = async () => {
    const t = tunnelId.trim();
    if (!t) return;
    setBusy(true); setError(null);
    try {
      await teamApi.assignTunnel(member.user_id, t);
      setTunnelId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo asignar');
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try { await teamApi.removeAssignment(id); await load(); }
    finally { setBusy(false); }
  };

  // Resolve display label for an assignment (intenta mostrar el nombre del nodo si se conoce)
  const labelFor = (assignment: Assignment): string => {
    const match = workspaceTunnels.find(t =>
      t.nombre_vrf === assignment.tunnel_id || t.ppp_user === assignment.tunnel_id
    );
    if (match?.nombre_nodo) return `${assignment.tunnel_id} — ${match.nombre_nodo}`;
    return assignment.tunnel_id;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-indigo-600 rounded-t-2xl px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <Waypoints className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">Túneles asignados</p>
              <p className="text-2xs text-indigo-200 truncate">{member.name || member.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg"
            aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Selector + botón asignar */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Túnel a asignar
            </label>
            <div className="flex items-center gap-2">
              <select
                value={tunnelId}
                onChange={e => setTunnelId(e.target.value)}
                disabled={loading || busy}
                className="input-field flex-1 font-mono"
              >
                <option value="">
                  {availableTunnels.length === 0
                    ? loading
                      ? 'Cargando…'
                      : 'No hay túneles disponibles'
                    : 'Elige un túnel…'}
                </option>
                {availableTunnels.map(t => (
                  <option key={t.ppp_user} value={t.nombre_vrf || t.ppp_user}>
                    {(t.nombre_vrf || t.ppp_user)}
                    {t.nombre_nodo ? `  —  ${t.nombre_nodo}` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={add}
                disabled={busy || !tunnelId.trim()}
                className="btn-primary px-4 py-2.5 flex items-center gap-1.5 text-sm disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Asignar
              </button>
            </div>
            {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mt-1.5">{error}</p>}
          </div>

          {/* Lista de asignaciones actuales */}
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Asignados ({assignments.length})
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              </div>
            ) : assignments.length === 0 ? (
              <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-6">
                Sin túneles asignados todavía. Elige uno arriba y dale "Asignar".
              </p>
            ) : (
              <ul className="space-y-2">
                {assignments.map(a => (
                  <li key={a.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                    <Waypoints className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-200 flex-1 truncate">
                      {labelFor(a)}
                    </span>
                    <button
                      onClick={() => remove(a.id)}
                      disabled={busy}
                      title="Quitar" aria-label="Quitar túnel"
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
