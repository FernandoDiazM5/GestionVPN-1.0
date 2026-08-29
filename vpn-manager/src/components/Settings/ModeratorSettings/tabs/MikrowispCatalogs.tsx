import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { integrationsApi, type ExternalCatalogSummary, type MikrowispCatalogType } from '../../../../services/integrationsApi';

function formatDate(value: number | null) {
  return value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Nunca';
}

export default function MikrowispCatalogs() {
  const [catalogs, setCatalogs] = useState<ExternalCatalogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<MikrowispCatalogType | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    integrationsApi.listMikrowispCatalogs()
      .then(result => { if (active) setCatalogs(result.catalogs); })
      .catch(error => { if (active) setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudieron consultar los catálogos.' }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const sync = async (type: MikrowispCatalogType) => {
    setSyncing(type); setMessage(null);
    try {
      const result = await integrationsApi.syncMikrowispCatalog(type);
      const lastSyncedAt = result.catalog.entries.reduce((latest, entry) => Math.max(latest, entry.lastSyncedAt), 0) || Date.now();
      setCatalogs(current => current.map(item => item.type === type ? { ...item, count: result.catalog.entries.length, lastSyncedAt } : item));
      setMessage({ type: 'ok', text: `${result.catalog.label}: ${result.catalog.entries.length} registros sincronizados.` });
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo sincronizar el catálogo.' }); }
    finally { setSyncing(null); }
  };

  return <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-800/60 dark:bg-sky-500/10">
    <div><p className="text-sm font-bold text-sky-950 dark:text-sky-100">Catálogos externos</p><p className="mt-1 text-xs leading-5 text-sky-800 dark:text-sky-200">La actualización es manual. Si un ID todavía no tiene nombre, Joinpoint mostrará “Pendiente de sincronizar” sin bloquear el flujo.</p></div>
    {loading ? <p className="flex items-center text-xs text-sky-700 dark:text-sky-300"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Consultando catálogos…</p> : <div className="grid gap-2 lg:grid-cols-3">{catalogs.map(catalog => <div key={catalog.type} className="rounded-lg border border-sky-100 bg-white p-3 dark:border-sky-900 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{catalog.label}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{catalog.count} registros · Última actualización: {formatDate(catalog.lastSyncedAt)}</p>
      <button type="button" disabled={syncing !== null} onClick={() => void sync(catalog.type)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-500/10"><RefreshCw className={`h-3.5 w-3.5 ${syncing === catalog.type ? 'animate-spin' : ''}`} />Sincronizar ahora</button>
    </div>)}</div>}
    {message ? <p role="status" className={`text-xs ${message.type === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{message.text}</p> : null}
  </div>;
}
