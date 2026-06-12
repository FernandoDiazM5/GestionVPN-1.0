// ============================================================
//  NotificationsTab — preferencias de notificaciones del usuario (Q1)
//
//  Permite al usuario elegir qué eventos disparan notificación y por
//  qué canal. Telegram requiere flujo de vinculación de 2 pasos con
//  código de 6 chars (anti-spoofing).
// ============================================================
import { useEffect, useState } from 'react';
import { Bell, Mail, Send, Loader2, AlertCircle, Check, Pause, Play, Copy, X } from 'lucide-react';
import { accountApi } from '../../../../services/accountApi';
import type { NotificationEvent, NotificationStatus } from '@gestionvpn/contracts';

const EVENT_LABEL: Record<NotificationEvent, string> = {
  TUNNEL_ACTIVATED: 'Túnel activado',
  TUNNEL_DEACTIVATED: 'Túnel desactivado',
  SESSION_EXPIRED: 'Sesión expirada',
  NODE_DOWN: 'Nodo caído',
  NODE_RECOVERED: 'Nodo recuperado',
};

const EVENT_DESC: Record<NotificationEvent, string> = {
  TUNNEL_ACTIVATED: 'Cuando alguien (tú u otro) activa un túnel.',
  TUNNEL_DEACTIVATED: 'Cuando un túnel queda en estado revocado.',
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
}

export default function NotificationsTab({ memberMode = false }: NotificationsTabProps = {}) {
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<{ code: string; expiresAt: number } | null>(null);

  useEffect(() => {
    setBusy(true);
    accountApi.getNotifications()
      .then(s => setStatus(s))
      .catch(e => setErr(e instanceof Error ? e.message : 'Error cargando preferencias'))
      .finally(() => setBusy(false));
  }, []);

  if (busy) {
    return <div className="card p-6 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>;
  }
  if (!status) {
    return <div className="card p-6 text-rose-600">{err || 'No se pudo cargar.'}</div>;
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
      setLinkCode({ code: r.code, expiresAt: r.expiresAt });
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
  const telegramRow = (
    <ChannelRow
      icon={Send}
      title="Telegram"
      desc={status.telegramLinked ? 'Vinculado ✓' : status.telegramBotConfigured ? 'No vinculado' : 'Bot no disponible en este servidor'}
      checked={status.channels.telegram}
      disabled={!status.telegramBotConfigured || !status.telegramLinked}
      onChange={(v) => update('channels', { ...status.channels, telegram: v })}
      extra={
        status.telegramBotConfigured && !status.telegramLinked ? (
          <button onClick={startLink} className="btn-outline text-xs">Vincular</button>
        ) : status.telegramLinked ? (
          <button onClick={unlink} className="btn-outline text-xs text-rose-600 border-rose-200"><X className="w-3.5 h-3.5" /> Desvincular</button>
        ) : null
      }
    />
  );

  // Render compacto para MEMBER — únicamente Telegram + el código de vinculación.
  if (memberMode) {
    return (
      <div className="space-y-5">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center">
            <Bell className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Notificaciones activas</p>
            <p className="text-xs text-slate-500">Recibes según los canales y eventos elegidos.</p>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-500" /> Canales
          </h3>
          <p className="text-xs text-slate-500">
            Vincula tu Telegram para activar y desactivar tus túneles desde el bot.
          </p>
          {telegramRow}

          {linkCode && (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-500/10 p-4 space-y-2">
              <p className="text-sm text-indigo-800 dark:text-indigo-200">
                Abre el bot de Telegram y envíale el comando:
              </p>
              <div className="flex items-center gap-2">
                <code className="font-mono px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-sm">/link {linkCode.code}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(`/link ${linkCode.code}`)}
                  className="btn-outline text-xs"
                  title="Copiar"
                ><Copy className="w-3.5 h-3.5" /></button>
              </div>
              <p className="text-xs text-indigo-700 dark:text-indigo-300">
                Expira: {new Date(linkCode.expiresAt).toLocaleString()}
              </p>
            </div>
          )}

          {err && <p className="text-sm text-rose-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Pausa global */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${status.paused ? 'bg-amber-50 dark:bg-amber-500/15' : 'bg-emerald-50 dark:bg-emerald-500/15'}`}>
            {status.paused ? <Pause className="w-5 h-5 text-amber-600" /> : <Bell className="w-5 h-5 text-emerald-600" />}
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              {status.paused ? 'Notificaciones en pausa' : 'Notificaciones activas'}
            </p>
            <p className="text-xs text-slate-500">
              {status.paused ? 'No recibes nada mientras esté pausado.' : 'Recibes según los canales y eventos elegidos.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => update('paused', !status.paused)}
          className={status.paused ? 'btn-success' : 'btn-outline'}
        >
          {status.paused ? <><Play className="w-3.5 h-3.5" /> Reanudar</> : <><Pause className="w-3.5 h-3.5" /> Pausar</>}
        </button>
      </div>

      {/* Canales */}
      <div className="card p-5 space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Send className="w-4 h-4 text-indigo-500" /> Canales
        </h3>
        <ChannelRow
          icon={Mail}
          title="Email"
          desc="Te avisamos al correo de tu cuenta."
          checked={status.channels.email}
          onChange={(v) => update('channels', { ...status.channels, email: v })}
        />
        {telegramRow}

        {linkCode && (
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-500/10 p-4 space-y-2">
            <p className="text-sm text-indigo-800 dark:text-indigo-200">
              Abre el bot de Telegram y envíale el comando:
            </p>
            <div className="flex items-center gap-2">
              <code className="font-mono px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-sm">/link {linkCode.code}</code>
              <button
                onClick={() => navigator.clipboard.writeText(`/link ${linkCode.code}`)}
                className="btn-outline text-xs"
                title="Copiar"
              ><Copy className="w-3.5 h-3.5" /></button>
            </div>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              Expira: {new Date(linkCode.expiresAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Eventos */}
      <div className="card p-5 space-y-2">
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
      <div className="flex items-center justify-end gap-3">
        {err && <p className="text-sm text-rose-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {err}</p>}
        {ok && <p className="text-sm text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Guardado</p>}
        <button onClick={save} disabled={saving} className="btn-primary">
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
    <div className={`flex items-center justify-between p-3 rounded-xl border ${disabled ? 'opacity-50' : ''} border-slate-100 dark:border-slate-800`}>
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 text-slate-500 mt-0.5" />
        <div>
          <p className="font-medium text-sm text-slate-800 dark:text-slate-100">{title}</p>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
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
