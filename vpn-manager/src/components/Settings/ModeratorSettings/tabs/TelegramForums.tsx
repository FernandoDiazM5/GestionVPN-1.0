import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, FolderPlus, Loader2, RefreshCw } from 'lucide-react';
import { integrationsApi, type IntegrationGuide, type TelegramForumGroup, type TelegramForumParticipant, type TelegramForumTopic } from '../../../../services/integrationsApi';

export default function TelegramForums() {
  const [groups, setGroups] = useState<TelegramForumGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [topics, setTopics] = useState<TelegramForumTopic[]>([]);
  const [participants, setParticipants] = useState<TelegramForumParticipant[]>([]);
  const [guide, setGuide] = useState<IntegrationGuide | null>(null);
  const [link, setLink] = useState<{ command: string; expiresAt: number } | null>(null);
  const [clientId, setClientId] = useState('');
  const [preview, setPreview] = useState<{ client: { id: string; name: string }; topicName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await integrationsApi.listTelegramForums();
    setGroups(result.groups);
    setSelected(current => current || result.groups.find(group => group.status === 'ACTIVE')?.id || null);
  }, []);
  useEffect(() => { void load().catch(() => setMessage('No se pudieron cargar los grupos.')); void integrationsApi.getMikrowispGuide().then(result => setGuide(result.guide)).catch(() => null); }, [load]);
  useEffect(() => { if (!selected) { setTopics([]); setParticipants([]); return; } void Promise.all([integrationsApi.listTelegramForumTopics(selected), integrationsApi.listTelegramForumParticipants(selected)]).then(([topicResult, participantResult]) => { setTopics(topicResult.topics); setParticipants(participantResult.participants); }).catch(() => setMessage('No se pudieron cargar los temas o participantes.')); }, [selected]);

  const generateLink = async () => {
    setBusy(true); setMessage(null);
    try { const result = await integrationsApi.createTelegramForumLink(); setLink(result.link); setMessage('Código generado. Envíalo dentro del supergrupo antes de que venza.'); }
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
    try { const result = await integrationsApi.createTelegramForumTopic(selected, preview.client.id); setTopics(current => [result.topic, ...current]); setPreview(null); setClientId(''); setMessage('Tema creado y confirmado por Telegram.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear el tema.'); }
    finally { setBusy(false); }
  };
  const change = async (topic: TelegramForumTopic, action: 'close' | 'reopen') => {
    if (!selected) return; setBusy(true); setMessage(null);
    try { const result = await integrationsApi.changeTelegramForumTopic(selected, topic.id, action); setTopics(current => current.map(item => item.id === topic.id ? result.topic : item)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Telegram no confirmó la operación.'); }
    finally { setBusy(false); }
  };
  const recreate = async (topic: TelegramForumTopic) => {
    if (!selected || !window.confirm(`¿Recrear el tema “${topic.name}”? Verifica primero en Telegram que no exista para evitar duplicados.`)) return;
    setBusy(true); setMessage(null);
    try { const result = await integrationsApi.recreateTelegramForumTopic(selected, topic.id); setTopics(current => current.map(item => item.id === topic.id ? result.topic : item)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Telegram no confirmó la recreación.'); }
    finally { setBusy(false); }
  };
  const participantAction = async (participant: TelegramForumParticipant, action: 'invite' | 'remove' | 'reinstate') => {
    if (!selected) return;
    if (action === 'remove' && !window.confirm(`¿Retirar a ${participant.name || participant.email} del grupo completo?`)) return;
    if (action === 'reinstate' && !window.confirm(`¿Reintegrar a ${participant.name || participant.email} y generar una invitación nueva?`)) return;
    setBusy(true); setMessage(null);
    try {
      const result = action === 'invite' ? await integrationsApi.inviteTelegramForumParticipant(selected, participant.userId) : action === 'remove' ? await integrationsApi.removeTelegramForumParticipant(selected, participant.userId) : await integrationsApi.reinstateTelegramForumParticipant(selected, participant.userId);
      setParticipants(current => current.map(item => item.userId === participant.userId ? { ...item, ...result.participant } : item));
      setMessage(action === 'remove' ? 'Participante retirado del grupo.' : 'Invitación individual creada. Compártela sólo con la persona indicada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-800/60 dark:bg-violet-500/10">
    <div><p className="text-sm font-bold text-violet-950 dark:text-violet-100">Clientes en Telegram</p><p className="mt-1 text-xs leading-5 text-violet-800 dark:text-violet-200">Usa el mismo bot de este workspace que ya activa y desactiva sitios. No necesitas crear otro bot. Joinpoint sólo registra grupos, temas y participantes conocidos; no guarda conversaciones.</p></div>
    <div className="rounded-lg bg-white p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200"><p className="font-semibold">Cómo preparar el supergrupo privado</p><ol className="mt-2 list-decimal space-y-1.5 pl-5"><li>En Telegram crea un grupo nuevo y selecciona que sea privado.</li><li>Abre la configuración del grupo, entra a <b>Temas</b> y actívalos. Telegram lo convertirá en supergrupo con foro.</li><li>Agrega el bot que ya configuraste en Joinpoint como administrador.</li><li>Activa para el bot los permisos <b>Administrar temas</b>, <b>Invitar usuarios</b> y <b>Restringir miembros</b>.</li><li>Vuelve aquí, pulsa <b>Vincular otro grupo</b> y envía el comando generado dentro del grupo.</li></ol><p className="mt-2 text-slate-500">El moderador que envía el código queda registrado automáticamente como participante activo y puede usarse como piloto.</p></div>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void generateLink()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white disabled:opacity-50"><FolderPlus className="h-4 w-4" />Vincular otro grupo</button>{guide ? <a href="/api/workspace/integrations/mikrowisp/guide/download" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-violet-200 px-3 text-xs font-semibold text-violet-700 dark:border-violet-800 dark:text-violet-200"><ExternalLink className="h-4 w-4" />Ver guía PDF · {guide.version}</a> : null}<button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-violet-200 px-3 text-xs font-semibold text-violet-700 dark:border-violet-800 dark:text-violet-200"><RefreshCw className="h-4 w-4" />Actualizar</button></div>
    {link ? <div className="rounded-lg bg-white p-3 text-xs dark:bg-slate-900"><p className="font-semibold">Envía este comando dentro del supergrupo:</p><code className="mt-2 block select-all rounded bg-slate-100 p-2 text-sm dark:bg-slate-800">{link.command}</code><p className="mt-1 text-slate-500">Vence: {new Date(link.expiresAt).toLocaleTimeString('es-PE')}</p></div> : null}
    {groups.length ? <select aria-label="Grupo Telegram" value={selected || ''} onChange={event => setSelected(event.target.value)} className="min-h-11 w-full rounded-lg border border-violet-200 bg-white px-3 text-sm dark:border-violet-800 dark:bg-slate-900">{groups.map(group => <option key={group.id} value={group.id} disabled={group.status !== 'ACTIVE'}>{group.name || 'Pendiente de vincular'} · {group.status}</option>)}</select> : <p className="text-xs text-violet-700 dark:text-violet-300">Todavía no hay grupos vinculados.</p>}
    {selected ? <><div className="space-y-2 rounded-lg bg-white p-3 dark:bg-slate-900"><p className="text-sm font-semibold">Crear tema por cliente</p><p className="text-xs text-slate-500">Para registrar un tema ya existente, ejecuta dentro de ese tema <code>/registrartema ID_CLIENTE</code>.</p><div className="flex gap-2"><input aria-label="ID de cliente MikroWisp" value={clientId} onChange={event => { setClientId(event.target.value); setPreview(null); }} placeholder="ID del cliente" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /><button type="button" disabled={busy || !clientId} onClick={() => void validateClient()} className="rounded-lg border border-violet-200 px-3 text-xs font-semibold">Validar</button></div>{preview ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><p>Vista previa: <b>{preview.topicName}</b></p><button type="button" disabled={busy} onClick={() => void createTopic()} className="mt-2 rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white">Confirmar creación</button></div> : null}<div className="space-y-2">{topics.map(topic => <div key={topic.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{topic.name}</p><p className="text-slate-500">Thread {topic.threadId || 'sin confirmar'} · {topic.status}</p></div>{topic.status === 'ACTIVE' ? <button type="button" disabled={busy} onClick={() => void change(topic, 'close')} className="rounded-lg border px-3 py-2">Cerrar</button> : topic.status === 'CLOSED' ? <button type="button" disabled={busy} onClick={() => void change(topic, 'reopen')} className="rounded-lg border px-3 py-2">Reabrir</button> : ['REPAIR_REQUIRED', 'CREATE_UNKNOWN'].includes(topic.status) ? <button type="button" disabled={busy} onClick={() => void recreate(topic)} className="rounded-lg border border-amber-300 px-3 py-2 text-amber-700">Recrear con confirmación</button> : null}</div>)}</div></div><div className="space-y-2 rounded-lg bg-white p-3 dark:bg-slate-900"><div><p className="text-sm font-semibold">Participantes conocidos</p><p className="text-xs text-slate-500">Usuarios del workspace y eventos observados por el bot; no es el censo completo de Telegram.</p></div>{participants.map(participant => <div key={participant.userId} className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{participant.name || participant.email}</p><p className="text-slate-500">{participant.telegramLinked ? participant.status : 'Telegram no vinculado'}</p></div>{participant.telegramLinked && participant.status === 'NOT_INVITED' ? <button type="button" disabled={busy} onClick={() => void participantAction(participant, 'invite')} className="rounded-lg border px-3 py-2">Invitar</button> : participant.status === 'ACTIVE' ? <button type="button" disabled={busy} onClick={() => void participantAction(participant, 'remove')} className="rounded-lg border border-rose-300 px-3 py-2 text-rose-700">Retirar</button> : participant.status === 'REMOVED' ? <button type="button" disabled={busy} onClick={() => void participantAction(participant, 'reinstate')} className="rounded-lg border px-3 py-2">Reintegrar</button> : null}</div>{participant.inviteLink ? <div className="mt-2 rounded bg-slate-100 p-2 dark:bg-slate-800"><a className="break-all text-violet-700 underline dark:text-violet-300" href={participant.inviteLink} target="_blank" rel="noreferrer">Abrir invitación individual</a><p className="mt-1 text-slate-500">Vence {participant.inviteExpiresAt ? new Date(participant.inviteExpiresAt).toLocaleString('es-PE') : ''}</p></div> : null}</div>)}</div></> : null}
    {busy ? <p className="flex items-center text-xs"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Procesando…</p> : null}{message ? <p role="status" className="text-xs text-violet-800 dark:text-violet-200">{message}</p> : null}
  </div>;
}
