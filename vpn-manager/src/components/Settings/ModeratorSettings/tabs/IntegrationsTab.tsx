import { useCallback, useEffect, useState } from 'react';
import { Bot, BrainCircuit, CheckCircle2, ChevronDown, ExternalLink, KeyRound, Loader2, Mail, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { integrationsApi, platformIntegrationsApi, type IntegrationProvider, type WorkspaceIntegration } from '../../../../services/integrationsApi';

type FormValues = Record<string, string>;
interface Definition { provider: IntegrationProvider; name: string; description: string; icon: typeof Mail; fields: Array<{ key: string; label: string; type?: 'email' | 'password'; placeholder: string; help?: string; multiline?: boolean }>; defaults?: FormValues }

interface IntegrationGuideStep { title: string; description: string }
interface IntegrationGuide { title: string; portalLabel: string; portalUrl: string; steps: IntegrationGuideStep[]; note?: string }

const WORKSPACE_DEFINITIONS: Definition[] = [
  { provider: 'BREVO', name: 'Brevo', description: 'Relay recomendado para invitaciones, OTP y notificaciones.', icon: Mail, defaults: { fromName: 'Joinpoint NOC' }, fields: [
    { key: 'username', label: 'Usuario SMTP de Brevo', placeholder: 'cuenta@smtp-brevo.com' },
    { key: 'password', label: 'Clave SMTP', type: 'password', placeholder: 'Ingresa una clave nueva' },
    { key: 'fromEmail', label: 'Correo remitente verificado', type: 'email', placeholder: 'notificaciones@tu-dominio.com' },
    { key: 'fromName', label: 'Nombre del remitente', placeholder: 'Joinpoint NOC' },
  ] },
  { provider: 'GMAIL', name: 'Gmail', description: 'Alternativa de correo mediante una contraseña de aplicación.', icon: Mail, defaults: { fromName: 'Joinpoint NOC' }, fields: [
    { key: 'email', label: 'Cuenta de Gmail', type: 'email', placeholder: 'cuenta@gmail.com' },
    { key: 'appPassword', label: 'Contraseña de aplicación', type: 'password', placeholder: '16 caracteres', help: 'No uses la contraseña normal de Google.' },
    { key: 'fromName', label: 'Nombre del remitente', placeholder: 'Joinpoint NOC' },
  ] },
  { provider: 'TELEGRAM', name: 'Telegram Bot', description: 'Bot propio para los avisos del workspace.', icon: Bot, fields: [
    { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Token entregado por BotFather' },
  ] },
  { provider: 'GEMINI', name: 'Google Gemini', description: 'Análisis asistido de redes y equipos airOS.', icon: BrainCircuit, defaults: { model: 'gemini-3.1-flash-lite' }, fields: [
    { key: 'apiKey', label: 'Gemini API Key', type: 'password', placeholder: 'Ingresa una API key nueva' },
    { key: 'model', label: 'Modelo', placeholder: 'gemini-3.1-flash-lite' },
  ] },
];

const PLATFORM_DEFINITIONS: Definition[] = [
  { ...WORKSPACE_DEFINITIONS[0], description: 'Relay recomendado para altas de moderadores, OTP, recuperación y reportes.' },
  { ...WORKSPACE_DEFINITIONS[1], description: 'Alternativa de correo global mediante contraseña de aplicación.' },
  { provider: 'TELEGRAM', name: 'Telegram administrativo', description: 'Bot global para alertas y consultas seguras de moderadores.', icon: Bot, fields: [
    { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Token entregado por BotFather', help: 'Habilita /moderadores y /moderador correo para la cuenta administrativa vinculada.' },
  ] },
  { ...WORKSPACE_DEFINITIONS[3], description: 'Proveedor global de IA; sirve como respaldo cuando un workspace no configura su propia API key.' },
  { provider: 'FIREBASE', name: 'Google Login · Firebase', description: 'Acceso de usuarios mediante Google, validado por Firebase Admin.', icon: ShieldCheck, fields: [
    { key: 'projectId', label: 'Project ID', placeholder: 'mi-proyecto-firebase' },
    { key: 'apiKey', label: 'Web API Key', type: 'password', placeholder: 'API key del SDK web' },
    { key: 'authDomain', label: 'Auth Domain', placeholder: 'mi-proyecto.firebaseapp.com' },
    { key: 'appId', label: 'App ID', placeholder: '1:123456:web:abcdef' },
    { key: 'tenantId', label: 'Tenant ID (opcional)', placeholder: 'Déjalo vacío si no usas multi-tenancy' },
    { key: 'serviceAccountJson', label: 'Service Account JSON', type: 'password', multiline: true, placeholder: '{ "type": "service_account", ... }', help: 'Se cifra completo. Debe pertenecer al mismo Project ID.' },
  ] },
];

function formatDate(value: number | null) { return value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin validar'; }

export default function IntegrationsTab({ scope = 'workspace' }: { scope?: 'workspace' | 'platform' }) {
  const definitions = scope === 'platform' ? PLATFORM_DEFINITIONS : WORKSPACE_DEFINITIONS;
  const api = scope === 'platform' ? platformIntegrationsApi : integrationsApi;
  const [items, setItems] = useState<WorkspaceIntegration[]>([]);
  const [forms, setForms] = useState<Record<string, FormValues>>(() => Object.fromEntries(definitions.map(d => [d.provider, d.defaults || {}])));
  const [editing, setEditing] = useState<IntegrationProvider | null>(null);
  const [expanded, setExpanded] = useState<IntegrationProvider | null>(null);
  const [busy, setBusy] = useState<IntegrationProvider | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<IntegrationProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    try { setItems((await api.list()).integrations); }
    catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudieron cargar las integraciones.' }); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const update = (provider: IntegrationProvider, key: string, value: string) => setForms(current => ({ ...current, [provider]: { ...current[provider], [key]: value } }));
  const save = async (definition: Definition) => {
    setBusy(definition.provider); setMessage(null);
    try {
      const result = await api.save(definition.provider, forms[definition.provider] || {});
      setItems(current => current.map(item => item.provider === definition.provider ? result.integration : item.provider !== definition.provider && ['BREVO', 'GMAIL'].includes(item.provider) && ['BREVO', 'GMAIL'].includes(definition.provider) ? { ...item, active: false } : item));
      setForms(current => ({ ...current, [definition.provider]: definition.defaults || {} }));
      setEditing(null); setExpanded(null); setMessage({ type: 'ok', text: `${definition.name} fue validado y activado. La credencial ya no puede visualizarse.` });
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo validar la integración.' }); }
    finally { setBusy(null); }
  };
  const test = async (provider: IntegrationProvider) => {
    setBusy(provider); setMessage(null);
    try { const result = await api.test(provider); setItems(current => current.map(item => item.provider === provider ? result.integration : item)); setMessage({ type: 'ok', text: 'La integración respondió correctamente.' }); }
    catch (error) { setItems(current => current.map(item => item.provider === provider ? { ...item, active: false, status: 'INVALID' } : item)); setMessage({ type: 'error', text: error instanceof Error ? error.message : 'La integración no respondió.' }); }
    finally { setBusy(null); }
  };
  const remove = async (provider: IntegrationProvider) => {
    setBusy(provider); setMessage(null);
    try { await api.remove(provider); setItems(current => current.map(item => item.provider === provider ? { ...item, configured: false, active: false, status: 'NOT_CONFIGURED', label: null, metadata: {}, lastValidatedAt: null, updatedAt: null } : item)); setConfirmDelete(null); setEditing(null); setExpanded(null); setMessage({ type: 'ok', text: 'Integración desconectada y credencial eliminada.' }); }
    catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo desconectar.' }); }
    finally { setBusy(null); }
  };

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><KeyRound className="h-5 w-5" /></div><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Integraciones</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{scope === 'platform' ? 'Conecta los servicios globales usados por el Administrador y los accesos de la plataforma.' : 'Conecta servicios propios del workspace.'} Validamos cada credencial antes de cifrarla y nunca volvemos a mostrarla.</p></div></div>
      <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-500/10 dark:text-amber-200"><ShieldCheck className="h-4 w-4 shrink-0" /><span>Brevo y Gmail son alternativas: al activar uno, el otro queda inactivo. Reemplazar una credencial exige ingresar el valor completo nuevamente.</span></div>
    </section>
    {message ? <div role="status" className={`rounded-xl border p-3 text-sm ${message.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/50 dark:bg-rose-500/10 dark:text-rose-200'}`}>{message.text}</div> : null}
    {loading ? <div className="flex min-h-40 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Cargando integraciones…</div> : <div className="space-y-3">{definitions.map(definition => {
      const item = items.find(candidate => candidate.provider === definition.provider);
      const configured = Boolean(item?.configured); const open = expanded === definition.provider; const Icon = definition.icon; const isBusy = busy === definition.provider;
      const badge = !configured ? { text: 'Sin configurar', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' } : item?.active ? { text: 'Activa', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' } : { text: 'Requiere atención', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' };
      const panelId = `integration-${definition.provider.toLowerCase()}`;
      return <section key={definition.provider} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition dark:bg-slate-900 ${open ? 'border-indigo-200 ring-1 ring-indigo-100 dark:border-indigo-700 dark:ring-indigo-900' : 'border-slate-200 dark:border-slate-700'}`}>
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => { setExpanded(current => current === definition.provider ? null : definition.provider); setEditing(null); setConfirmDelete(null); }} className="flex min-h-[88px] w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-slate-800/60 sm:p-5">
          <span className="flex min-w-0 items-start gap-3"><span className="rounded-xl bg-slate-100 p-2.5 text-indigo-600 dark:bg-slate-800 dark:text-indigo-300"><Icon className="h-5 w-5" /></span><span className="min-w-0"><span className="block font-bold text-slate-900 dark:text-white">{definition.name}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{definition.description}</span>{configured && item?.label ? <span className="mt-1 block truncate text-xs font-medium text-slate-600 dark:text-slate-300">{item.label}</span> : null}</span></span>
          <span className="flex shrink-0 items-center gap-2"><span className={`hidden items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${badge.cls}`}>{item?.active ? <CheckCircle2 className="h-3.5 w-3.5" /> : configured ? <TriangleAlert className="h-3.5 w-3.5" /> : null}{badge.text}</span><ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} /></span>
        </button>
        {open ? <div id={panelId} className="border-t border-slate-100 p-4 dark:border-slate-800 sm:p-5"><div className={`mb-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold sm:hidden ${badge.cls}`}>{badge.text}</div>{configured && editing !== definition.provider ? <div className="space-y-3"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item?.label}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Última validación: {formatDate(item?.lastValidatedAt || null)}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Credencial cifrada · el valor permanece oculto</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={isBusy} onClick={() => void test(definition.provider)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} />Probar conexión</button><button type="button" onClick={() => { setEditing(definition.provider); setConfirmDelete(null); }} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Reemplazar credencial</button><button type="button" onClick={() => setConfirmDelete(definition.provider)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" />Desconectar</button></div>{confirmDelete === definition.provider ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800/50 dark:bg-rose-500/10 dark:text-rose-200"><p className="font-semibold">¿Eliminar definitivamente esta credencial?</p><div className="mt-3 flex gap-2"><button type="button" disabled={isBusy} onClick={() => void remove(definition.provider)} className="min-h-11 rounded-xl bg-rose-600 px-3 font-semibold text-white disabled:opacity-50">Sí, desconectar</button><button type="button" onClick={() => setConfirmDelete(null)} className="min-h-11 rounded-xl border border-rose-200 px-3 font-semibold">Cancelar</button></div></div> : null}</div> : <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save(definition); }}><IntegrationSetupGuide guide={getIntegrationGuide(definition.provider, scope)} />{configured ? <p className="rounded-lg bg-indigo-50 p-2.5 text-xs text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">Por seguridad, la credencial anterior no se recupera. Completa todos los campos para reemplazarla.</p> : null}{definition.fields.map(field => <label key={field.key} className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">{field.label}</span>{field.multiline ? <textarea required autoComplete="off" rows={6} value={forms[definition.provider]?.[field.key] || ''} onChange={event => update(definition.provider, field.key, event.target.value)} placeholder={field.placeholder} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /> : <input required={field.key !== 'tenantId'} type={field.type || 'text'} autoComplete="off" value={forms[definition.provider]?.[field.key] || ''} onChange={event => update(definition.provider, field.key, event.target.value)} placeholder={field.placeholder} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />}{field.help ? <span className="mt-1 block text-xs text-slate-500">{field.help}</span> : null}</label>)}<div className="flex flex-wrap gap-2 pt-1"><button type="submit" disabled={isBusy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{configured ? 'Validar y reemplazar' : 'Validar y activar'}</button>{configured ? <button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancelar</button> : null}</div></form>}</div> : null}
      </section>;
    })}</div>}
  </div>;
}

function getIntegrationGuide(provider: IntegrationProvider, scope: 'workspace' | 'platform'): IntegrationGuide {
  const platform = scope === 'platform';
  const guides: Record<IntegrationProvider, IntegrationGuide> = {
    BREVO: { title: 'Conectar Brevo en 3 pasos', portalLabel: 'Abrir Brevo', portalUrl: 'https://app.brevo.com/settings/keys/smtp', steps: [
      { title: 'Verifica el remitente', description: 'En Brevo, valida la dirección desde la que saldrán los correos.' },
      { title: 'Genera una clave SMTP', description: 'Abre SMTP & API y crea una clave nueva; no uses una API key.' },
      { title: 'Completa y valida', description: `Copia usuario, clave, remitente y nombre para ${platform ? 'los correos administrativos' : 'los avisos del workspace'}.` },
    ], note: 'Guarda la clave al crearla: Brevo puede no volver a mostrarla completa.' },
    GMAIL: { title: 'Conectar Gmail en 3 pasos', portalLabel: 'Abrir Google', portalUrl: 'https://myaccount.google.com/apppasswords', steps: [
      { title: 'Activa la verificación en dos pasos', description: 'Google sólo permite contraseñas de aplicación en cuentas compatibles con 2FA.' },
      { title: 'Crea una contraseña de aplicación', description: 'Genera una para esta plataforma y copia sus 16 caracteres.' },
      { title: 'Completa y valida', description: 'Ingresa la cuenta, la contraseña de aplicación y el nombre del remitente.' },
    ], note: 'Nunca ingreses aquí la contraseña normal de tu cuenta de Google.' },
    TELEGRAM: { title: 'Conectar Telegram en 3 pasos', portalLabel: 'Abrir BotFather', portalUrl: 'https://t.me/BotFather', steps: [
      { title: 'Crea un bot exclusivo', description: 'En BotFather usa /newbot, define nombre y username.' },
      { title: 'Copia el Bot Token', description: 'Copia el token completo que entrega BotFather.' },
      { title: 'Valida y continúa', description: platform ? 'Actívalo para consultas administrativas seguras.' : 'Actívalo aquí y después vincula tu cuenta desde Notificaciones.' },
    ], note: 'No reutilices el bot del Administrador ni el de otro workspace.' },
    GEMINI: { title: 'Conectar Gemini en 3 pasos', portalLabel: 'Abrir AI Studio', portalUrl: 'https://aistudio.google.com/apikey', steps: [
      { title: 'Selecciona un proyecto', description: 'En Google AI Studio elige el proyecto que administrará el consumo.' },
      { title: 'Crea una API key', description: 'Genera una clave nueva y copia su valor completo.' },
      { title: 'Define el modelo y valida', description: `Ingresa la clave y conserva el modelo recomendado${platform ? ' como respaldo global' : ' para el análisis del workspace'}.` },
    ], note: 'Controla cuotas y facturación desde el proyecto de Google asociado.' },
    FIREBASE: { title: 'Conectar Google Login en 4 pasos', portalLabel: 'Abrir Firebase', portalUrl: 'https://console.firebase.google.com/', steps: [
      { title: 'Habilita Google', description: 'En Authentication > Sign-in method, activa Google como proveedor.' },
      { title: 'Registra la aplicación web', description: 'Copia Project ID, Web API Key, Auth Domain y App ID.' },
      { title: 'Crea la cuenta de servicio', description: 'En Configuración > Cuentas de servicio, genera una clave privada JSON.' },
      { title: 'Autoriza el dominio y valida', description: 'Añade el dominio de la plataforma en Authentication y completa todos los campos.' },
    ], note: 'El JSON se cifra completo y debe pertenecer al mismo Project ID.' },
  };
  return guides[provider];
}

function IntegrationSetupGuide({ guide }: { guide: IntegrationGuide }) {
  return <div className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-100">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">{guide.title}</p><p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">Sigue el orden y luego completa el formulario.</p></div><a href={guide.portalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-200"><ExternalLink className="h-4 w-4" />{guide.portalLabel}</a></div>
    <ol className="space-y-3">{guide.steps.map((step, index) => <li key={step.title} className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{index + 1}</span><div><p className="text-sm font-semibold">{step.title}</p><p className="mt-0.5 text-xs leading-5 text-indigo-700/90 dark:text-indigo-300/90">{step.description}</p></div></li>)}</ol>
    {guide.note ? <p className="rounded-lg bg-white/70 px-3 py-2 text-xs text-indigo-700 dark:bg-slate-900/60 dark:text-indigo-300"><ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />{guide.note}</p> : null}
  </div>;
}
