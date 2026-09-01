import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clipboard, Eye, Link, Loader2, Network, RefreshCw, RotateCcw, ServerCog } from 'lucide-react';
import { coreServerApi, type CoreStatusResponse, type CoreVpsPeerPreview, type VpsWireguardDraft, type VpsWireguardPreview } from '../../../../services/coreServerApi';

const INITIAL_DRAFT: VpsWireguardDraft = {
  interface: 'wg0', address: '10.12.250.60/32', localListenPort: 0, mtu: 1420,
  corePublicKey: '', coreEndpointHost: '213.173.36.232', coreEndpointPort: 13232,
  allowedIps: ['10.12.248.0/22'], persistentKeepalive: 25,
};
const FLOW_STEPS = ['Conectar Core', 'Revisar Core', 'Aplicar VPS', 'Copiar clave VPS', 'Sincronizar peer', 'Verificar túnel'];
const TERMINAL_AGENT_STATES = new Set(['COMPLETED', 'SUCCESS', 'FAILED', 'ROLLED_BACK']);

interface Props {
  status: CoreStatusResponse | null;
  onRefreshStatus: () => Promise<CoreStatusResponse | null>;
  onConfigureCore: () => void;
}

function FlowProgress({ current }: { current: number }) {
  return <ol className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" aria-label="Progreso de configuración WireGuard">{FLOW_STEPS.map((label, index) => {
    const number = index + 1; const done = number < current; const active = number === current;
    return <li key={label} aria-current={active ? 'step' : undefined} className={`rounded-xl border p-3 ${active ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30' : done ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-700'}`}><span className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-violet-600 text-white' : done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{done ? <Check className="h-4 w-4" /> : number}</span><span className="block text-xs font-semibold">{label}</span></li>;
  })}</ol>;
}

export function VpsWireguardPreviewPanel({ status, onRefreshStatus, onConfigureCore }: Props) {
  const savedDraft = status?.wireguardDesired || INITIAL_DRAFT;
  const [draft, setDraft] = useState<VpsWireguardDraft>(savedDraft);
  const [allowedIpsText, setAllowedIpsText] = useState(savedDraft.allowedIps.join(', '));
  const [preview, setPreview] = useState<VpsWireguardPreview | null>(null);
  const [action, setAction] = useState<'preview' | 'apply' | 'rollback' | 'rotate' | 'core' | 'sync' | 'poll' | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [applyConfirmation, setApplyConfirmation] = useState(''); const [rollbackConfirmation, setRollbackConfirmation] = useState('');
  const [rotateConfirmation, setRotateConfirmation] = useState(''); const [coreConfirmation, setCoreConfirmation] = useState('');
  const [corePreview, setCorePreview] = useState<CoreVpsPeerPreview | null>(null); const [copied, setCopied] = useState(false); const [keyAcknowledged, setKeyAcknowledged] = useState(false);
  const hydratedDesired = useRef(false);
  const vps = status?.vpsWireguard; const agent = status?.wireguardAgent; const coreConfigured = Boolean(status?.health.configured);
  const publicKey = vps?.publicKey || agent?.publicKey || null;

  useEffect(() => {
    if (!hydratedDesired.current && status?.wireguardDesired) {
      hydratedDesired.current = true; setDraft(status.wireguardDesired); setAllowedIpsText(status.wireguardDesired.allowedIps.join(', '));
    }
  }, [status?.wireguardDesired]);

  const patch = <K extends keyof VpsWireguardDraft>(key: K, value: VpsWireguardDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const normalizedDraft = () => ({ ...draft, allowedIps: allowedIpsText.split(',').map(value => value.trim()).filter(Boolean) });
  const run = async (kind: NonNullable<typeof action>, task: () => Promise<void>) => {
    setAction(kind); setError(''); setMessage('');
    try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.'); }
    finally { setAction(null); }
  };
  const waitForAgent = async (requestId: string) => {
    setAction('poll');
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const next = await onRefreshStatus(); const result = next?.wireguardAgent;
      if (result?.requestId === requestId && TERMINAL_AGENT_STATES.has(result.status)) {
        if (result.status === 'FAILED') throw new Error(result.message || 'El agente no pudo completar la operación.');
        setMessage(result.publicKey ? 'WireGuard quedó aplicado. La clave pública del VPS ya está disponible.' : result.message || 'Operación completada.'); return;
      }
      await new Promise(resolve => window.setTimeout(resolve, 1500));
    }
    setMessage('La solicitud sigue en proceso. Usa “Actualizar estado” para continuar el seguimiento.');
  };
  const inspectCorePeer = async () => run('core', async () => {
    const response = await coreServerApi.wireguardCorePreview(); setCorePreview(response.preview);
    if (response.preview.corePublicKey || response.preview.listenPort) {
      setDraft(current => ({
        ...current,
        corePublicKey: response.preview.corePublicKey || current.corePublicKey,
        coreEndpointPort: response.preview.listenPort || current.coreEndpointPort,
      }));
      setPreview(null);
    }
  });
  const copyPublicKey = async () => {
    if (!publicKey) return;
    try { await navigator.clipboard.writeText(publicKey); setCopied(true); setKeyAcknowledged(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setError('No se pudo copiar automáticamente. Selecciona la clave y cópiala manualmente.'); }
  };

  const coreInspected = Boolean(corePreview?.interface); const vpsApplied = Boolean(vps?.interfacePresent && publicKey);
  const peerSynced = Boolean(corePreview?.peerPresent && corePreview.changes.length === 0);
  const verified = Boolean(peerSynced && corePreview?.peerHandshake && vps?.routes.length);
  const currentStep = !coreConfigured ? 1 : !coreInspected ? 2 : !vpsApplied ? 3 : !keyAcknowledged && !peerSynced ? 4 : !peerSynced ? 5 : 6;

  return <section className="card space-y-5 p-4 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><Eye className="h-5 w-5 shrink-0 text-violet-600" /><div><h3 className="font-bold">Asistente WireGuard: VPS ↔ Core</h3><p className="text-sm text-slate-500">Una sola secuencia para conectar, aplicar, sincronizar y comprobar el túnel.</p></div></div><button type="button" className="btn-ghost min-h-11 px-3" disabled={action !== null} onClick={() => void run('poll', async () => { await onRefreshStatus(); if (coreConfigured && publicKey) { const response = await coreServerApi.wireguardCorePreview(); setCorePreview(response.preview); } })}><RefreshCw className={`h-4 w-4 ${action === 'poll' ? 'animate-spin' : ''}`} /> Actualizar estado</button></div>
    <FlowProgress current={currentStep} />
    {!coreConfigured && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><div className="flex gap-3"><ServerCog className="h-5 w-5 shrink-0" /><div><h4 className="font-bold">Primero conecta el Core</h4><p className="mt-1 text-sm">Guarda la IP y las credenciales RouterOS. Luego vuelve aquí para inspeccionar la interfaz y obtener su clave y puerto reales.</p><button type="button" className="btn-primary mt-3 min-h-11 px-4" onClick={onConfigureCore}>Configurar credenciales del Core</button></div></div></div>}
    {coreConfigured && <div className="rounded-xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-bold">1. Inspeccionar el Core conectado</h4><p className="text-sm text-slate-500">Comprueba la interfaz administrada, su clave pública y el puerto antes de tocar el VPS.</p></div><button type="button" className="btn-ghost min-h-11 px-3" disabled={action !== null} onClick={() => void inspectCorePeer()}>{action === 'core' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />} Inspeccionar Core</button></div>{corePreview && <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">Interfaz</span><p className="font-mono text-sm font-semibold">{corePreview.interface || 'No detectada'}</p></div><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">Puerto real</span><p className="font-semibold">{corePreview.listenPort || '—'}</p></div><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">Clave pública del Core</span><p className="truncate font-mono text-xs font-semibold" title={corePreview.corePublicKey || ''}>{corePreview.corePublicKey || '—'}</p></div></div>}{corePreview?.blockers.filter(item => !item.includes('VPS todavía')).map(item => <p key={item} className="mt-2 text-sm text-amber-700">{item}</p>)}</div>}
    <div className="rounded-xl border p-4"><h4 className="font-bold">2. Configurar WireGuard del VPS</h4><p className="mb-4 text-sm text-slate-500">La clave privada nunca sale del VPS. Los valores guardados se recuperan automáticamente.</p><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Interfaz</span><input className="input-field h-11 font-mono" value={draft.interface} onChange={event => patch('interface', event.target.value)} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Dirección del VPS</span><input className="input-field h-11 font-mono" value={draft.address} onChange={event => patch('address', event.target.value)} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">MTU</span><input type="number" min={1280} max={1500} className="input-field h-11" value={draft.mtu} onChange={event => patch('mtu', Number(event.target.value))} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Endpoint público del Core</span><input className="input-field h-11 font-mono" value={draft.coreEndpointHost} onChange={event => patch('coreEndpointHost', event.target.value)} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Puerto WireGuard del Core</span><input type="number" min={1} max={65535} className="input-field h-11" value={draft.coreEndpointPort} onChange={event => patch('coreEndpointPort', Number(event.target.value))} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Keepalive (segundos)</span><input type="number" min={0} max={3600} className="input-field h-11" value={draft.persistentKeepalive} onChange={event => patch('persistentKeepalive', Number(event.target.value))} /></label><label className="md:col-span-2 lg:col-span-3"><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Clave pública del Core</span><input className="input-field h-11 font-mono text-xs" autoComplete="off" value={draft.corePublicKey} onChange={event => patch('corePublicKey', event.target.value)} placeholder="Inspecciona el Core y pega su clave pública" /></label><label className="md:col-span-2 lg:col-span-3"><span className="mb-2 block text-xs font-bold uppercase text-slate-500">AllowedIPs, separadas por coma</span><input className="input-field h-11 font-mono text-sm" value={allowedIpsText} onChange={event => setAllowedIpsText(event.target.value)} /><span className="mt-1 block text-xs text-slate-500">No se permite 0.0.0.0/0. Debe incluir la supernet de gestión.</span></label></div><div className="mt-4 flex justify-end"><button type="button" className="btn-primary min-h-11 px-4" disabled={action !== null || !draft.corePublicKey} onClick={() => void run('preview', async () => { const response = await coreServerApi.wireguardPreview(normalizedDraft()); setPreview(response.preview); })}>{action === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />} Validar sin aplicar</button></div>{preview && <div className={`mt-4 rounded-xl border p-4 ${preview.valid ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}><div className="flex gap-2">{preview.valid ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}<div><h5 className="font-bold">{preview.valid ? 'Configuración válida' : 'Configuración bloqueada'}</h5><p className="text-sm text-slate-600">La aplicación crea un respaldo y requiere confirmación literal.</p></div></div>{preview.blockers.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-rose-700">{preview.blockers.map(item => <li key={item}>{item}</li>)}</ul>}{preview.valid && <div className="mt-4 space-y-2"><label><span className="mb-1 block text-xs font-semibold">Escribe APLICAR WIREGUARD VPS</span><input className="input-field h-11" value={applyConfirmation} onChange={event => setApplyConfirmation(event.target.value)} /></label><button type="button" className="btn-primary min-h-11 px-4" disabled={action !== null || applyConfirmation !== 'APLICAR WIREGUARD VPS'} onClick={() => void run('apply', async () => { const response = await coreServerApi.wireguardApply(normalizedDraft(), applyConfirmation); setApplyConfirmation(''); await waitForAgent(response.request.requestId); })}>Aplicar y esperar resultado</button></div>}</div>}</div>
    {publicKey && <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"><h4 className="font-bold text-emerald-800">3. Clave pública del VPS lista</h4><p className="mt-1 text-sm text-slate-600">Esta clave es pública y se usará únicamente en el peer <code>GVPN:VPS</code> del Core.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label="Clave pública del VPS" className="input-field h-11 flex-1 font-mono text-xs" readOnly value={publicKey} onFocus={event => event.currentTarget.select()} /><button type="button" className="btn-ghost min-h-11 px-4" onClick={() => void copyPublicKey()}><Clipboard className="h-4 w-4" /> {copied ? 'Copiada' : 'Copiar clave'}</button></div></div>}
    <div className="rounded-xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-bold">4. Sincronizar y verificar el peer del Core</h4><p className="text-sm text-slate-500">Sólo crea o actualiza <code>GVPN:VPS</code>; los demás peers se conservan.</p></div><button type="button" className="btn-ghost min-h-11 px-3" disabled={action !== null || !coreConfigured || !publicKey} onClick={() => void inspectCorePeer()}><Link className="h-4 w-4" /> Revisar peer</button></div>{corePreview && <div className="mt-3 space-y-3"><p className={`text-sm font-semibold ${corePreview.canSync ? 'text-emerald-700' : 'text-amber-700'}`}>{corePreview.canSync ? `Listo · ${corePreview.changes.length} cambio(s) pendiente(s)` : corePreview.blockers.join(' ')}</p>{corePreview.canSync && corePreview.changes.length > 0 && <><input aria-label="Confirmación para sincronizar el peer" className="input-field h-11" value={coreConfirmation} onChange={event => setCoreConfirmation(event.target.value)} placeholder="SINCRONIZAR PEER VPS" /><button type="button" className="btn-primary min-h-11 px-4" disabled={action !== null || coreConfirmation !== 'SINCRONIZAR PEER VPS'} onClick={() => void run('sync', async () => { await coreServerApi.wireguardCoreSync(coreConfirmation); setCoreConfirmation(''); const response = await coreServerApi.wireguardCorePreview(); setCorePreview(response.preview); setMessage('Peer VPS sincronizado. Revisa la verificación final.'); await onRefreshStatus(); })}>Sincronizar peer VPS</button></>}{peerSynced && <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-emerald-50 p-3"><span className="text-xs text-slate-500">Peer administrado</span><p className="font-semibold text-emerald-700">Presente y actualizado</p></div><div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Handshake</span><p className="font-semibold">{corePreview.peerHandshake || 'Pendiente de tráfico'}</p></div><div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Rutas VPS</span><p className="font-semibold">{vps?.routes.length ? `${vps.routes.length} detectada(s)` : 'Sin confirmar'}</p></div></div>}{verified && <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> Peer, handshake y rutas verificados.</p>}</div>}</div>
    {(error || message) && <div role="status" className={`rounded-xl border p-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}
    {action === 'poll' && <p className="flex items-center gap-2 text-sm text-violet-700"><Loader2 className="h-4 w-4 animate-spin" /> Esperando que el agente aplique y verifique la configuración…</p>}
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Rotación y recuperación</summary><div className="mt-3 grid gap-4 md:grid-cols-2"><div className="space-y-2"><p className="text-sm text-slate-500">Genera una clave nueva. Después será obligatorio resincronizar el peer.</p><input className="input-field h-11" value={rotateConfirmation} onChange={event => setRotateConfirmation(event.target.value)} placeholder="ROTAR CLAVE WIREGUARD VPS" /><button type="button" className="btn-ghost min-h-11 px-4" disabled={action !== null || rotateConfirmation !== 'ROTAR CLAVE WIREGUARD VPS'} onClick={() => void run('rotate', async () => { const response = await coreServerApi.wireguardRotate(rotateConfirmation); setRotateConfirmation(''); await waitForAgent(response.request.requestId); setCorePreview(null); })}><RotateCcw className="h-4 w-4" /> Rotar clave</button></div><div className="space-y-2"><p className="text-sm text-slate-500">Restaura el último respaldo funcional del VPS.</p><input className="input-field h-11" value={rollbackConfirmation} onChange={event => setRollbackConfirmation(event.target.value)} placeholder="REVERTIR WIREGUARD VPS" /><button type="button" className="btn-ghost min-h-11 px-4 text-rose-600" disabled={action !== null || rollbackConfirmation !== 'REVERTIR WIREGUARD VPS'} onClick={() => void run('rollback', async () => { const response = await coreServerApi.wireguardRollback(rollbackConfirmation); setRollbackConfirmation(''); await waitForAgent(response.request.requestId); setCorePreview(null); })}><RotateCcw className="h-4 w-4" /> Solicitar rollback</button></div></div></details>
  </section>;
}
