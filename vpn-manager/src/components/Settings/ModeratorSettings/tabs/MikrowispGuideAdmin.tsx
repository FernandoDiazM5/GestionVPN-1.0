import { useEffect, useState } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
import { apiForm, get, patch } from '../../../../services/sessionClient';
import type { IntegrationGuide } from '../../../../services/integrationsApi';

export default function MikrowispGuideAdmin() {
  const [guide, setGuide] = useState<IntegrationGuide | null>(null);
  const [title, setTitle] = useState('Guía de integración MikroWisp y Telegram');
  const [version, setVersion] = useState('1.0');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void get<{ guide: IntegrationGuide | null }>('/api/admin/integration-guides/MIKROWISP').then(result => setGuide(result.guide)).catch(() => null); }, []);
  const upload = async () => {
    if (!file) return; setBusy(true); setMessage(null);
    try {
      const form = new FormData(); form.set('title', title); form.set('version', version); form.set('file', file);
      const result = await apiForm<{ guide: IntegrationGuide }>('/api/admin/integration-guides/MIKROWISP', form);
      setGuide(result.guide); setFile(null); setMessage('Guía PDF validada y activada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar la guía.'); }
    finally { setBusy(false); }
  };
  const toggle = async () => {
    if (!guide) return; setBusy(true); setMessage(null);
    try { const result = await patch<{ guide: IntegrationGuide }>('/api/admin/integration-guides/MIKROWISP', { active: !guide.active }); setGuide(result.guide); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la guía.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-500/10"><FileText className="h-5 w-5" /></span><div><h3 className="font-bold">Guía PDF · MikroWisp y Telegram</h3><p className="mt-1 text-xs text-slate-500">El moderador verá únicamente la versión activa. Reemplazarla no desconecta grupos existentes.</p></div></div>
    {guide ? <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800"><p className="font-semibold">{guide.title} · {guide.version}</p><p className="mt-1 text-slate-500">{guide.fileName} · {Math.ceil(guide.fileSize / 1024)} KB · {guide.active ? 'Activa' : 'Desactivada'}</p><button type="button" disabled={busy} onClick={() => void toggle()} className="mt-2 rounded-lg border px-3 py-2 font-semibold">{guide.active ? 'Desactivar guía' : 'Activar guía'}</button></div> : null}
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Título<input value={title} onChange={event => setTitle(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-3 font-normal dark:border-slate-700 dark:bg-slate-950" /></label><label className="text-xs font-semibold">Versión<input value={version} onChange={event => setVersion(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-3 font-normal dark:border-slate-700 dark:bg-slate-950" /></label></div>
    <label className="mt-3 block text-xs font-semibold">Archivo PDF<input aria-label="Archivo PDF" type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs" /></label>
    <button type="button" disabled={busy || !file || !title || !version} onClick={() => void upload()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Validar y publicar PDF</button>
    {message ? <p role="status" className="mt-2 text-xs text-violet-700 dark:text-violet-300">{message}</p> : null}
  </section>;
}
