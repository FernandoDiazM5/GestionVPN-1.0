import { useState, useRef } from 'react';
import { Download, Upload, Loader2, AlertCircle, Check, FileJson, ShieldCheck, ChevronRight } from 'lucide-react';
import { workspaceApi, type ImportPlan } from '../../../../services/workspaceApi';
import { useWorkspaceSession } from '../../../../context/WorkspaceSession';

type Conflict = 'skip' | 'overwrite';

export default function ImportExportTab() {
  const { session } = useWorkspaceSession();
  const isOwner = session?.role === 'OWNER';

  return (
    <div className="space-y-5">
      {!isOwner && (
        <div className="card border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Solo el propietario del workspace puede exportar e importar datos.
          </p>
        </div>
      )}
      <ExportCard disabled={!isOwner} />
      <ImportCard disabled={!isOwner} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Exportar — descarga JSON del workspace
// ─────────────────────────────────────────────────────────────
function ExportCard({ disabled }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const download = async () => {
    setBusy(true); setErr(null);
    try {
      const { blob, filename } = await workspaceApi.export();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo exportar'); }
    finally { setBusy(false); }
  };

  return (
    <div className="card border border-slate-200 dark:border-slate-800 p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Exportar respaldo</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Descarga un archivo JSON con: nodos, peers WireGuard, miembros, grupos de AP y configuración.
            Las credenciales (SSH, WG, PPP) van cifradas con la clave del servidor.
          </p>
        </div>
      </div>

      {err && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
          <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-700 dark:text-rose-300">{err}</p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <ShieldCheck className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
        <p className="text-2xs text-slate-500 dark:text-slate-400 flex-1">
          Guarda este archivo en un lugar seguro — contiene datos sensibles cifrados.
        </p>
        <button onClick={download} disabled={busy || disabled}
          className="btn-primary px-4 py-2 flex items-center gap-2 text-xs disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Descargar JSON
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Importar — dry-run → preview → apply
// ─────────────────────────────────────────────────────────────
function ImportCard({ disabled }: { disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [filename, setFilename] = useState<string>('');
  const [conflict, setConflict] = useState<Conflict>('skip');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'planning' | 'ready' | 'applying' | 'done'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ inserts: Record<string, number>; updates: Record<string, number> } | null>(null);

  const onSelectFile = async (file: File) => {
    setErr(null); setPlan(null); setApplyResult(null); setPhase('parsing');
    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      setPayload(json); setFilename(file.name);
      // Auto dry-run
      setPhase('planning');
      const r = await workspaceApi.importDryRun(json, conflict);
      setPlan(r.plan); setPhase('ready');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'JSON inválido');
      setPhase('idle'); setPayload(null);
    }
  };

  const refreshPlan = async () => {
    if (!payload) return;
    setPhase('planning'); setErr(null);
    try {
      const r = await workspaceApi.importDryRun(payload, conflict);
      setPlan(r.plan); setPhase('ready');
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo recalcular'); setPhase('ready'); }
  };

  const apply = async () => {
    if (!payload) return;
    setPhase('applying'); setErr(null);
    try {
      const r = await workspaceApi.importApply(payload, conflict);
      setApplyResult({ inserts: r.inserts, updates: r.updates });
      setPhase('done');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo aplicar');
      setPhase('ready');
    }
  };

  const reset = () => {
    setPayload(null); setFilename(''); setPlan(null); setApplyResult(null); setPhase('idle'); setErr(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="card border border-slate-200 dark:border-slate-800 p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center shrink-0">
          <Upload className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Importar respaldo</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Carga un archivo JSON exportado previamente. Verás un resumen antes de aplicar los cambios.
          </p>
        </div>
      </div>

      {err && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
          <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-700 dark:text-rose-300">{err}</p>
        </div>
      )}

      {/* Fase: idle → archivo */}
      {phase === 'idle' && (
        <div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={e => e.target.files?.[0] && onSelectFile(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={disabled}
            className="w-full border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-8
                       hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/5 transition-colors
                       text-center group disabled:opacity-50 disabled:cursor-not-allowed">
            <FileJson className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2 group-hover:text-indigo-400" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Elegir archivo .json</p>
            <p className="text-2xs text-slate-400 dark:text-slate-500 mt-1">o arrastra y suelta aquí</p>
          </button>
        </div>
      )}

      {(phase === 'parsing' || phase === 'planning') && (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          {phase === 'parsing' ? 'Leyendo archivo…' : 'Calculando plan de cambios…'}
        </div>
      )}

      {/* Fase: ready / applying → mostrar plan + acciones */}
      {(phase === 'ready' || phase === 'applying') && plan && (
        <>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <FileJson className="w-4 h-4 text-slate-400" />
            <p className="text-xs text-slate-600 dark:text-slate-300 font-mono truncate flex-1">{filename}</p>
            <button onClick={reset} className="text-2xs font-semibold text-slate-500 hover:text-rose-600">
              Cancelar
            </button>
          </div>

          <div>
            <label className="block text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Política de conflictos
            </label>
            <div className="flex gap-2">
              <ConflictPill active={conflict === 'skip'} onClick={() => setConflict('skip')}
                label="Omitir existentes" sub="No tocar lo que ya existe (recomendado)" />
              <ConflictPill active={conflict === 'overwrite'} onClick={() => setConflict('overwrite')}
                label="Sobreescribir" sub="Reemplazar los datos existentes con los del archivo" />
            </div>
            <button onClick={refreshPlan} disabled={phase === 'applying'}
              className="text-2xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-2">
              Recalcular plan
            </button>
          </div>

          <PlanSummary plan={plan} />

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button onClick={reset} disabled={phase === 'applying'}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">
              Descartar
            </button>
            <button onClick={apply} disabled={phase === 'applying'}
              className="btn-primary px-5 py-2 flex items-center gap-2 text-xs disabled:opacity-50">
              {phase === 'applying' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Aplicar importación
            </button>
          </div>
        </>
      )}

      {/* Fase: done */}
      {phase === 'done' && applyResult && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Importación completada</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Insertados</p>
              {Object.entries(applyResult.inserts).map(([k, v]) => (
                <p key={k} className="font-mono text-slate-700 dark:text-slate-200 mt-1">+{v} <span className="text-slate-500 dark:text-slate-400 font-sans">{k}</span></p>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Actualizados</p>
              {Object.entries(applyResult.updates).map(([k, v]) => (
                <p key={k} className="font-mono text-slate-700 dark:text-slate-200 mt-1">↻{v} <span className="text-slate-500 dark:text-slate-400 font-sans">{k}</span></p>
              ))}
            </div>
          </div>
          <button onClick={reset} className="btn-outline w-full px-4 py-2 text-xs">
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

function ConflictPill({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button onClick={onClick}
      className={`flex-1 text-left px-3 py-2 rounded-xl border transition-all
        ${active
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 ring-2 ring-indigo-200 dark:ring-indigo-500/30'
          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
      <p className={`text-xs font-bold ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>{label}</p>
      <p className="text-2xs text-slate-500 dark:text-slate-400">{sub}</p>
    </button>
  );
}

function PlanSummary({ plan }: { plan: ImportPlan }) {
  const Section = ({ title, group }: { title: string; group: { create: string[]; update: string[]; skip: string[] } }) => {
    const total = group.create.length + group.update.length + group.skip.length;
    if (total === 0) return null;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{title} <span className="text-2xs font-normal text-slate-400">({total})</span></p>
        </div>
        <div className="px-3 py-2 space-y-1">
          {group.create.length > 0 && <Row color="emerald" label="A crear" items={group.create} />}
          {group.update.length > 0 && <Row color="sky"     label="A actualizar" items={group.update} />}
          {group.skip.length > 0   && <Row color="slate"   label="Omitidos" items={group.skip} />}
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-2">
      <Section title="Túneles"    group={plan.tunnels} />
      <Section title="Grupos de AP" group={plan.ap_groups} />
      <Section title="Miembros"   group={plan.members} />
    </div>
  );
}

function Row({ color, label, items }: { color: 'emerald' | 'sky' | 'slate'; label: string; items: string[] }) {
  const dot = {
    emerald: 'bg-emerald-500',
    sky: 'bg-sky-500',
    slate: 'bg-slate-400',
  }[color];
  return (
    <div className="flex items-start gap-2">
      <div className={`w-2 h-2 rounded-full ${dot} mt-1.5 shrink-0`} />
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className="font-mono text-2xs text-slate-600 dark:text-slate-300 break-all">{items.join(', ')}</p>
      </div>
    </div>
  );
}
