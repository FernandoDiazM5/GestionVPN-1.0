import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Copy, ExternalLink, FolderPlus, Loader2, MoreVertical, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import Dialog from '../../../Common/Dialog';
import { integrationsApi, type IntegrationGuide, type TelegramForumGroup, type TelegramForumParticipant, type TelegramForumTopic } from '../../../../services/integrationsApi';

const COMMANDS = [
  { command: '/informacion', description: 'Identificación, contacto y dirección.' },
  { command: '/servicios', description: 'Plan, nodo, IP, MAC y estado técnico.' },
  { command: '/facturacion', description: 'Facturas pendientes y deuda total.' },
  { command: '/ayuda', description: 'Lista de comandos disponibles.' },
  { command: '/registrartema ID_CLIENTE', description: 'Vincula un tema existente.' },
];

const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Activo', CLOSED: 'Cerrado', DELETED: 'Eliminado en Telegram', DELETING: 'Eliminando', DELETE_UNKNOWN: 'Eliminación por verificar', REPAIR_REQUIRED: 'Requiere revisión', CREATE_UNKNOWN: 'Creación por verificar', BOT_REMOVED: 'Bot retirado', MISSING_PERMISSIONS: 'Faltan permisos', FORUM_DISABLED: 'Temas desactivados' };
const label = (value: string) => STATUS_LABELS[value] || value.replaceAll('_', ' ').toLowerCase();
const statusClass = (status: string) => status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : status === 'CLOSED' || status === 'DELETED' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : status.includes('REPAIR') || status.includes('UNKNOWN') || status === 'MISSING_PERMISSIONS' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300';

export default function TelegramForums({ standalone = false }: { standalone?: boolean }) {
  return standalone ? <TelegramForumsContent /> : null;
}

function TelegramForumsContent() {
  const [groups, setGroups] = useState<TelegramForumGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [topics, setTopics] = useState<TelegramForumTopic[]>([]);
  const [participants, setParticipants] = useState<TelegramForumParticipant[]>([]);
  const [guide, setGuide] = useState<IntegrationGuide | null>(null);
  const [link, setLink] = useState<{ command: string; expiresAt: number } | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'topics' | 'participants'>('topics');
  const [mobileDetail, setMobileDetail] = useState(false);
  const [topicDialog, setTopicDialog] = useState(false);
  const [groupDialog, setGroupDialog] = useState(false);
  const [groupStep, setGroupStep] = useState<1 | 2 | 3>(1);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [actionTopic, setActionTopic] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [preview, setPreview] = useState<{ client: { id: string; name: string }; topicName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await integrationsApi.listTelegramForums();
    setGroups(result.groups);
    setSelected(current => result.groups.some(group => group.id === current && group.chatId) ? current : result.groups.find(group => group.status === 'ACTIVE')?.id || result.groups.find(group => group.chatId)?.id || null);
  }, []);

  useEffect(() => { void load().catch(() => setMessage('No se pudieron cargar los grupos. Revisa las integraciones MikroWisp y Telegram.')); void integrationsApi.getMikrowispGuide().then(result => setGuide(result.guide)).catch(() => null); }, [load]);
  useEffect(() => {
    if (!selected) { setTopics([]); setParticipants([]); return; }
    void Promise.all([integrationsApi.listTelegramForumTopics(selected), integrationsApi.listTelegramForumParticipants(selected)])
      .then(([topicResult, participantResult]) => { setTopics(topicResult.topics); setParticipants(participantResult.participants); })
      .catch(() => setMessage('No se pudieron cargar los temas o participantes.'));
  }, [selected]);

  const currentGroup = groups.find(group => group.id === selected) || null;
  const filteredGroups = useMemo(() => groups.filter(group => (group.name || 'Pendiente de vincular').toLowerCase().includes(search.trim().toLowerCase())), [groups, search]);
  const activeGroups = groups.filter(group => group.status === 'ACTIVE').length;
  const activeTopics = topics.filter(topic => topic.status === 'ACTIVE').length;
  const activeParticipants = participants.filter(participant => participant.status === 'ACTIVE').length;

  const selectGroup = (group: TelegramForumGroup) => {
    setSelected(group.id); setTab('topics'); setMobileDetail(true); setActionTopic(null);
  };
  const generateLink = async () => {
    setBusy(true); setMessage(null);
    try { const result = await integrationsApi.createTelegramForumLink(); setLink(result.link); setGroupStep(3); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo generar el código.'); }
    finally { setBusy(false); }
  };
  const validateClient = async () => {
    if (!selected) return; setBusy(true); setMessage(null);
    try { setPreview((await integrationsApi.previewTelegramForumTopic(selected, clientId)).preview); }
    catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : 'No se pudo validar el cliente.'); }
    finally { setBusy(false); }
  };
  const createTopic = async () => {
    if (!selected || !preview) return; setBusy(true); setMessage(null);
    try { const result = await integrationsApi.createTelegramForumTopic(selected, preview.client.id); setTopics(value => [result.topic, ...value]); setPreview(null); setClientId(''); setTopicDialog(false); setMessage('Tema creado y confirmado por Telegram.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear el tema.'); }
    finally { setBusy(false); }
  };
  const changeTopic = async (topic: TelegramForumTopic, action: 'close' | 'reopen') => {
    if (!selected) return; setBusy(true); setActionTopic(null);
    try { const result = await integrationsApi.changeTelegramForumTopic(selected, topic.id, action); setTopics(value => value.map(item => item.id === topic.id ? result.topic : item)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Telegram no confirmó la operación.'); }
    finally { setBusy(false); }
  };
  const recreate = async (topic: TelegramForumTopic) => {
    if (!selected || !window.confirm(`¿Recrear el tema “${topic.name}”? Verifica primero en Telegram que no exista.`)) return;
    setBusy(true); setActionTopic(null);
    try { const result = await integrationsApi.recreateTelegramForumTopic(selected, topic.id); setTopics(value => value.map(item => item.id === topic.id ? result.topic : item)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Telegram no confirmó la recreación.'); }
    finally { setBusy(false); }
  };
  const deleteTopic = async (topic: TelegramForumTopic) => {
    if (!selected || !window.confirm(`¿Eliminar “${topic.name}” de Telegram? También se eliminarán todos los mensajes del tema. El registro permanecerá en Joinpoint para auditoría.`)) return;
    setBusy(true); setActionTopic(null); setMessage(null);
    try {
      const result = await integrationsApi.deleteTelegramForumTopic(selected, topic.id);
      setTopics(value => value.map(item => item.id === topic.id ? result.topic : item));
      setMessage('Tema eliminado en Telegram. El historial quedó conservado en Joinpoint.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Telegram no confirmó la eliminación.'); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true); setMessage(null);
    try {
      if (selected) {
        const sync = await integrationsApi.reconcileTelegramForum(selected);
        const [topicResult, participantResult] = await Promise.all([integrationsApi.listTelegramForumTopics(selected), integrationsApi.listTelegramForumParticipants(selected)]);
        setTopics(topicResult.topics); setParticipants(participantResult.participants);
        setGroups(value => value.map(group => group.id === sync.group.id ? sync.group : group));
        setMessage(sync.deletedTopics ? `${sync.deletedTopics} tema(s) eliminado(s) directamente en Telegram fueron detectados.` : 'Grupo, permisos y temas verificados con Telegram.');
      } else await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo verificar con Telegram.'); }
    finally { setBusy(false); }
  };
  const participantAction = async (participant: TelegramForumParticipant, action: 'invite' | 'remove' | 'reinstate') => {
    if (!selected) return;
    if (action === 'remove' && !window.confirm(`¿Retirar a ${participant.name || participant.email} del grupo completo?`)) return;
    if (action === 'reinstate' && !window.confirm(`¿Reintegrar a ${participant.name || participant.email}?`)) return;
    setBusy(true);
    try {
      const result = action === 'invite' ? await integrationsApi.inviteTelegramForumParticipant(selected, participant.userId) : action === 'remove' ? await integrationsApi.removeTelegramForumParticipant(selected, participant.userId) : await integrationsApi.reinstateTelegramForumParticipant(selected, participant.userId);
      setParticipants(value => value.map(item => item.userId === participant.userId ? { ...item, ...result.participant } : item));
      setMessage(action === 'remove' ? 'Participante retirado.' : 'Invitación individual creada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage('Comando copiado.'); }
    catch { setMessage('No se pudo copiar automáticamente. Selecciona el comando manualmente.'); }
  };

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-xl font-bold text-slate-900 dark:text-white">Historial de clientes</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Gestiona grupos privados y consultas de clientes desde Telegram. Joinpoint consulta MikroWisp en el momento y no guarda conversaciones.</p></div>
        <button type="button" onClick={() => { setGroupDialog(true); setGroupStep(1); setLink(null); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"><FolderPlus className="h-4 w-4" />Nuevo grupo</button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[['Grupos activos', activeGroups], ['Temas activos', activeTopics], ['Participantes', activeParticipants]].map(([name, value]) => <div key={name} className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/70"><p className="text-lg font-bold text-slate-900 dark:text-white">{value}</p><p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{name}</p></div>)}
      </div>
    </section>

    {message ? <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-500/10 dark:text-violet-100"><span>{message}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setMessage(null)}><X className="h-4 w-4" /></button></div> : null}

    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className={`${mobileDetail ? 'hidden lg:block' : 'block'} rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900`} aria-label="Grupos de Telegram">
        <div className="flex items-center justify-between"><div><h2 className="text-sm font-bold">Grupos</h2><p className="mt-0.5 text-xs text-slate-500">{groups.length} registrados</p></div><button type="button" disabled={busy} aria-label="Verificar con Telegram" title="Verificar con Telegram" onClick={() => void refresh()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 disabled:opacity-50 dark:border-slate-700"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button></div>
        <label className="relative mt-3 block"><span className="sr-only">Buscar grupo</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar grupo" className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950" /></label>
        <div className="mt-3 space-y-2">{filteredGroups.length ? filteredGroups.map(group => <button key={group.id} type="button" disabled={!group.chatId} aria-pressed={group.id === selected} onClick={() => selectGroup(group)} className={`flex min-h-[72px] w-full items-center justify-between rounded-xl border p-3 text-left transition disabled:opacity-60 ${group.id === selected ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/15 dark:bg-violet-500/10' : 'border-slate-200 hover:border-violet-300 dark:border-slate-700'}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold">{group.name || 'Pendiente de vincular'}</span><span className="mt-1 block text-[11px] text-slate-500">{group.id === selected ? `${topics.length} temas · ${participants.length} participantes` : label(group.status)}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></button>) : <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-700">{groups.length ? 'No hay grupos que coincidan.' : 'Todavía no hay grupos vinculados.'}</div>}</div>
      </aside>

      <main className={`${mobileDetail ? 'block' : 'hidden lg:block'} min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-4`}>
        {currentGroup ? <>
          <button type="button" onClick={() => setMobileDetail(false)} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-violet-700 lg:hidden"><ArrowLeft className="h-4 w-4" />Volver a grupos</button>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800"><div><p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Grupo seleccionado</p><h2 className="mt-1 text-lg font-bold">{currentGroup.name}</h2></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(currentGroup.status)}`}>{label(currentGroup.status)}</span></div>
          <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Contenido del grupo">
            <button type="button" role="tab" aria-selected={tab === 'topics'} onClick={() => setTab('topics')} className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold ${tab === 'topics' ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-900 dark:text-violet-300' : 'text-slate-500'}`}>Temas ({topics.length})</button>
            <button type="button" role="tab" aria-selected={tab === 'participants'} onClick={() => setTab('participants')} className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold ${tab === 'participants' ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-900 dark:text-violet-300' : 'text-slate-500'}`}>Participantes ({participants.length})</button>
          </div>
          {tab === 'topics' ? <section className="mt-4">{currentGroup.status !== 'ACTIVE' ? <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-100">Corrige el estado “{label(currentGroup.status)}” en Telegram y vuelve a verificar. El historial permanece disponible, pero las operaciones están pausadas.</div> : null}<div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Temas del grupo</h3><p className="mt-1 text-xs text-slate-500">Un tema por cliente vinculado.</p></div><button type="button" disabled={currentGroup.status !== 'ACTIVE'} onClick={() => { setTopicDialog(true); setPreview(null); setClientId(''); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Nuevo tema</button></div>
            <div className="mt-3 space-y-2">{topics.length ? topics.map(topic => <article key={topic.id} className="relative rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-sm font-semibold">{topic.name}</h4><p className="mt-1 text-xs text-slate-500">Cliente {topic.clientId} · Thread {topic.threadId || 'sin confirmar'}</p><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(topic.status)}`}>{label(topic.status)}</span></div><button type="button" aria-label={`Acciones de ${topic.name}`} onClick={() => setActionTopic(value => value === topic.id ? null : topic.id)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700"><MoreVertical className="h-4 w-4" /></button></div>{actionTopic === topic.id ? <div className="absolute right-3 top-14 z-10 min-w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">{topic.status === 'ACTIVE' ? <button type="button" disabled={busy} onClick={() => void changeTopic(topic, 'close')} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">Cerrar tema</button> : topic.status === 'CLOSED' ? <button type="button" disabled={busy} onClick={() => void changeTopic(topic, 'reopen')} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">Reabrir tema</button> : null}{['ACTIVE', 'CLOSED'].includes(topic.status) ? <button type="button" disabled={busy} onClick={() => void deleteTopic(topic)} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-500/10">Eliminar de Telegram</button> : null}{['REPAIR_REQUIRED', 'CREATE_UNKNOWN', 'DELETED', 'DELETE_UNKNOWN'].includes(topic.status) ? <button type="button" disabled={busy} onClick={() => void recreate(topic)} className="min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50">Recrear tema</button> : null}</div> : null}</article>) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700">Este grupo todavía no tiene temas.</div>}</div>
          </section> : <section className="mt-4"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-slate-500" /><h3 className="text-sm font-bold">Participantes conocidos</h3></div><p className="mt-1 text-xs text-slate-500">Usuarios observados por el bot; no es el censo completo de Telegram.</p><div className="mt-3 space-y-2">{participants.length ? participants.map(participant => <article key={participant.userId} className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{participant.name || participant.email}</p><p className="mt-1 text-slate-500">{participant.telegramLinked ? label(participant.status) : 'Telegram no vinculado'}</p></div>{participant.telegramLinked && participant.status === 'NOT_INVITED' ? <button type="button" onClick={() => void participantAction(participant, 'invite')} className="min-h-10 rounded-lg border px-3">Invitar</button> : participant.status === 'ACTIVE' ? <button type="button" onClick={() => void participantAction(participant, 'remove')} className="min-h-10 rounded-lg border border-rose-300 px-3 text-rose-700">Retirar</button> : participant.status === 'REMOVED' ? <button type="button" onClick={() => void participantAction(participant, 'reinstate')} className="min-h-10 rounded-lg border px-3">Reintegrar</button> : null}</div>{participant.inviteLink ? <a className="mt-2 block break-all rounded-lg bg-slate-100 p-2 text-violet-700 underline dark:bg-slate-800 dark:text-violet-300" href={participant.inviteLink} target="_blank" rel="noreferrer">Abrir invitación individual</a> : null}</article>) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700">No hay participantes conocidos.</div>}</div></section>}
        </> : <div className="flex min-h-64 flex-col items-center justify-center text-center"><Users className="h-8 w-8 text-slate-300" /><h2 className="mt-3 text-sm font-bold">Selecciona un grupo</h2><p className="mt-1 text-xs text-slate-500">Verás sus temas y participantes aquí.</p></div>}
      </main>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"><button type="button" aria-expanded={commandsOpen} onClick={() => setCommandsOpen(value => !value)} className="flex min-h-14 w-full items-center justify-between gap-3 p-4 text-left"><span><span className="block text-sm font-bold">Comandos disponibles</span><span className="mt-1 block text-xs text-slate-500">Consultas permitidas dentro del tema del cliente.</span></span><ChevronRight className={`h-4 w-4 transition ${commandsOpen ? 'rotate-90' : ''}`} /></button>{commandsOpen ? <div className="grid gap-2 border-t border-slate-100 p-4 dark:border-slate-800 md:grid-cols-2">{COMMANDS.map(item => <div key={item.command} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div><code className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{item.command}</code><p className="mt-1 text-xs text-slate-500">{item.description}</p></div><button type="button" aria-label={`Copiar ${item.command}`} onClick={() => void copy(item.command)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><Copy className="h-4 w-4" /></button></div>)}</div> : null}</section>

    {topicDialog ? <Dialog title="Nuevo tema" onClose={() => setTopicDialog(false)} panelClassName="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900" overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Nuevo tema</h2><p className="mt-1 text-xs text-slate-500">Busca el cliente y confirma antes de crear el tema en Telegram.</p></div><button type="button" aria-label="Cerrar" onClick={() => setTopicDialog(false)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl"><X className="h-4 w-4" /></button></div><label className="mt-5 block"><span className="text-xs font-semibold">ID del cliente MikroWisp</span><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={clientId} onChange={event => { setClientId(event.target.value); setPreview(null); }} placeholder="Ej. 11" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /><button type="button" disabled={busy || !clientId.trim()} onClick={() => void validateClient()} className="min-h-11 rounded-xl border border-violet-200 px-4 text-sm font-semibold text-violet-700 disabled:opacity-50">Buscar cliente</button></div></label>{preview ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-100"><p className="text-xs font-semibold uppercase tracking-wide">Cliente encontrado</p><p className="mt-2 font-bold">{preview.client.id} · {preview.client.name}</p><p className="mt-1 text-xs">Nombre del tema: {preview.topicName}</p></div> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setTopicDialog(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold dark:border-slate-700">Cancelar</button><button type="button" disabled={busy || !preview} onClick={() => void createTopic()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Crear tema</button></div></Dialog> : null}

    {groupDialog ? <Dialog title="Vincular nuevo grupo" onClose={() => setGroupDialog(false)} panelClassName="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900" overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Vincular nuevo grupo</h2><p className="mt-1 text-xs text-slate-500">Paso {groupStep} de 3</p></div><button type="button" aria-label="Cerrar" onClick={() => setGroupDialog(false)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl"><X className="h-4 w-4" /></button></div><div className="mt-4 grid grid-cols-3 gap-2">{[1, 2, 3].map(step => <span key={step} className={`h-1.5 rounded-full ${step <= groupStep ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'}`} />)}</div>{groupStep === 1 ? <div className="mt-5"><h3 className="text-sm font-bold">Prepara el supergrupo</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300"><li>Crea un grupo privado en Telegram.</li><li>Activa <b>Temas</b> en la configuración.</li><li>Agrega el bot del workspace como administrador.</li></ol><button type="button" onClick={() => setGroupStep(2)} className="mt-5 min-h-11 w-full rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white">Ya preparé el grupo</button></div> : groupStep === 2 ? <div className="mt-5"><h3 className="text-sm font-bold">Comprueba los permisos</h3><div className="mt-3 space-y-2">{['Administrar temas', 'Invitar usuarios', 'Restringir miembros'].map(permission => <div key={permission} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><Check className="h-4 w-4 text-emerald-600" />{permission}</div>)}</div><button type="button" disabled={busy} onClick={() => void generateLink()} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}Generar código</button></div> : <div className="mt-5"><h3 className="text-sm font-bold">Envía el código en Telegram</h3><p className="mt-2 text-xs text-slate-500">Estado: esperando vinculación. El grupo aparecerá en la lista cuando el bot confirme el comando.</p>{link ? <div className="mt-4 rounded-xl bg-slate-100 p-3 dark:bg-slate-800"><code className="block select-all break-all text-sm font-bold">{link.command}</code><p className="mt-2 text-xs text-slate-500">Vence: {new Date(link.expiresAt).toLocaleTimeString('es-PE')}</p><button type="button" onClick={() => void copy(link.command)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"><Copy className="h-4 w-4" />Copiar comando</button></div> : null}<div className="mt-4 flex flex-wrap gap-2">{guide ? <a href="/api/workspace/integrations/mikrowisp/guide/download" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 px-3 text-xs font-semibold text-violet-700"><ExternalLink className="h-4 w-4" />Ver guía PDF · {guide.version}</a> : null}<button type="button" onClick={() => { setGroupDialog(false); void load(); }} className="min-h-11 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white">Finalizar y actualizar</button></div></div>}</Dialog> : null}
  </div>;
}
