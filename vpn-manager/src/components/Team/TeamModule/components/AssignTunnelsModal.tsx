import { useState, useEffect, useMemo } from 'react';
import { Waypoints, X, Loader2, Plus, Trash2, Search, AlertCircle } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<{ ok: number; failed: number } | null>(null);

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

  // ── Disponibles = workspace − ya asignados ──────────────────────
  const assignedIds = useMemo(() => new Set(assignments.map(a => a.tunnel_id)), [assignments]);
  const availableTunnels = useMemo(
    () => workspaceTunnels.filter(t => {
      const key = t.nombre_vrf || t.ppp_user;
      return !assignedIds.has(key) && !assignedIds.has(t.ppp_user);
    }),
    [workspaceTunnels, assignedIds]
  );

  // ── Filtrado por búsqueda ───────────────────────────────────────
  const visibleTunnels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableTunnels;
    return availableTunnels.filter(t =>
      (t.nombre_vrf || '').toLowerCase().includes(q) ||
      (t.nombre_nodo || '').toLowerCase().includes(q) ||
      (t.ppp_user || '').toLowerCase().includes(q)
    );
  }, [availableTunnels, search]);

  // ── Helpers de selección ────────────────────────────────────────
  const idOf = (t: WorkspaceTunnel) => t.nombre_vrf || t.ppp_user;

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const visibleIds = useMemo(() => visibleTunnels.map(idOf), [visibleTunnels]);
  const visibleAllSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));

  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (visibleAllSelected) {
        // Quitar solo los visibles (preserva selección oculta por filtro).
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // ── Asignación en lote ──────────────────────────────────────────
  const assignBatch = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true); setError(null); setPartial(null);
    const results = await Promise.allSettled(
      ids.map(id => teamApi.assignTunnel(member.user_id, id))
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    const ok = results.length - failed;
    setSelected(new Set());
    if (failed > 0) {
      setPartial({ ok, failed });
      // Mensaje del primer error para diagnóstico.
      const firstErr = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (firstErr) setError(firstErr.reason instanceof Error ? firstErr.reason.message : 'No se pudo asignar');
    }
    await load();
    setBusy(false);
  };

  const remove = async (id: string) => {
    setBusy(true);
    try { await teamApi.removeAssignment(id); await load(); }
    finally { setBusy(false); }
  };

  // ── Helpers visuales ───────────────────────────────────────────
  const labelFor = (assignment: Assignment): string => {
    const match = workspaceTunnels.find(t =>
      t.nombre_vrf === assignment.tunnel_id || t.ppp_user === assignment.tunnel_id
    );
    if (match?.nombre_nodo) return `${assignment.tunnel_id} — ${match.nombre_nodo}`;
    return assignment.tunnel_id;
  };

  const selectedCount = selected.size;

  return (
    <div className="modal-overlay"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal-panel modal-panel-lg">
        {/* Header */}
        <div className="modal-header-decorated modal-header-indigo">
          <div className="flex items-center gap-3 min-w-0">
            <div className="modal-header-icon">
              <Waypoints className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">Túneles asignados</p>
              <p className="text-2xs text-indigo-200 truncate">{member.name || member.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-header-close" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* ── Picker multi-selección ────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Túneles disponibles ({availableTunnels.length})
              </label>
              {availableTunnels.length > 0 && (
                <div className="flex items-center gap-2 text-2xs">
                  <button
                    onClick={toggleAllVisible}
                    disabled={busy || loading || visibleTunnels.length === 0}
                    className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {visibleAllSelected ? 'Ninguno' : search ? `Todos visibles (${visibleTunnels.length})` : 'Todos'}
                  </button>
                  {selectedCount > 0 && !visibleAllSelected && (
                    <>
                      <span className="text-slate-400 dark:text-slate-500">·</span>
                      <button
                        onClick={clearSelection}
                        disabled={busy}
                        className="font-semibold text-slate-500 dark:text-slate-400 hover:underline disabled:opacity-50"
                      >
                        Limpiar
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Búsqueda */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar VRF, nodo o usuario PPP…"
                disabled={loading || availableTunnels.length === 0}
                className="input-field pl-9 pr-8 py-2 text-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 dark:text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Lista checkboxes */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30 max-h-64 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                </div>
              ) : availableTunnels.length === 0 ? (
                <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-6 px-3">
                  No hay túneles disponibles para asignar.
                </p>
              ) : visibleTunnels.length === 0 ? (
                <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-6 px-3">
                  Ningún túnel coincide con "{search}".
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {visibleTunnels.map(t => {
                    const id = idOf(t);
                    const checked = selected.has(id);
                    return (
                      <li key={t.ppp_user}>
                        <label className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors
                          ${checked
                            ? 'bg-indigo-50 dark:bg-indigo-500/10'
                            : 'hover:bg-white dark:hover:bg-slate-800/50'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(id)}
                            disabled={busy}
                            className="accent-indigo-600 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-mono text-xs truncate ${checked
                              ? 'text-indigo-700 dark:text-indigo-300 font-semibold'
                              : 'text-slate-700 dark:text-slate-200'}`}>
                              {id}
                            </p>
                            {t.nombre_nodo && (
                              <p className="text-2xs text-slate-400 dark:text-slate-500 truncate">{t.nombre_nodo}</p>
                            )}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Botón asignar */}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={assignBatch}
                disabled={busy || selectedCount === 0}
                className="btn-primary px-4 py-2.5 flex items-center gap-1.5 text-sm disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {selectedCount === 0
                  ? 'Asignar'
                  : selectedCount === 1
                    ? 'Asignar 1 túnel'
                    : `Asignar ${selectedCount} túneles`}
              </button>
              {selectedCount > 0 && !busy && (
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Feedback */}
            {partial && (
              <div className={`mt-2 flex items-start gap-2 px-3 py-2 rounded-lg text-xs
                ${partial.failed === 0
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300'
                  : 'bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300'}`}>
                {partial.failed > 0 && <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <p>
                  {partial.ok > 0 && <span><strong>{partial.ok}</strong> asignado{partial.ok !== 1 ? 's' : ''}</span>}
                  {partial.ok > 0 && partial.failed > 0 && <span>{' · '}</span>}
                  {partial.failed > 0 && <span><strong>{partial.failed}</strong> fallaron</span>}
                </p>
              </div>
            )}
            {error && !partial && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mt-1.5 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
              </p>
            )}
          </div>

          {/* ── Lista de asignaciones actuales ─────────────────────── */}
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
                Sin túneles asignados todavía. Elige uno o varios arriba y dale "Asignar".
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