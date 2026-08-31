import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Loader2, Network } from 'lucide-react';
import { coreServerApi, type VpsWireguardDraft, type VpsWireguardPreview } from '../../../../services/coreServerApi';

const INITIAL_DRAFT: VpsWireguardDraft = {
  interface: 'wg0', address: '10.12.250.60/32', localListenPort: 0, mtu: 1420,
  corePublicKey: '', coreEndpointHost: '213.173.36.232', coreEndpointPort: 13232,
  allowedIps: ['10.12.248.0/22'], persistentKeepalive: 25,
};

export function VpsWireguardPreviewPanel() {
  const [draft, setDraft] = useState<VpsWireguardDraft>(INITIAL_DRAFT);
  const [allowedIpsText, setAllowedIpsText] = useState(INITIAL_DRAFT.allowedIps.join(', '));
  const [preview, setPreview] = useState<VpsWireguardPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const patch = <K extends keyof VpsWireguardDraft>(key: K, value: VpsWireguardDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const runPreview = async () => {
    setLoading(true); setError(''); setPreview(null);
    try {
      const allowedIps = allowedIpsText.split(',').map(value => value.trim()).filter(Boolean);
      const response = await coreServerApi.wireguardPreview({ ...draft, allowedIps });
      setPreview(response.preview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo validar la configuración.');
    } finally { setLoading(false); }
  };

  return <section className="card space-y-5 p-4 sm:p-6"><div className="flex gap-3"><Eye className="h-5 w-5 shrink-0 text-violet-600" /><div><h3 className="font-bold">Previsualizar configuración WireGuard</h3><p className="text-sm text-slate-500">Valida parámetros y conflictos. Esta fase no instala ni aplica cambios.</p></div></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Interfaz</span><input className="input-field h-11 font-mono" value={draft.interface} onChange={event => patch('interface', event.target.value)} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Dirección del VPS</span><input className="input-field h-11 font-mono" value={draft.address} onChange={event => patch('address', event.target.value)} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">MTU</span><input type="number" min={1280} max={1500} className="input-field h-11" value={draft.mtu} onChange={event => patch('mtu', Number(event.target.value))} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Endpoint público del Core</span><input className="input-field h-11 font-mono" value={draft.coreEndpointHost} onChange={event => patch('coreEndpointHost', event.target.value)} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Puerto WireGuard del Core</span><input type="number" min={1} max={65535} className="input-field h-11" value={draft.coreEndpointPort} onChange={event => patch('coreEndpointPort', Number(event.target.value))} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Keepalive (segundos)</span><input type="number" min={0} max={3600} className="input-field h-11" value={draft.persistentKeepalive} onChange={event => patch('persistentKeepalive', Number(event.target.value))} /></label><label className="md:col-span-2 lg:col-span-3"><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Clave pública del Core</span><input className="input-field h-11 font-mono text-xs" autoComplete="off" value={draft.corePublicKey} onChange={event => patch('corePublicKey', event.target.value)} placeholder="Base64 de 44 caracteres" /></label><label className="md:col-span-2 lg:col-span-3"><span className="mb-2 block text-xs font-bold uppercase text-slate-500">AllowedIPs, separadas por coma</span><input className="input-field h-11 font-mono text-sm" value={allowedIpsText} onChange={event => setAllowedIpsText(event.target.value)} /><span className="mt-1 block text-xs text-slate-500">No se permite 0.0.0.0/0. Debe incluir la supernet de gestión.</span></label></div><div className="flex justify-end"><button type="button" className="btn-primary min-h-11 px-4" disabled={loading || !draft.corePublicKey} onClick={() => void runPreview()}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />} Validar sin aplicar</button></div>{error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}{preview && <div className={`rounded-xl border p-4 ${preview.valid ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}><div className="flex gap-2">{preview.valid ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}<div><h4 className="font-bold">{preview.valid ? 'Configuración válida para una fase futura' : 'Configuración bloqueada'}</h4><p className="text-sm text-slate-600">Sólo previsualización: aplicar permanece deshabilitado.</p></div></div>{preview.blockers.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-700">{preview.blockers.map(item => <li key={item}>{item}</li>)}</ul>}{preview.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700">{preview.warnings.map(item => <li key={item}>{item}</li>)}</ul>}<details className="mt-4 rounded-lg bg-white/70 p-3"><summary className="cursor-pointer text-sm font-semibold">Acciones previstas ({preview.actions.length})</summary><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{preview.actions.map(item => <li key={item}>{item}</li>)}</ol></details></div>}</section>;
}
