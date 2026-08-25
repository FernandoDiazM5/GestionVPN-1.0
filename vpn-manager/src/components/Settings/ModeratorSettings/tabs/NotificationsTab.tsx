// ============================================================
//  NotificationsTab — preferencias de notificaciones del usuario (Q1)
//
//  Permite al usuario elegir qué eventos disparan notificación y por
//  qué canal. Telegram requiere flujo de vinculación de 2 pasos con
//  código de 6 chars (anti-spoofing).
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { Bell, Bot, Mail, Send, Loader2, AlertCircle, Check, Pause, Play, Copy, X, Smartphone, ExternalLink } from 'lucide-react';
import { accountApi } from '../../../../services/accountApi';
import type { NotificationEvent, NotificationStatus } from '@gestionvpn/contracts';
import AsyncQueryState from '../../../Common/AsyncQueryState';

const EVENT_LABEL: Record<NotificationEvent, string> = {
  TUNNEL_ACTIVATED: 'Acceso a sitio activado',
  TUNNEL_DEACTIVATED: 'Acceso a sitio desactivado',
  SESSION_EXPIRED: 'Sesión expirada',
  NODE_DOWN: 'Nodo caído',
  NODE_RECOVERED: 'Nodo recuperado',
};

const EVENT_DESC: Record<NotificationEvent, string> = {
  TUNNEL_ACTIVATED: 'Cuando alguien (tú u otro) abre el acceso a un sitio.',
  TUNNEL_DEACTIVATED: 'Cuando se cierra el acceso a un sitio.',
  SESSION_EXPIRED: 'Cuando el TTL de tu sesión vence y se cierra sola.',
  NODE_DOWN: 'El monitoreo proactivo detectó un nodo sin responder (3 polls consecutivos).',
  NODE_RECOVERED: 'Un nodo previamente caído volvió a responder.',
};

const ALL_EVENTS: NotificationEvent[] = [
  'TUNNEL_ACTIVATED', 'TUNNEL_DEACTIVATED', 'SESSION_EXPIRED',
  'NODE_DOWN', 'NODE_RECOVERED',
];

interface NotificationsTabProps {
  /** Modo MEMBER: solo muestra vincular/desvincular Telegram (sin email, eventos, pausa ni guardar). */
  memberMode?: boolean;
  onOpenIntegrations?: (provider: 'email' | 'telegram') => void;
}

export default function NotificationsTab({ memberMode = false, onOpenIntegrations }: NotificationsTabProps = {}) {
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<{ code: string; expiresAt: number; botUsername?: string | null } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      setStatus(await accountApi.getNotifications());
    } catch (reason) {
      setErr(reason instanceof Error ? reason.message : 'Error cargando preferencias');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!linkCode) return;
    const refresh = async () => {
      if (Date.now() >= linkCode.expiresAt) {
        setLinkCode(null);
        setErr('El código de Telegram expiró. Genera uno nuevo.');
        return;
      }
      try {
        const fresh = await accountApi.getNotifications();
        if (fresh.telegramLinked) { setStatus(fresh); setLinkCode(null); setOk(true); }
      } catch { /* el siguiente ciclo reintenta sin interrumpir al usuario */ }
    };
    const timer = window.setInterval(() => { void refresh(); }, 3000);
    return () => window.clearInterval(timer);
  }, [linkCode]);

  if (!status) {
    return (
      <AsyncQueryState
        loading={busy}
        error={err || (!busy ? 'No se pudieron cargar las preferencias.' : null)}
        onRetry={() => { void load(); }}
        loadingLabel="Cargando preferencias..."
        skeletonRows={3}
      >
        <div />
      </AsyncQueryState>
    );
  }

  function update<K extends keyof NotificationStatus>(key: K, value: NotificationStatus[K]) {
    setStatus(s => s ? { ...s, [key]: value } : s);
  }

  function toggleEvent(ev: NotificationEvent) {
    if (!status) return;
    const next = status.eventTypes.includes(ev)
      ? status.eventTypes.filter(e => e !== ev)
      : [...status.eventTypes, ev];
    update('eventTypes', next);
  }

  async function save() {
    if (!status) return;
    setSaving(true); setOk(false); setErr(null);
    try {
      await accountApi.updateNotifications({
        channels: status.channels,
        eventTypes: status.eventTypes,
        paused: status.paused,
      });
      setOk(true);
      setTimeout(() => setOk(false), 2200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  }

  async function startLink() {
    setErr(null);
    try {
      const r = await accountApi.startTelegramLink();
      setLinkCode({ code: r.code, expiresAt: r.expiresAt, botUsername: r.botUsername });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo iniciar la vinculación');
    }
  }

  async function unlink() {
    setErr(null);
    try {
      await accountApi.unlinkTelegram();
      const fresh = await accountApi.getNotifications();
      setStatus(fresh);
      setLinkCode(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo desvincular');
    }
  }

  // Para MEMBER: solo mostramos la fila de Telegram y el flujo de vincular.
  // El bot Telegram es el camino canónico del MEMBER para activar/desactivar
  // sus túneles asignados (ver §32 del HANDOFF).
  const telegramRow = <TelegramChannelCard status={status} linkPending={Boolean(linkCode)} memberMode={memberMode} onOpenIntegrations={onOpenIntegrations} onStartLink={() => void startLink()} onUnlink={() => void unlink()} onChange={(v) => update('channels', { ...status.channels, telegram: v })} />;

  const emailAvailable = status.channelAvailability.email.available;
  const telegramAvailable = status.channelAvailability.telegram.available;
  const hasEnabledChannel = status.channels.email || status.channels.telegram;
  const canResume = (status.channels.email && emailAvailable) || (status.channels.telegram && telegramAvailable && status.telegramLinked);

  // Render compacto para MEMBER — únicamente Telegram + el código de vinculación.
  if (memberMode) {
    return (
      <div className="space-y-5">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center">
            <Bell className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{status.telegramLinked ? 'Telegram vinculado' : 'Telegram no disponible'}</p>
            <p className="text-xs text-slate-500">{status.telegramLinked ? 'Puedes usar el bot y activar el canal.' : status.channelAvailability.telegram.reason || 'Completa la vinculación para usar el bot.'}</p>
          </div>
        </div>

        <div className="card space-y-4 p-4 sm:p-5">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-500" /> Canales
          </h3>
          <p className="text-xs text-slate-500">
            Vincula tu Telegram para abrir y cerrar el acceso a tus sitios desde el bot.
          </p>
          {telegramRow}

          {linkCode && (
            <TelegramLinkSteps code={linkCode.code} expiresAt={linkCode.expiresAt} botUsername={linkCode.botUsername || status.telegramBotUsername} />
          )}

          {err && <p className="text-sm text-rose-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Pausa global */}
      <div className="card flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${status.paused ? 'bg-amber-50 dark:bg-amber-500/15' : 'bg-emerald-50 dark:bg-emerald-500/15'}`}>
            {status.paused ? <Pause className="w-5 h-5 text-amber-600" /> : <Bell className="w-5 h-5 text-emerald-600" />}
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              {status.paused ? 'Notificaciones en pausa' : hasEnabledChannel ? 'Notificaciones activas' : 'Sin canales activos'}
            </p>
            <p className="text-xs text-slate-500">
              {status.paused ? 'No recibes nada mientras esté pausado.' : hasEnabledChannel ? 'Recibes según los canales y eventos elegidos.' : 'Configura y activa al menos un canal para recibir avisos.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => update('paused', !status.paused)}
          disabled={!canResume}
          className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 px-4 py-2 text-sm ${status.paused ? 'btn-success' : 'btn-outline'}`}
        >
          {!canResume ? <><Play className="w-3.5 h-3.5" /> Sin canales</> : status.paused ? <><Play className="w-3.5 h-3.5" /> Reanudar</> : <><Pause className="w-3.5 h-3.5" /> Pausar</>}
        </button>
      </div>

      {/* Canales */}
      <div className="card space-y-4 p-4 sm:p-5">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Send className="w-4 h-4 text-indigo-500" /> Canales
        </h3>
        <ChannelRow
          icon={Mail}
          title="Email"
          desc={emailAvailable ? `Disponible mediante ${status.channelAvailability.email.provider}.` : status.channelAvailability.email.reason || 'Canal no disponible.'}
          checked={status.channels.email}
          disabled={!emailAvailable}
          onChange={(v) => update('channels', { ...status.channels, email: v })}
          extra={!emailAvailable && !memberMode && onOpenIntegrations ? <button type="button" onClick={() => onOpenIntegrations('email')} className="btn-primary inline-flex min-h-11 items-center gap-1.5 px-4 text-xs"><Mail className="h-4 w-4" />Vincular email</button> : !emailAvailable && memberMode ? <span className="text-xs font-medium text-slate-500">Solicita al moderador configurar el correo</span> : null}
        />
        {telegramRow}
        {status.telegramBotConfigured ? <TelegramCommands linked={status.telegramLinked} /> : null}

        {linkCode && (
          <TelegramLinkSteps code={linkCode.code} expiresAt={linkCode.expiresAt} botUsername={linkCode.botUsername || status.telegramBotUsername} />
        )}
      </div>

      {/* Eventos */}
      <div className="card space-y-2 p-4 sm:p-5">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-500" /> Eventos
        </h3>
        <p className="text-xs text-slate-500 mb-3">Elige por cuáles quieres ser notificado.</p>
        {ALL_EVENTS.map(ev => (
          <label key={ev} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={status.eventTypes.includes(ev)}
              onChange={() => toggleEvent(ev)}
            />
            <div className="flex-1">
              <p className="font-medium text-sm text-slate-800 dark:text-slate-100">{EVENT_LABEL[ev]}</p>
              <p className="text-xs text-slate-500">{EVENT_DESC[ev]}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Guardar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {err && <p className="text-sm text-rose-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {err}</p>}
        {ok && <p className="text-sm text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Guardado</p>}
        <button onClick={save} disabled={saving || (!status.paused && !hasEnabledChannel)} className="btn-primary btn-md inline-flex min-h-11 items-center justify-center">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Guardar
        </button>
      </div>
    </div>
  );
}

interface ChannelRowProps {
  icon: typeof Mail;
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  extra?: React.ReactNode;
}

function ChannelRow({ icon: Icon, title, desc, checked, disabled, onChange, extra }: ChannelRowProps) {
  return (
    <div className="flex flex-col items-stretch gap-3 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 text-slate-500 mt-0.5" />
        <div>
          <p className="font-medium text-sm text-slate-800 dark:text-slate-100">{title}</p>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
      </div>
      <div className="flex min-h-11 items-center justify-end gap-2">
        {extra}
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
    </div>
  );
}

interface TelegramChannelCardProps {
  status: NotificationStatus;
  linkPending: boolean;
  memberMode: boolean;
  onOpenIntegrations?: (provider: 'email' | 'telegram') => void;
  onStartLink: () => void;
  onUnlink: () => void;
  onChange: (value: boolean) => void;
}

function TelegramChannelCard({ status, linkPending, memberMode, onOpenIntegrations, onStartLink, onUnlink, onChange }: TelegramChannelCardProps) {
  const configured = status.telegramBotConfigured;
  const linked = status.telegramLinked;
  const active = linked && status.channels.telegram;
  const state = !configured
    ? { label: 'Bot sin configurar', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', description: status.channelAvailability.telegram.reason || 'Configura un bot para habilitar este canal.' }
    : linkPending
      ? { label: 'Esperando confirmación', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', description: 'Abre el bot y envía el código que aparece abajo.' }
      : !linked
        ? { label: 'Falta vincular', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', description: `El bot ${status.telegramBotUsername ? `@${status.telegramBotUsername}` : 'del workspace'} está listo; vincula tu cuenta.` }
        : active
          ? { label: 'Canal activo', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', description: `Recibirás avisos mediante ${status.telegramBotUsername ? `@${status.telegramBotUsername}` : 'Telegram'}.` }
          : { label: 'Vinculado', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300', description: 'La cuenta está vinculada. Activa la casilla para recibir avisos.' };

  return <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3"><span className="rounded-xl bg-white p-2.5 text-sky-500 shadow-sm dark:bg-slate-900"><Send className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800 dark:text-slate-100">Telegram</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${state.cls}`}>{state.label}</span></div><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{state.description}</p></div></div>
      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-end gap-2">
        {!configured && !memberMode && onOpenIntegrations ? <button type="button" onClick={() => onOpenIntegrations('telegram')} className="btn-primary inline-flex min-h-11 items-center gap-1.5 px-4 text-xs"><Bot className="h-4 w-4" />Configurar bot</button> : null}
        {!configured && memberMode ? <span className="text-xs font-medium text-slate-500">Solicita al moderador configurar el bot</span> : null}
        {configured && !linked ? <button type="button" onClick={onStartLink} disabled={linkPending} className="btn-primary inline-flex min-h-11 items-center gap-1.5 px-4 text-xs disabled:opacity-50"><Send className="h-4 w-4" />{linkPending ? 'Código generado' : 'Vincular cuenta'}</button> : null}
        {linked ? <button type="button" onClick={onUnlink} className="btn-outline btn-sm inline-flex min-h-11 items-center text-rose-600 border-rose-200"><X className="h-4 w-4" />Desvincular</button> : null}
        <label className={`inline-flex min-h-11 items-center gap-2 text-xs font-semibold ${linked ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}><span className="sr-only">Activar notificaciones por Telegram</span><input type="checkbox" aria-label="Activar notificaciones por Telegram" checked={status.channels.telegram} disabled={!configured || !linked} onChange={(event) => onChange(event.target.checked)} /></label>
      </div>
    </div>
  </div>;
}

const LINKED_TELEGRAM_COMMANDS = [
  ['/estado', 'Ver el sitio al que tienes acceso.'],
  ['/sitios', 'Listar los sitios disponibles para tu cuenta.'],
  ['/activar', 'Elegir y abrir el acceso a un sitio.'],
  ['/desactivar', 'Cerrar tu acceso actual.'],
  ['/cancelar', 'Cancelar una selección pendiente.'],
  ['/help', 'Volver a mostrar todos los comandos.'],
  ['/unlink', 'Desvincular este chat.'],
];

function TelegramCommands({ linked }: { linked: boolean }) {
  const commands = linked ? LINKED_TELEGRAM_COMMANDS : [['/start', 'Ver la bienvenida y cómo vincularte.'], ['/link CÓDIGO', 'Confirmar el código generado por el panel.'], ['/help', 'Mostrar la ayuda disponible.']];
  return <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-800/60 dark:bg-sky-500/10"><div className="flex items-start gap-3"><span className="rounded-lg bg-white p-2 text-sky-600 shadow-sm dark:bg-slate-900 dark:text-sky-300"><Bot className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Comandos disponibles en Telegram</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{linked ? 'El bot también te enviará este resumen al confirmar la vinculación.' : 'Primero vincula el chat; después se habilitarán los comandos operativos.'}</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{commands.map(([command, description]) => <div key={command} className="rounded-lg border border-sky-100 bg-white px-3 py-2 dark:border-sky-900 dark:bg-slate-900"><code className="text-xs font-bold text-sky-700 dark:text-sky-300">{command}</code><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p></div>)}</div></div>;
}

// URL oficial de la app de Telegram en Google Play.
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=org.telegram.messenger';

interface TelegramLinkStepsProps {
  code: string;
  expiresAt: number;
  botUsername?: string | null;
}

/**
 * Secuencia guiada de 3 pasos para vincular Telegram: instalar la app →
 * abrir el bot (enlace t.me directo si conocemos su @username) → enviar el
 * código. Reemplaza al bloque "envía /link CODE" que asumía que el usuario
 * ya tenía Telegram y sabía cuál era el bot.
 */
function TelegramLinkSteps({ code, expiresAt, botUsername }: TelegramLinkStepsProps) {
  const [copied, setCopied] = useState(false);
  const command = `/link ${code}`;
  const botUrl = botUsername ? `https://t.me/${botUsername}` : null;

  function copy() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-500/10 p-4 space-y-3.5">
      <div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Vinculación pendiente</p><span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><Loader2 className="h-3 w-3 animate-spin" />Esperando al bot</span></div><p className="mt-1 text-xs text-indigo-700/80 dark:text-indigo-300/80">El canal seguirá deshabilitado hasta que Telegram confirme el código.</p></div>

      <Step n={1} title="Instala Telegram" desc="En tu teléfono, si aún no la tienes."
        action={
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer"
            className="btn-outline inline-flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0">
            <Smartphone className="w-3.5 h-3.5" /> Play Store <ExternalLink className="w-3 h-3" />
          </a>
        }
      />

      <Step n={2} title="Copia tu código" desc="Lo pegarás en el bot en el paso 3.">
        <div className="flex items-center gap-2">
          <code className="font-mono px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-sm border border-indigo-100 dark:border-indigo-900/60 select-all">{command}</code>
          <button onClick={copy} title="Copiar código"
            className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs shrink-0">
            {copied ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
          </button>
        </div>
        <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80">Expira: {new Date(expiresAt).toLocaleString()}</p>
      </Step>

      <Step n={3} title="Abre el bot y pégalo" desc={botUsername ? `@${botUsername}` : 'Busca el bot del panel en Telegram.'}
        action={botUrl ? (
          <a href={botUrl} target="_blank" rel="noopener noreferrer"
            className="btn-outline inline-flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0">
            <Send className="w-3.5 h-3.5" /> Abrir bot <ExternalLink className="w-3 h-3" />
          </a>
        ) : undefined}
      />
    </div>
  );
}

interface StepProps {
  n: number;
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

/** Fila de paso numerado: círculo con el número + título/descripción + acción a la derecha y contenido debajo. */
function Step({ n, title, desc, action, children }: StepProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{title}</p>
            {desc && <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 truncate">{desc}</p>}
          </div>
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}
