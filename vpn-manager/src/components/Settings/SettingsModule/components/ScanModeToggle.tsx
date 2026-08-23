import { CheckCircle2, Radar, Server } from 'lucide-react';

/**
 * El producto opera exclusivamente desde el VPS. Esta vista sólo comunica la
 * topología activa; no expone un selector que pueda desviar el escaneo a una PC.
 */
export function ScanModeToggle() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-4 dark:border-slate-800 dark:bg-slate-800/40 sm:px-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10">
          <Radar className="h-5 w-5 text-indigo-500" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Escaneo de red desde el VPS</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Configuración fija para Buscar equipos y Monitor AP</p>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 sm:flex-row sm:items-start">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 dark:bg-slate-900/50">
            <Server className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold">Modo VPS activo</h4>
              <CheckCircle2 className="h-4 w-4" aria-label="Activo" />
            </div>
            <p className="mt-1 text-sm leading-relaxed">
              El backend origina el escaneo desde el pool privado asignado a cada workspace.
              Esto mantiene separados a los clientes y permite operar la plataforma únicamente
              desde el servidor central.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><span className="block text-xs text-slate-500">Origen</span><b className="mt-1 block text-sm">VPS central</b></div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><span className="block text-xs text-slate-500">Asignación</span><b className="mt-1 block text-sm">Una IP por workspace</b></div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><span className="block text-xs text-slate-500">Ruta de retorno</span><b className="mt-1 block text-sm">Validada en el Router Core</b></div>
        </div>

        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          La red utilizada corresponde al segmento de escaneo del bloque privado /22 configurado
          en el Router Core. No requiere instalar ni configurar un origen local.
        </p>
      </div>
    </div>
  );
}
