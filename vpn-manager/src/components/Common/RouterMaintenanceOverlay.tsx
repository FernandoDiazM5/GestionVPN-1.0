// ============================================================
//  RouterMaintenanceOverlay — pantalla completa "router de gestión
//  no disponible". Se muestra cuando cualquier llamada al backend
//  responde 503 MIKROTIK_UNREACHABLE (router configurado pero sin
//  respuesta: timeout/refused). apiClient dispara 'router_unreachable'.
//
//  No reemplaza al banner de "no configurado" (NEEDS_CONFIG): ese es
//  para el Administrador; este es para cuando el túnel de gestión del
//  operador está caído ("activa tu WireGuard").
// ============================================================
import { useEffect, useState } from 'react';
import { ServerCrash, RefreshCw, Wifi, X } from 'lucide-react';

export default function RouterMaintenanceOverlay() {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const onDown = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (typeof msg === 'string') setDetail(msg);
      setVisible(true);
    };
    window.addEventListener('router_unreachable', onDown);
    return () => window.removeEventListener('router_unreachable', onDown);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-slate-900/85 backdrop-blur-sm">
      <div className="card max-w-lg w-full p-8 text-center relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={() => setVisible(false)}
          title="Ocultar"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors dark:hover:text-slate-200 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-5">
          <ServerCrash className="w-8 h-8 text-amber-500" />
        </div>

        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Router de gestión no disponible</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          No se pudo conectar con el router central. Normalmente esto significa que tu
          conexión <span className="font-semibold text-slate-700 dark:text-slate-200">WireGuard de gestión</span> está inactiva.
        </p>

        {detail && (
          <p className="data-muted text-2xs mt-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 break-words">
            {detail}
          </p>
        )}

        <ol className="text-left text-sm text-slate-600 dark:text-slate-300 mt-5 space-y-2">
          <li className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 text-2xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
            <span className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Activa el túnel <span className="font-semibold">WireGuard de gestión</span> en tu equipo.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 text-2xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
            <span>Verifica que el router responda (p. ej. <span className="font-mono text-xs">192.168.21.1</span>).</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 text-2xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
            <span>Cuando esté arriba, vuelve a intentar.</span>
          </li>
        </ol>

        <button
          onClick={() => window.location.reload()}
          className="btn-primary btn-md w-full mt-6 flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    </div>
  );
}
