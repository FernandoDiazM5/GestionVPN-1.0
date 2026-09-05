import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Database, FolderPlus, GitBranch, Plus, RefreshCw, Search, Trash2, Users, X } from 'lucide-react';
import Dialog from '../../../Common/Dialog';
import { accountApi } from '../../../../services/accountApi';
import { integrationsApi, type FiberRoute, type FiberRouteDetail, type TelegramBulkJob, type TelegramBulkPreview, type TelegramForumGroup, type TelegramForumParticipant, type TelegramForumTopic, type TelegramGroupProfile } from '../../../../services/integrationsApi';

const PROFILES: Record<TelegramGroupProfile, { label: string; description: string; permissions: string[] }> = {
  CLIENT_TRACKING: { label: 'Seguimiento de clientes', description: 'Temas por cliente y consultas de solo lectura a MikroWisp.', permissions: ['Administrar temas', 'Invitar usuarios', 'Restringir miembros'] },
  FIBER_ROUTES: { label: 'Rutas de fibra', description: 'ODF, mufas, fusiones, potencia y evidencias.', permissions: ['Administrar temas'] },
  GENERAL: { label: 'Operativo general', description: 'Grupo conectado sin automatizaciones adicionales.', permissions: ['Administrar temas'] },
};
const CLIENT_COMMANDS = ['/informacion', '/servicios', '/facturacion', '/ayuda', '/registrartema ID_CLIENTE'];
const FIBER_COMMANDS = ['/registrar_ruta', '/registrar_ruta NOMBRE | ZONA', '/resumenruta', '/agregartramo NOMBRE | HILO ENTRADA | HILO SALIDA | NOTA', '/agregarmufa NOMBRE | UBICACIÓN | HILO ENTRADA | HILO SALIDA', '/fusion HILO ENTRADA | HILO SALIDA | TIPO', '/potencia DBM | LONGITUD_NM | NOTA', '/evidencia DESCRIPCIÓN', '/cerrarruta MOTIVO', '/ayudaruta'];
const LABELS: Record<string, string> = { ACTIVE: 'Activo', CLOSED: 'Cerrado', DELETED: 'Eliminado', PENDING_LINK: 'Pendiente de vincular', MISSING_PERMISSIONS: 'Faltan permisos', BOT_REMOVED: 'Bot retirado', FORUM_DISABLED: 'Temas desactivados', DRAFT: 'Borrador', SURVEY: 'En levantamiento', CONSTRUCTION: 'En construcción', PENDING_MEASUREMENT: 'Pendiente de medición', OPERATIONAL: 'Operativa', INCIDENT: 'Con incidencia', MODIFIED: 'Modificada', RETIRED: 'Retirada', RUNNING: 'En ejecución', PENDING: 'Pendiente', PAUSED: 'Pausado', COMPLETED: 'Finalizado' };
const label = (value: string) => LABELS[value] || value.replaceAll('_', ' ').toLowerCase();
const badge = (status: string) => ['ACTIVE', 'OPERATIONAL', 'COMPLETED'].includes(status) ? 'bg-emerald-50 text-emerald-700' : ['MISSING_PERMISSIONS', 'PENDING_LINK', 'PAUSED', 'SURVEY'].includes(status) ? 'bg-amber-50 text-amber-700' : ['BOT_REMOVED', 'FORUM_DISABLED', 'INCIDENT'].includes(status) ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600';

export default function TelegramForums({ standalone = false }: { standalone?: boolean }) { return standalone ? <OperationalGroups /> : null; }

function OperationalGroups() {
  const [linkRequired, setLinkRequired] = useState(false);
  const [groups, setGroups] = useState<TelegramForumGroup[]>([]); const [selected, setSelected] = useState<string | null>(null);
  const [topics, setTopics] = useState<TelegramForumTopic[]>([]); const [participants, setParticipants] = useState<TelegramForumParticipant[]>([]);
  const [routes, setRoutes] = useState<FiberRoute[]>([]); const [routeDetail, setRouteDetail] = useState<FiberRouteDetail | null>(null);
  const [bulkJob, setBulkJob] = useState<TelegramBulkJob | null>(null); const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'content' | 'participants'>('content'); const [mobileDetail, setMobileDetail] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [commandsOpen, setCommandsOpen] = useState(false);
  const [groupDialog, setGroupDialog] = useState(false); const [groupStep, setGroupStep] = useState<1 | 2 | 3>(1); const [profile, setProfile] = useState<TelegramGroupProfile>('CLIENT_TRACKING'); const [link, setLink] = useState<{ command: string; expiresAt: number } | null>(null);
  const [topicDialog, setTopicDialog] = useState(false); const [clientId, setClientId] = useState(''); const [preview, setPreview] = useState<{ client: { id: string; name: string }; topicName: string } | null>(null);
  const [bulkDialog, setBulkDialog] = useState(false); const [bulkPreview, setBulkPreview] = useState<TelegramBulkPreview | null>(null);
  const [routeDialog, setRouteDialog] = useState(false); const [routeForm, setRouteForm] = useState({ code: '', name: '', zone: '', cableType: '', cableCapacity: '' });
  const [element, setElement] = useState({ type: 'ODF', name: '', location: '', tray: '', port: '', inputFiber: '', outputFiber: '', notes: '' });
  const [measurement, setMeasurement] = useState({ powerDbm: '', wavelengthNm: '1550', notes: '' });

  const loadGroups = useCallback(async () => { const result = await integrationsApi.listTelegramForums(); const normalized = result.groups.map(group => ({ ...group, profileType: group.profileType || 'CLIENT_TRACKING' as const, capabilities: group.capabilities || ['CLIENT_QUERIES', 'CLIENT_TOPICS', 'PARTICIPANT_MANAGEMENT'], missingPermissions: group.missingPermissions || [] })); setGroups(normalized); setSelected(current => normalized.some(group => group.id === current && group.chatId) ? current : normalized.find(group => group.status === 'ACTIVE')?.id || null); }, []);
  const current = groups.find(group => group.id === selected) || null;
  const loadContent = useCallback(async (group: TelegramForumGroup) => {
    setRouteDetail(null);
    if (group.profileType === 'FIBER_ROUTES') { const result = await integrationsApi.listFiberRoutes(group.id); setRoutes(result.routes); setTopics([]); setParticipants([]); setBulkJob(null); return; }
    const [topicResult, participantResult, jobResult] = await Promise.all([integrationsApi.listTelegramForumTopics(group.id), integrationsApi.listTelegramForumParticipants(group.id), group.profileType === 'CLIENT_TRACKING' ? integrationsApi.latestBulkTopics(group.id) : Promise.resolve({ job: null })]);
    setTopics(topicResult.topics); setParticipants(participantResult.participants); setBulkJob(jobResult.job);
  }, []);
  useEffect(() => { void loadGroups().catch(() => setMessage('No se pudieron cargar los grupos operativos.')); }, [loadGroups]);
  useEffect(() => { if (current) void loadContent(current).catch(() => setMessage('No se pudo cargar el contenido del grupo.')); }, [current, loadContent]);
  useEffect(() => { if (!current || !bulkJob || !['PENDING', 'RUNNING'].includes(bulkJob.status)) return; const timer = window.setInterval(() => void integrationsApi.getBulkTopics(current.id, bulkJob.id).then(result => { setBulkJob(result.job); if (result.job.status === 'COMPLETED') void loadContent(current); }).catch(() => null), 2500); return () => window.clearInterval(timer); }, [bulkJob, current, loadContent]);
  const filtered = useMemo(() => groups.filter(group => group.chatId).filter(group => `${group.name || ''} ${PROFILES[group.profileType]?.label || ''}`.toLowerCase().includes(search.toLowerCase())), [groups, search]);
  const run = async (task: () => Promise<void>) => { setBusy(true); setMessage(null); try { await task(); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar la operación.'); } finally { setBusy(false); } };
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setMessage('Comando copiado.'); } catch { setMessage('Copia el comando manualmente.'); } };
  const commands = current?.profileType === 'FIBER_ROUTES' ? FIBER_COMMANDS : current?.profileType === 'CLIENT_TRACKING' ? CLIENT_COMMANDS : [];
  const reconcile = () => current ? run(async () => { const result = await integrationsApi.reconcileTelegramForum(current.id); await loadGroups(); await loadContent({ ...current, ...result.group }); setMessage(result.deletedTopics ? `${result.deletedTopics} tema(s) eliminados fueron detectados.` : 'Grupo y permisos verificados con Telegram.'); }) : run(loadGroups);
  const checkTelegramLink = async () => {
    const status = await accountApi.getNotifications();
    if (!status.telegramLinked) { setGroupDialog(false); setLinkRequired(true); return false; }
    return true;
  };
  const openGroupDialog = () => run(async () => {
    if (!await checkTelegramLink()) return;
    setGroupDialog(true); setGroupStep(1); setLink(null);
  });
  const generateLink = () => run(async () => { if (!await checkTelegramLink()) return; const result = await integrationsApi.createTelegramForumLink(profile); setLink(result.link); setGroupStep(3); });
  const validateClient = () => current && run(async () => setPreview((await integrationsApi.previewTelegramForumTopic(current.id, clientId)).preview));
  const createTopic = () => current && preview && run(async () => { await integrationsApi.createTelegramForumTopic(current.id, preview.client.id); setTopicDialog(false); setPreview(null); setClientId(''); await loadContent(current); setMessage('Tema creado en Telegram.'); });
  const importClients = () => current && run(async () => { const result = await integrationsApi.importMikrowispClients(); setBulkPreview((await integrationsApi.previewBulkTopics(current.id)).preview); setBulkDialog(true); setMessage(`${result.snapshot.count} clientes guardados en Joinpoint. MikroWisp no fue modificado.`); });
  const deleteTopic = (topic: TelegramForumTopic) => current && run(async () => {
    if (!window.confirm(`¿Eliminar el tema «${topic.name}» y todos sus mensajes en Telegram? Esta acción no se puede deshacer.`)) return;
    await integrationsApi.deleteTelegramForumTopic(current.id, topic.id);
    await loadContent(current);
    setMessage('Telegram confirmó que el tema fue eliminado o ya no existe.');
  });
  const prepareBulk = () => current && run(async () => { setBulkPreview((await integrationsApi.previewBulkTopics(current.id)).preview); setBulkDialog(true); });
  const startBulk = () => current && run(async () => { setBulkJob((await integrationsApi.startBulkTopics(current.id)).job); setBulkDialog(false); setMessage('Creación iniciada. Puedes cerrar la pantalla y volver luego.'); });
  const toggleBulk = () => current && bulkJob && run(async () => setBulkJob((bulkJob.status === 'PAUSED' ? await integrationsApi.resumeBulkTopics(current.id, bulkJob.id) : await integrationsApi.pauseBulkTopics(current.id, bulkJob.id)).job));
  const createRoute = () => current && run(async () => { await integrationsApi.createFiberRoute(current.id, { code: routeForm.code, name: routeForm.name, zone: routeForm.zone, ...(routeForm.cableType ? { cableType: routeForm.cableType } : {}), ...(routeForm.cableCapacity ? { cableCapacity: Number(routeForm.cableCapacity) } : {}) }); setRouteDialog(false); setRouteForm({ code: '', name: '', zone: '', cableType: '', cableCapacity: '' }); await loadContent(current); setMessage('Ruta y tema creados en Telegram.'); });
  const openRoute = (route: FiberRoute) => current && run(async () => setRouteDetail(await integrationsApi.getFiberRoute(current.id, route.id)));
  const refreshRoute = async () => { if (current && routeDetail) setRouteDetail(await integrationsApi.getFiberRoute(current.id, routeDetail.route.id)); };
  const addElement = () => current && routeDetail && run(async () => { await integrationsApi.addFiberElement(current.id, routeDetail.route.id, element); setElement({ type: 'ODF', name: '', location: '', tray: '', port: '', inputFiber: '', outputFiber: '', notes: '' }); await refreshRoute(); });
  const addMeasurement = () => current && routeDetail && run(async () => { await integrationsApi.addFiberMeasurement(current.id, routeDetail.route.id, { powerDbm: Number(measurement.powerDbm), wavelengthNm: Number(measurement.wavelengthNm), notes: measurement.notes }); setMeasurement({ powerDbm: '', wavelengthNm: '1550', notes: '' }); await refreshRoute(); });
  const participantAction = (participant: TelegramForumParticipant, action: 'invite' | 'remove' | 'reinstate') => current && run(async () => { if (action === 'remove' && !window.confirm(`¿Retirar a ${participant.name || participant.email}?`)) return; const result = action === 'invite' ? await integrationsApi.inviteTelegramForumParticipant(current.id, participant.userId) : action === 'remove' ? await integrationsApi.removeTelegramForumParticipant(current.id, participant.userId) : await integrationsApi.reinstateTelegramForumParticipant(current.id, participant.userId); setParticipants(items => items.map(item => item.userId === participant.userId ? { ...item, ...result.participant } : item)); });

  return <div className="space-y-4">
    {linkRequired && <Dialog title="Vincula tu cuenta de Telegram" onClose={() => setLinkRequired(false)} panelClassName="modal-panel modal-panel-md">
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Vincula tu cuenta de Telegram</h2>
        <p className="text-sm">Tu cuenta de Telegram todavía no está vinculada a tu usuario de Joinpoint con el bot actual. Este paso es necesario para vincular el grupo, aunque seas su dueño en Telegram.</p>
        <p className="text-sm">En Configuración → Notificaciones, pulsa Vincular Telegram y envía el comando /link por chat privado al bot indicado. Después vuelve a Grupos operativos para generar el código del grupo.</p>
        <div className="flex flex-wrap gap-3">
          <a href="settings?tab=notifications" className="btn-primary btn-md inline-flex items-center justify-center px-4">Ir a vincular Telegram</a>
          <button type="button" onClick={() => setLinkRequired(false)} className="btn-ghost btn-md px-4">Ahora no</button>
        </div>
      </div>
    </Dialog>}
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-xl font-bold">Grupos operativos</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Administra grupos de Telegram, sus temas, participantes y funciones de Joinpoint.</p></div><button disabled={busy} onClick={() => void openGroupDialog()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white"><FolderPlus className="h-4 w-4" />Nuevo grupo</button></div><div className="mt-4 grid grid-cols-3 gap-2">{[['Grupos activos', groups.filter(g => g.status === 'ACTIVE').length], ['Temas o rutas', current?.profileType === 'FIBER_ROUTES' ? routes.length : topics.filter(topic => topic.status !== 'DELETED').length], ['Participantes', participants.filter(p => p.status === 'ACTIVE').length]].map(([name, value]) => <div key={name} className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800"><b className="block text-lg">{value}</b><span className="text-[11px] text-slate-500">{name}</span></div>)}</div></section>
    {groups.some(group => !group.chatId && group.status === 'PENDING_LINK') && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Hay un código pendiente de usar. Todavía no representa un grupo vinculado y vence a los 15 minutos. Si ya vinculaste tu grupo con otro código, puedes ignorarlo.</p>}
    {message ? <div role="status" className="flex justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900"><span>{message}</span><button aria-label="Cerrar aviso" onClick={() => setMessage(null)}><X className="h-4 w-4" /></button></div> : null}
    <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]"><aside className={`${mobileDetail ? 'hidden lg:block' : 'block'} rounded-2xl border bg-white p-3 shadow-sm dark:bg-slate-900`}><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold">Grupos</h2><p className="text-xs text-slate-500">{groups.length} registrados</p></div><button aria-label="Verificar con Telegram" disabled={busy} onClick={() => void reconcile()} className="min-h-11 min-w-11 rounded-xl border"><RefreshCw className={`mx-auto h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button></div><label className="relative mt-3 block"><span className="sr-only">Buscar grupo</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar grupo" className="min-h-11 w-full rounded-xl border pl-9 pr-3 text-sm dark:bg-slate-950" /></label><div className="mt-3 space-y-2">{filtered.map(group => <button key={group.id} disabled={!group.chatId} onClick={() => { setSelected(group.id); setMobileDetail(true); setTab('content'); }} className={`flex min-h-[82px] w-full items-center justify-between rounded-xl border p-3 text-left ${group.id === selected ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/15' : ''}`}><span className="min-w-0"><b className="block truncate text-sm">{group.name || 'Pendiente de vincular'}</b><span className="mt-1 block text-[11px] text-violet-600">{PROFILES[group.profileType]?.label}</span><span className="block text-[11px] text-slate-500">{label(group.status)}</span></span><ChevronRight className="h-4 w-4" /></button>)}{!filtered.length ? <div className="rounded-xl border border-dashed p-5 text-center text-xs text-slate-500">Todavía no hay grupos.</div> : null}</div></aside>
      <main className={`${mobileDetail ? 'block' : 'hidden lg:block'} min-w-0 rounded-2xl border bg-white p-3 shadow-sm dark:bg-slate-900 sm:p-4`}>{current ? <><button onClick={() => setMobileDetail(false)} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-violet-700 lg:hidden"><ArrowLeft className="h-4 w-4" />Volver</button><div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{PROFILES[current.profileType]?.label}</p><h2 className="mt-1 text-lg font-bold">{current.name}</h2><p className="mt-1 text-xs text-slate-500">{PROFILES[current.profileType]?.description}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge(current.status)}`}>{label(current.status)}</span></div>{current.missingPermissions.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><b>Permisos pendientes del bot:</b> {current.missingPermissions.join(', ')}. El propietario de Joinpoint sí puede vincular; estos permisos corresponden al bot.</div> : null}{current.capabilities.includes('PARTICIPANT_MANAGEMENT') ? <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1"><button onClick={() => setTab('content')} className={`min-h-11 flex-1 rounded-lg text-sm font-semibold ${tab === 'content' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>Temas</button><button onClick={() => setTab('participants')} className={`min-h-11 flex-1 rounded-lg text-sm font-semibold ${tab === 'participants' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>Participantes ({participants.length})</button></div> : null}{tab === 'participants' && current.capabilities.includes('PARTICIPANT_MANAGEMENT') ? <Participants items={participants} action={participantAction} /> : current.profileType === 'FIBER_ROUTES' ? <FiberPanel routes={routes} detail={routeDetail} busy={busy} onNew={() => setRouteDialog(true)} onOpen={openRoute} onBack={() => setRouteDetail(null)} element={element} setElement={setElement} addElement={addElement} measurement={measurement} setMeasurement={setMeasurement} addMeasurement={addMeasurement} /> : current.profileType === 'CLIENT_TRACKING' ? <ClientPanel topics={topics} group={current} busy={busy} job={bulkJob} onNew={() => setTopicDialog(true)} onBulk={prepareBulk} onImport={importClients} onDelete={deleteTopic} onToggle={toggleBulk} /> : <div className="flex min-h-52 items-center justify-center text-sm text-slate-500">Este grupo no tiene automatizaciones habilitadas.</div>}</> : <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Selecciona un grupo operativo.</div>}</main></div>
    {commands.length ? <section className="rounded-2xl border bg-white shadow-sm dark:bg-slate-900"><button aria-expanded={commandsOpen} onClick={() => setCommandsOpen(open => !open)} className="flex min-h-14 w-full items-center justify-between p-4 text-left"><span><b className="block text-sm">Comandos del grupo</b><span className="text-xs text-slate-500">Sólo se aceptan en el contexto autorizado.</span></span><ChevronRight className={`h-4 w-4 ${commandsOpen ? 'rotate-90' : ''}`} /></button>{commandsOpen ? <div className="grid gap-2 border-t p-4 md:grid-cols-2">{commands.map(command => <div key={command} className="flex items-start justify-between rounded-xl border p-3"><code className="break-all text-xs font-bold text-violet-700">{command}</code><button aria-label={`Copiar ${command}`} onClick={() => void copy(command)} className="min-h-11 min-w-11"><Copy className="h-4 w-4" /></button></div>)}</div> : null}</section> : null}
    {groupDialog ? <GroupWizard profile={profile} setProfile={setProfile} step={groupStep} setStep={setGroupStep} link={link} busy={busy} generate={generateLink} copy={copy} close={() => { setGroupDialog(false); void loadGroups(); }} /> : null}
    {topicDialog ? <Dialog title="Nuevo tema" onClose={() => setTopicDialog(false)} panelClassName="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><ModalTitle title="Nuevo tema de cliente" close={() => setTopicDialog(false)} /><Field label="ID del cliente MikroWisp" value={clientId} onChange={value => { setClientId(value); setPreview(null); }} /><button disabled={busy || !clientId} onClick={() => void validateClient()} className="mt-3 min-h-11 w-full rounded-xl border font-semibold text-violet-700">Buscar cliente</button>{preview ? <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm"><b>{preview.topicName}</b></div> : null}<button disabled={busy || !preview} onClick={() => void createTopic()} className="mt-4 min-h-11 w-full rounded-xl bg-violet-600 font-semibold text-white disabled:opacity-50">Crear tema</button></Dialog> : null}
    {bulkDialog && bulkPreview ? <Dialog title="Crear temas" onClose={() => setBulkDialog(false)} panelClassName="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><ModalTitle title="Crear temas de clientes" close={() => setBulkDialog(false)} /><p className="text-sm text-slate-500">Se usarán los clientes guardados en Joinpoint. No se volverá a consultar MikroWisp al iniciar. Los temas se crean uno a uno, con pausas de al menos 3,5 segundos. Si Telegram limita las solicitudes, se espera el tiempo indicado y se continúa automáticamente. Puedes pausar y reanudar cuando quieras.</p><div className="mt-4 grid grid-cols-3 gap-2">{[['Clientes', bulkPreview.totalClients], ['Existentes', bulkPreview.existing], ['Por crear', bulkPreview.pending]].map(([name, value]) => <div key={name} className="rounded-xl bg-slate-50 p-3 text-center"><b className="block">{value}</b><span className="text-xs text-slate-500">{name}</span></div>)}</div><button disabled={busy || bulkPreview.pending === 0} onClick={() => void startBulk()} className="mt-5 min-h-11 w-full rounded-xl bg-violet-600 font-semibold text-white disabled:opacity-50">Iniciar creación controlada</button></Dialog> : null}
    {routeDialog ? <Dialog title="Nueva ruta" onClose={() => setRouteDialog(false)} panelClassName="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl" overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><ModalTitle title="Nueva ruta de fibra" close={() => setRouteDialog(false)} /><div className="grid gap-3 sm:grid-cols-2"><Field label="Código" value={routeForm.code} onChange={value => setRouteForm(form => ({ ...form, code: value }))} /><Field label="Nombre" value={routeForm.name} onChange={value => setRouteForm(form => ({ ...form, name: value }))} /><Field label="Zona de destino" value={routeForm.zone} onChange={value => setRouteForm(form => ({ ...form, zone: value }))} /><Field label="Tipo de cable" value={routeForm.cableType} onChange={value => setRouteForm(form => ({ ...form, cableType: value }))} /><Field label="Capacidad de hilos" value={routeForm.cableCapacity} onChange={value => setRouteForm(form => ({ ...form, cableCapacity: value }))} /></div><p className="mt-3 text-xs text-slate-500">Se creará: CÓDIGO · NOMBRE → ZONA.</p><button disabled={busy || !routeForm.code || !routeForm.name || !routeForm.zone} onClick={() => void createRoute()} className="mt-4 min-h-11 w-full rounded-xl bg-violet-600 font-semibold text-white disabled:opacity-50">Crear ruta y tema</button></Dialog> : null}
  </div>;
}

function ClientPanel({
  topics,
  group,
  busy,
  job,
  onNew,
  onBulk,
  onImport,
  onDelete,
  onToggle,
}: {
  topics: TelegramForumTopic[];
  group: TelegramForumGroup;
  busy: boolean;
  job: TelegramBulkJob | null;
  onNew: () => void;
  onBulk: () => void;
  onImport: () => void;
  onDelete: (topic: TelegramForumTopic) => void;
  onToggle: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  const [topicSearch, setTopicSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    if (!job?.retryAt || job.status !== "RUNNING") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job?.retryAt, job?.status]);
  useEffect(() => {
    setPage(1);
    setTopicSearch("");
  }, [group.id]);
  const waitingSeconds = Math.max(
    0,
    Math.ceil(((job?.retryAt || 0) - now) / 1000),
  );
  const processed = job
    ? job.existing + job.created + job.skipped + job.failed
    : 0;
  const percent =
    job && job.totalClients > 0
      ? Math.min(100, Math.round((processed / job.totalClients) * 100))
      : 0;
  const { visible, deleted } = useMemo(
    () => ({
      visible: topics.filter((topic) => topic.status !== "DELETED"),
      deleted: topics.filter((topic) => topic.status === "DELETED"),
    }),
    [topics],
  );
  const normalizedSearch = topicSearch.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      visible.filter(
        (topic) =>
          !normalizedSearch ||
          [
            topic.name,
            topic.clientId,
            topic.threadId,
            label(topic.status),
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(normalizedSearch),
          ),
      ),
    [visible, normalizedSearch],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    setPage((value) => Math.min(value, totalPages));
  }, [totalPages]);
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const firstRow = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(safePage * pageSize, filtered.length);
  const disabled = busy || group.status !== "ACTIVE";
  return (
    <section className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="text-base font-bold">
            Temas de clientes{" "}
            <span className="font-normal text-slate-500">
              ({visible.length})
            </span>
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Administra los temas registrados y verifica con Telegram cuando
            necesites confirmar cambios externos.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-auto">
          <button
            disabled={disabled}
            onClick={onImport}
            className="btn-primary btn-md inline-flex min-h-11 items-center justify-center gap-2 px-3"
          >
            <Database className="h-4 w-4" />
            Leer clientes
          </button>
          <button
            disabled={disabled}
            onClick={onBulk}
            className="btn-outline btn-md inline-flex min-h-11 items-center justify-center gap-2 px-3"
          >
            <GitBranch className="h-4 w-4" />
            Crear desde guardados
          </button>
          <button
            disabled={disabled}
            onClick={onNew}
            className="btn-outline btn-md inline-flex min-h-11 items-center justify-center gap-2 px-3"
          >
            <Plus className="h-4 w-4" />
            Nuevo tema
          </button>
        </div>
      </div>
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800">
        MikroWisp se consulta sólo en modo lectura. Joinpoint guarda únicamente
        ID y nombre; los temas existentes se omiten.
      </p>
      {job && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 dark:bg-violet-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm">Creación masiva · {label(job.status)}</b>
            {["RUNNING", "PENDING", "PAUSED"].includes(job.status) && (
              <button
                disabled={busy}
                onClick={onToggle}
                className="btn-outline btn-md px-3"
              >
                {job.status === "PAUSED" ? "Reanudar" : "Pausar"}
              </button>
            )}
          </div>
          <div className="mt-3 flex justify-between text-sm font-semibold">
            <span>
              {processed} de {job.totalClients} procesados
            </span>
            <span>{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Avance de creación de temas"
            aria-valuemin={0}
            aria-valuemax={job.totalClients || 1}
            aria-valuenow={processed}
            aria-valuetext={
              processed + " de " + job.totalClients + " procesados"
            }
            className="mt-2 h-3 overflow-hidden rounded-full bg-violet-200 dark:bg-violet-900"
          >
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-500"
              style={{ width: percent + "%" }}
            />
          </div>
          {job.status === "RUNNING" && waitingSeconds > 0 && (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              Telegram solicita una espera de {waitingSeconds} s. Continuará
              automáticamente.
            </p>
          )}
          {job.status === "PAUSED" && (
            <p className="mt-2 text-sm">
              Proceso pausado. Pulsa Reanudar para continuar.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            Creados {job.created} · Existentes {job.existing} · Omitidos{" "}
            {job.skipped} · Errores {job.failed} · Pendientes {job.pending}
          </p>
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Buscar temas</span>
            <input
              value={topicSearch}
              onChange={(event) => {
                setTopicSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar por cliente, tema o estado"
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Filas
            <select
              aria-label="Filas por página"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {[25, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Tema
                </th>
                <th scope="col" className="px-4 py-3">
                  Cliente
                </th>
                <th scope="col" className="px-4 py-3">
                  Tema Telegram
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pageRows.map((topic) => (
                <tr
                  key={topic.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60"
                >
                  <td className="max-w-sm px-4 py-3 font-semibold text-slate-900 dark:text-white">
                    {topic.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {topic.clientId.startsWith("UNREGISTERED:") ? (
                      <span className="text-amber-700">Sin asociar</span>
                    ) : (
                      topic.clientId
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {topic.threadId || "Sin confirmar"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
                        badge(topic.status)
                      }
                    >
                      {label(topic.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      aria-label={"Eliminar " + topic.name}
                      title="Eliminar en Telegram"
                      disabled={
                        disabled ||
                        ["CREATING", "DELETING"].includes(topic.status)
                      }
                      onClick={() => onDelete(topic)}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pageRows.length && (
            <p className="p-8 text-center text-sm text-slate-500">
              {topicSearch
                ? "No hay temas que coincidan con la búsqueda."
                : "Este grupo todavía no tiene temas."}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Mostrando {firstRow}–{lastRow} de {filtered.length} temas
          </span>
          <div className="flex items-center gap-2">
            <button
              aria-label="Página anterior"
              disabled={safePage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-24 text-center font-semibold text-slate-700 dark:text-slate-200">
              Página {safePage} de {totalPages}
            </span>
            <button
              aria-label="Página siguiente"
              disabled={safePage >= totalPages}
              onClick={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      {!!deleted.length && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Historial de eliminados ({deleted.length})
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tema</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Telegram</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {deleted.map((topic) => (
                  <tr key={topic.id}>
                    <td className="px-3 py-2 font-medium">{topic.name}</td>
                    <td className="px-3 py-2">{topic.clientId}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {topic.threadId || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
                          badge(topic.status)
                        }
                      >
                        {label(topic.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        disabled={disabled}
                        onClick={() => onDelete(topic)}
                        className="min-h-10 rounded-lg border px-3 text-xs font-semibold"
                      >
                        Comprobar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

type ElementForm = { type: string; name: string; location: string; tray: string; port: string; inputFiber: string; outputFiber: string; notes: string };
function FiberPanel({ routes, detail, busy, onNew, onOpen, onBack, element, setElement, addElement, measurement, setMeasurement, addMeasurement }: { routes: FiberRoute[]; detail: FiberRouteDetail | null; busy: boolean; onNew: () => void; onOpen: (route: FiberRoute) => void; onBack: () => void; element: ElementForm; setElement: Dispatch<SetStateAction<ElementForm>>; addElement: () => void; measurement: { powerDbm: string; wavelengthNm: string; notes: string }; setMeasurement: Dispatch<SetStateAction<{ powerDbm: string; wavelengthNm: string; notes: string }>>; addMeasurement: () => void }) { if (!detail) return <section className="mt-4"><div className="flex justify-between gap-3"><div><h3 className="text-sm font-bold">Rutas de fibra</h3><p className="text-xs text-slate-500">Cada ruta tiene un tema y recorrido estructurado. Para vincular uno existente, escribe /registrar_ruta dentro de ese tema en Telegram. El código se genera automáticamente y se conservan sus fotos y mensajes. Opcional: /registrar_ruta NOMBRE | ZONA.</p></div><button onClick={onNew} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white"><GitBranch className="h-4 w-4" />Nueva ruta</button></div><div className="mt-3 space-y-2">{routes.map(route => <button key={route.id} onClick={() => onOpen(route)} className="flex min-h-[72px] w-full items-center justify-between rounded-xl border p-3 text-left"><span><b className="block text-sm">{route.code} · {route.name}</b><span className="text-xs text-slate-500">{route.zone} · {label(route.status)}</span></span><ChevronRight className="h-4 w-4" /></button>)}{!routes.length ? <div className="rounded-xl border border-dashed p-6 text-center text-xs text-slate-500">Aún no hay rutas.</div> : null}</div></section>; return <section className="mt-4"><button onClick={onBack} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-violet-700"><ArrowLeft className="h-4 w-4" />Volver a rutas</button><div className="rounded-xl border p-4"><div className="flex justify-between"><div><h3 className="font-bold">{detail.route.code} · {detail.route.name}</h3><p className="text-xs text-slate-500">Destino: {detail.route.zone}</p></div><span className={`h-fit rounded-full px-2 py-1 text-xs font-semibold ${badge(detail.route.status)}`}>{label(detail.route.status)}</span></div><div className="mt-4 space-y-2">{detail.elements.map(item => <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-xs"><b>{item.sequence}. {item.type} · {item.name}</b><p className="text-slate-500">{item.location || 'Sin ubicación'}{item.inputFiber || item.outputFiber ? ` · ${item.inputFiber || '—'} → ${item.outputFiber || '—'}` : ''}</p></div>)}</div></div><div className="mt-3 grid gap-3 xl:grid-cols-2"><div className="rounded-xl border p-4"><h4 className="text-sm font-bold">Agregar elemento</h4><select value={element.type} onChange={event => setElement(form => ({ ...form, type: event.target.value }))} className="mt-3 min-h-11 w-full rounded-xl border px-3 text-sm">{[['ODF', 'ODF'], ['CLOSURE', 'Mufa'], ['SEGMENT', 'Tramo/fusión'], ['SPLITTER', 'Splitter'], ['NAP', 'NAP'], ['DESTINATION', 'Destino']].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select><div className="mt-2 grid gap-2 sm:grid-cols-2">{(['name', 'location', 'tray', 'port', 'inputFiber', 'outputFiber', 'notes'] as const).map(key => <Field key={key} label={({ name: 'Nombre', location: 'Ubicación', tray: 'Bandeja', port: 'Puerto', inputFiber: 'Hilo de entrada', outputFiber: 'Hilo de salida', notes: 'Observación' })[key]} value={element[key]} onChange={value => setElement(form => ({ ...form, [key]: value }))} />)}</div><button disabled={busy || !element.name} onClick={addElement} className="mt-3 min-h-11 w-full rounded-xl bg-violet-600 text-sm font-semibold text-white disabled:opacity-50">Agregar al recorrido</button></div><div className="rounded-xl border p-4"><h4 className="text-sm font-bold">Registrar potencia</h4><Field label="Potencia dBm" value={measurement.powerDbm} onChange={value => setMeasurement(form => ({ ...form, powerDbm: value }))} /><Field label="Longitud de onda nm" value={measurement.wavelengthNm} onChange={value => setMeasurement(form => ({ ...form, wavelengthNm: value }))} /><Field label="Observación" value={measurement.notes} onChange={value => setMeasurement(form => ({ ...form, notes: value }))} /><button disabled={busy || !measurement.powerDbm} onClick={addMeasurement} className="mt-3 min-h-11 w-full rounded-xl border border-violet-300 text-sm font-semibold text-violet-700">Guardar medición</button>{detail.measurements[0] ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs">Última: <b>{detail.measurements[0].powerDbm} dBm</b></p> : null}</div></div></section>; }

function Participants({ items, action }: { items: TelegramForumParticipant[]; action: (participant: TelegramForumParticipant, action: 'invite' | 'remove' | 'reinstate') => void }) { return <section className="mt-4"><h3 className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4" />Participantes autorizados</h3><div className="mt-3 space-y-2">{items.map(item => <div key={item.userId} className="flex items-center justify-between rounded-xl border p-3 text-xs"><div><b>{item.name || item.email}</b><p className="text-slate-500">{item.telegramLinked ? label(item.status) : 'Telegram no vinculado'}</p></div>{item.telegramLinked && ['NOT_INVITED', 'INVITE_EXPIRED'].includes(item.status) ? <button onClick={() => action(item, 'invite')} className="min-h-10 rounded-lg border px-3">Invitar</button> : ['ACTIVE', 'PRESENT_UNAUTHORIZED'].includes(item.status) ? <button onClick={() => action(item, 'remove')} className="min-h-10 rounded-lg border border-rose-300 px-3 text-rose-700">Retirar</button> : item.status === 'REMOVED' ? <button onClick={() => action(item, 'reinstate')} className="min-h-10 rounded-lg border px-3">Reintegrar</button> : null}</div>)}</div></section>; }
function GroupWizard({ profile, setProfile, step, setStep, link, busy, generate, copy, close }: { profile: TelegramGroupProfile; setProfile: (value: TelegramGroupProfile) => void; step: 1 | 2 | 3; setStep: (value: 1 | 2 | 3) => void; link: { command: string; expiresAt: number } | null; busy: boolean; generate: () => void; copy: (value: string) => Promise<void>; close: () => void }) { return <Dialog title="Vincular grupo" onClose={close} panelClassName="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl" overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><ModalTitle title="Vincular nuevo grupo" close={close} /><p className="text-xs text-slate-500">Paso {step} de 3</p>{step === 1 ? <div className="mt-4 space-y-2">{(Object.keys(PROFILES) as TelegramGroupProfile[]).map(key => <button key={key} onClick={() => setProfile(key)} className={`w-full rounded-xl border p-3 text-left ${profile === key ? 'border-violet-500 bg-violet-50' : ''}`}><b className="text-sm">{PROFILES[key].label}</b><p className="text-xs text-slate-500">{PROFILES[key].description}</p></button>)}<button onClick={() => setStep(2)} className="min-h-11 w-full rounded-xl bg-violet-600 font-semibold text-white">Continuar</button></div> : step === 2 ? <div className="mt-4"><ol className="list-decimal space-y-2 pl-5 text-sm"><li>Crea un grupo privado y activa Temas.</li><li>Agrega el bot como administrador.</li><li>Concede: <b>{PROFILES[profile].permissions.join(', ')}</b>.</li></ol><p className="mt-3 rounded-xl bg-blue-50 p-3 text-xs">El propietario de Joinpoint puede vincular. Estos permisos corresponden al bot.</p><button disabled={busy} onClick={generate} className="mt-4 min-h-11 w-full rounded-xl bg-violet-600 font-semibold text-white">Generar código</button></div> : <div className="mt-4"><p className="text-sm">Envía el código dentro del grupo:</p>{link ? <div className="mt-3 rounded-xl bg-slate-100 p-3"><code className="font-bold">{link.command}</code><p className="mt-2 text-xs">Vence: {new Date(link.expiresAt).toLocaleTimeString('es-PE')}</p><button onClick={() => void copy(link.command)} className="mt-3 min-h-11 rounded-xl border bg-white px-3 text-xs font-semibold"><Copy className="mr-2 inline h-4 w-4" />Copiar</button></div> : null}<button onClick={close} className="mt-4 min-h-11 w-full rounded-xl bg-violet-600 font-semibold text-white">Finalizar y actualizar</button></div>}</Dialog>; }
function ModalTitle({ title, close }: { title: string; close: () => void }) { return <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button aria-label="Cerrar" onClick={close} className="min-h-11 min-w-11"><X className="h-4 w-4" /></button></div>; }
function Field({ label: fieldLabel, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="mt-2 block text-xs font-semibold">{fieldLabel}<input value={value} onChange={event => onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm" /></label>; }
