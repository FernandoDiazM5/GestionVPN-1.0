import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Link, Loader2, Network, RotateCcw } from 'lucide-react';
import { coreServerApi, type CoreVpsPeerPreview, type VpsWireguardDraft, type VpsWireguardPreview } from '../../../../services/coreServerApi';

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
  const [message, setMessage] = useState('');
  const [applyConfirmation, setApplyConfirmation] = useState('');
  const [rollbackConfirmation, setRollbackConfirmation] = useState('');
  const [rotateConfirmation, setRotateConfirmation] = useState('');
  const [coreConfirmation, setCoreConfirmation] = useState('');
  const [corePreview, setCorePreview] = useState<CoreVpsPeerPreview | null>(null);
  const patch = <K extends keyof VpsWireguardDraft>(key: K, value: VpsWireguardDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const normalizedDraft = () => ({ ...draft, allowedIps: allowedIpsText.split(',').map(value => value.trim()).filter(Boolean) });
  const runPreview = async () => {
    setLoading(true); setError(''); setMessage(''); setPreview(null);
    try {
      const response = await coreServerApi.wireguardPreview(normalizedDraft());
      setPreview(response.preview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo validar la configuración.');
    } finally { setLoading(false); }
  };
  const apply = async () => {
    setLoading(true); setError(''); setMessage('');
    try { const response = await coreServerApi.wireguardApply(normalizedDraft(), applyConfirmation); setMessage(`Solicitud ${response.request.requestId} enviada al agente.`); setApplyConfirmation(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo solicitar la aplicación.'); }
    finally { setLoading(false); }
  };
  const rollback = async () => {
    setLoading(true); setError(''); setMessage('');
    try { const response = await coreServerApi.wireguardRollback(rollbackConfirmation); setMessage(`Rollback ${response.request.requestId} enviado al agente.`); setRollbackConfirmation(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo solicitar el rollback.'); }
    finally { setLoading(false); }
  };
  const rotate = async () => {
    setLoading(true); setError(''); setMessage('');
    try { const response = await coreServerApi.wireguardRotate(rotateConfirmation); setMessage(`Rotación ${response.request.requestId} enviada. Luego revisa y sincroniza el peer del Core.`); setRotateConfirmation(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo solicitar la rotación.'); }
    finally { setLoading(false); }
  };
  const inspectCorePeer = async () => {
    setLoading(true); setError(''); setMessage('');
    try { const response = await coreServerApi.wireguardCorePreview(); setCorePreview(response.preview); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo inspeccionar el peer del Core.'); }
    finally { setLoading(false); }
  };
  const syncCorePeer = async () => {
    setLoading(true); setError(''); setMessage('');
    try { await coreServerApi.wireguardCoreSync(coreConfirmation); setMessage('Peer VPS sincronizado en el Core.'); setCoreConfirmation(''); await inspectCorePeer(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo sincronizar el peer del Core.'); }
    finally { setLoading(false); }
  };

  return <section className="card space-y-5 p-4 sm:p-6"><div className="flex gap-3"><Eye className="h-5 w-5 shrink-0 text-violet-600" /><div><h3 className="font-bold">Configurar WireGuard del VPS</h3><p className="text-sm text-slate-500">Valida, respalda y aplica mediante el agente local con rollback.</p></div></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Interfaz</span><input className="input-field h-11 font-mono" value={draft.interface} onChange={event => patch('interface', event.target.value)} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Dirección del VPS</span><input className="input-field h-11 font-mono" value={draft.address} onChange={event => patch('address', event.target.value)} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">MTU</span><input type="number" min={1280} max={1500} className="input-field h-11" value={draft.mtu} onChange={event => patch('mtu', Number(event.target.value))} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Endpoint público del Core</span><input className="input-field h-11 font-mono" value={draft.coreEndpointHost} onChange={event => patch('coreEndpointHost', event.target.value)} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Puerto WireGuard del Core</span><input type="number" min={1} max={65535} className="input-field h-11" value={draft.coreEndpointPort} onChange={event => patch('coreEndpointPort', Number(event.target.value))} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Keepalive (segundos)</span><input type="number" min={0} max={3600} className="input-field h-11" value={draft.persistentKeepalive} onChange={event => patch('persistentKeepalive', Number(event.target.value))} /></label><label className="md:col-span-2 lg:col-span-3"><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Clave pública del Core</span><input className="input-field h-11 font-mono text-xs" autoComplete="off" value={draft.corePublicKey} onChange={event => patch('corePublicKey', event.target.value)} placeholder="Base64 de 44 caracteres" /></label><label className="md:col-span-2 lg:col-span-3"><span className="mb-2 block text-xs font-bold uppercase text-slate-500">AllowedIPs, separadas por coma</span><input className="input-field h-11 font-mono text-sm" value={allowedIpsText} onChange={event => setAllowedIpsText(event.target.value)} /><span className="mt-1 block text-xs text-slate-500">No se permite 0.0.0.0/0. Debe incluir la supernet de gestión.</span></label></div><div className="flex justify-end"><button type="button" className="btn-primary min-h-11 px-4" disabled={loading || !draft.corePublicKey} onClick={() => void runPreview()}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />} Validar sin aplicar</button></div>{error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}{message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}{preview && <div className={`rounded-xl border p-4 ${preview.valid ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}><div className="flex gap-2">{preview.valid ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}<div><h4 className="font-bold">{preview.valid ? 'Configuración válida' : 'Configuración bloqueada'}</h4><p className="text-sm text-slate-600">La aplicación exige confirmación literal y crea respaldo automático.</p></div></div>{preview.blockers.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-700">{preview.blockers.map(item => <li key={item}>{item}</li>)}</ul>}{preview.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700">{preview.warnings.map(item => <li key={item}>{item}</li>)}</ul>}<details className="mt-4 rounded-lg bg-white/70 p-3"><summary className="cursor-pointer text-sm font-semibold">Acciones previstas ({preview.actions.length})</summary><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{preview.actions.map(item => <li key={item}>{item}</li>)}</ol></details>{preview.valid && <div className="mt-4 space-y-2"><label><span className="mb-1 block text-xs font-semibold">Escribe APLICAR WIREGUARD VPS</span><input className="input-field h-11" value={applyConfirmation} onChange={event => setApplyConfirmation(event.target.value)} /></label><button type="button" className="btn-primary min-h-11 px-4" disabled={loading || applyConfirmation !== 'APLICAR WIREGUARD VPS'} onClick={() => void apply()}>Aplicar mediante agente</button></div>}</div>}<details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Rotación y recuperación</summary><div className="mt-3 grid gap-4 md:grid-cols-2"><div className="space-y-2"><p className="text-sm text-slate-500">Genera una clave nueva en el VPS. Después debes sincronizar el peer del Core.</p><input className="input-field h-11" value={rotateConfirmation} onChange={event => setRotateConfirmation(event.target.value)} placeholder="ROTAR CLAVE WIREGUARD VPS" /><button type="button" className="btn-ghost min-h-11 px-4" disabled={loading || rotateConfirmation !== 'ROTAR CLAVE WIREGUARD VPS'} onClick={() => void rotate()}><RotateCcw className="h-4 w-4" /> Rotar clave</button></div><div className="space-y-2"><p className="text-sm text-slate-500">Restaura el último respaldo funcional del VPS.</p><input className="input-field h-11" value={rollbackConfirmation} onChange={event => setRollbackConfirmation(event.target.value)} placeholder="REVERTIR WIREGUARD VPS" /><button type="button" className="btn-ghost min-h-11 px-4 text-rose-600" disabled={loading || rollbackConfirmation !== 'REVERTIR WIREGUARD VPS'} onClick={() => void rollback()}><RotateCcw className="h-4 w-4" /> Solicitar rollback</button></div></div></details><div className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><h4 className="font-bold">Peer VPS en el Core</h4><p className="text-sm text-slate-500">Inspecciona y sincroniza únicamente el peer administrado por Joinpoint.</p></div><button type="button" className="btn-ghost min-h-11 px-3" disabled={loading} onClick={() => void inspectCorePeer()}><Link className="h-4 w-4" /> Revisar Core</button></div>{corePreview && <div className="mt-3 space-y-2"><p className={`text-sm font-semibold ${corePreview.canSync ? 'text-emerald-700' : 'text-amber-700'}`}>{corePreview.canSync ? `Listo · ${corePreview.changes.length} cambio(s)` : corePreview.blockers.join(' ')}</p>{corePreview.canSync && <><input className="input-field h-11" value={coreConfirmation} onChange={event => setCoreConfirmation(event.target.value)} placeholder="SINCRONIZAR PEER VPS" /><button type="button" className="btn-primary min-h-11 px-4" disabled={loading || coreConfirmation !== 'SINCRONIZAR PEER VPS'} onClick={() => void syncCorePeer()}>Sincronizar peer VPS</button></>}</div>}</div></section>;
}
