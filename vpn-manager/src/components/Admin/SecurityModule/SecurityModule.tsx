import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban, Clock3, Eye, Infinity as InfinityIcon, RefreshCw, Search, Shield, ShieldCheck, ShieldOff,
  Unlock, UserRoundX, X,
} from 'lucide-react';
import { confirmGoogleIdentity } from '../../../services/federatedAuth';
import { securityAdminApi, type LockedAccount, type SecurityJail, type SecurityMutation, type WebObservation } from '../../../services/securityAdminApi';

const categories: Array<[SecurityMutation['category'], string]> = [
  ['FALSE_POSITIVE', 'Falso positivo'],
  ['ADMIN_ACCESS', 'Acceso administrativo'],
  ['MAINTENANCE', 'Mantenimiento'],
  ['SECURITY_TEST', 'Prueba de seguridad'],
  ['OTHER', 'Otro'],
];

type SecurityAction = 'ban' | 'promote' | 'unban' | 'trust' | 'untrust' | null;

interface BlockedRow {
  ip: string;
  jail: string;
  protection: string;
  attempts: number;
  blockedSince?: number;
  expiresAt?: number | null;
}

interface AttemptResult {
  attempts: Array<Record<string, unknown>>;
  total: number;
  historySince: number | null;
  historyUntil: number | null;
  truncated: boolean;
}

const formatDate = (value?: number | null) => {
  if (value === null) return 'Sin vencimiento';
  if (!value) return 'Sin información';
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(value));
};

const isIndefiniteJail = (jail: string) => ['gestionvpn-indefinite', 'gestionvpn-recidive'].includes(jail);

export default function SecurityModule() {
  const [jails, setJails] = useState<SecurityJail[]>([]);
  const [trusted, setTrusted] = useState<string[]>([]);
  const [currentIp, setCurrentIp] = useState('');
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [action, setAction] = useState<SecurityAction>(null);
  const [target, setTarget] = useState('');
  const [jail, setJail] = useState('sshd');
  const [duration, setDuration] = useState<SecurityMutation['duration']>('1h');
  const [category, setCategory] = useState<SecurityMutation['category']>('FALSE_POSITIVE');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRisk, setConfirmRisk] = useState(false);
  const [attemptHistorySince, setAttemptHistorySince] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<AttemptResult | null>(null);
  const [lockedAccounts, setLockedAccounts] = useState<LockedAccount[]>([]);
  const [unlockAccount, setUnlockAccount] = useState<LockedAccount | null>(null);
  const [webObservation, setWebObservation] = useState<WebObservation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [status, recent, accountLocks, web] = await Promise.all([
        securityAdminApi.status(), securityAdminApi.history(), securityAdminApi.lockedAccounts(),
        securityAdminApi.webObservation(),
      ]);
      setJails(status.jails);
      setTrusted(status.trusted);
      setCurrentIp(status.currentIp);
      setAttemptHistorySince(status.attemptHistory?.since ?? null);
      setHistory(recent.history);
      setLockedAccounts(accountLocks.accounts);
      setWebObservation(web);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la seguridad del VPS');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo<BlockedRow[]>(() => jails.flatMap((item) => item.banned.map((ip) => {
    const detail = item.banDetails?.find((entry) => entry.target === ip);
    return {
      ip,
      jail: item.name,
      protection: detail?.reason || (item.name === 'sshd' ? 'Fallos reiterados de autenticación SSH' : 'Bloqueo manual'),
      attempts: detail?.attempts ?? 0,
      blockedSince: detail?.blockedSince,
      expiresAt: detail?.expiresAt,
    };
  })).filter((row) => {
    const query = filter.trim().toLowerCase();
    return !query || row.ip.toLowerCase().includes(query)
      || row.jail.toLowerCase().includes(query)
      || row.protection.toLowerCase().includes(query);
  }), [jails, filter]);

  const open = (kind: SecurityAction, ip = '', sourceJail = 'sshd') => {
    setAction(kind);
    setTarget(ip);
    setJail(sourceJail);
    setDuration(kind === 'promote' ? 'indefinite' : '1h');
    setReason('');
    setPassword('');
    setConfirmRisk(false);
  };

  const showAttempts = async (ip: string) => {
    setError('');
    try {
      const data = await securityAdminApi.attempts(ip);
      setAttempts(data);
    } catch (attemptError) {
      setError(attemptError instanceof Error ? attemptError.message : 'No se pudieron consultar los intentos');
    }
  };

  const execute = async (google = false) => {
    if (!action || reason.trim().length < 10) return;
    setBusy(true);
    setError('');
    try {
      const proof = google
        ? await securityAdminApi.stepUpGoogle(await confirmGoogleIdentity())
        : await securityAdminApi.stepUpPassword(password);
      const data: SecurityMutation = {
        target, jail, duration, category, reason: reason.trim(),
        stepUpToken: proof.stepUpToken,
        confirmIndefinite: duration === 'indefinite' && confirmRisk,
        confirmNetworkTrust: action === 'trust' && target.includes('/') && confirmRisk,
      };
      if (action === 'ban') await securityAdminApi.ban(data);
      if (action === 'promote') await securityAdminApi.makeIndefinite({ ...data, jail, duration: 'indefinite', confirmIndefinite: true });
      if (action === 'unban') await securityAdminApi.unban(data);
      if (action === 'trust') await securityAdminApi.trust(data);
      if (action === 'untrust') await securityAdminApi.untrust(data);
      setAction(null);
      await load();
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : 'No se pudo aplicar la operación');
    } finally {
      setBusy(false);
    }
  };

  const executeAccountUnlock = async (google = false) => {
    if (!unlockAccount || reason.trim().length < 10) return;
    setBusy(true);
    setError('');
    try {
      const proof = google
        ? await securityAdminApi.stepUpGoogle(await confirmGoogleIdentity())
        : await securityAdminApi.stepUpPassword(password);
      await securityAdminApi.unlockAccount({ userId: unlockAccount.user_id, category,
        reason: reason.trim(), stepUpToken: proof.stepUpToken });
      setUnlockAccount(null);
      await load();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : 'No se pudo desbloquear la cuenta');
    } finally { setBusy(false); }
  };

  const openAccountUnlock = (account: LockedAccount) => {
    setUnlockAccount(account);
    setCategory('FALSE_POSITIVE');
    setReason('');
    setPassword('');
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Seguridad del VPS</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Controla bloqueos, intentos SSH y direcciones de confianza.
          </p>
        </div>
        <button className="btn-outline btn-md self-start" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Actualizando' : 'Actualizar'}
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary icon={Shield} label="Direcciones bloqueadas" value={rows.length} />
        <Summary icon={ShieldCheck} label="Direcciones confiables" value={trusted.length} />
        <Summary icon={ShieldOff} label="Protecciones activas" value={jails.length} />
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Usuarios bloqueados</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Bloqueos por contraseñas incorrectas; no afectan a otros usuarios de la misma red.</p>
          </div>
          <span className="badge badge-neutral whitespace-nowrap">{lockedAccounts.length} activos</span>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60"><tr>
              {['Usuario', 'Motivo / fallos', 'Periodo', 'IP reciente', 'Acción'].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">{heading}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {lockedAccounts.map((account) => <tr key={account.user_id}>
                <td className="px-4 py-4"><div className="font-semibold text-slate-900 dark:text-white">{account.name || 'Sin nombre'}</div><div className="text-xs text-slate-500">{account.email}</div></td>
                <td className="px-4 py-4"><div className="text-slate-700 dark:text-slate-200">Contraseñas incorrectas</div><span className="badge badge-neutral mt-1">{account.failures_24h} en 24 h</span></td>
                <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600 dark:text-slate-300"><div>Desde {formatDate(account.locked_at || account.updated_at)}</div><div>Hasta {formatDate(account.locked_until)}</div></td>
                <td className="px-4 py-4"><div className="font-mono text-xs text-slate-700 dark:text-slate-200">{account.last_failure_ip || 'No disponible'}</div>{account.ip_globally_blocked === true && <span className="badge badge-danger mt-1">IP sigue bloqueada</span>}{account.ip_globally_blocked == null && account.last_failure_ip && <span className="badge badge-neutral mt-1">Estado no disponible</span>}</td>
                <td className="px-4 py-4 text-right"><button className="btn-outline btn-md min-h-10 whitespace-nowrap" onClick={() => openAccountUnlock(account)}><Unlock className="h-4 w-4" /> Desbloquear</button></td>
              </tr>)}
              {!loading && lockedAccounts.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-sm text-slate-500">No hay usuarios bloqueados.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-200 md:hidden dark:divide-slate-700">
          {lockedAccounts.map((account) => <article key={account.user_id} className="space-y-3 p-4">
            <div className="flex items-start gap-3"><UserRoundX className="mt-0.5 h-5 w-5 text-amber-600" /><div className="min-w-0"><div className="truncate font-semibold">{account.name || account.email}</div><div className="break-all text-xs text-slate-500">{account.email}</div></div></div>
            <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900/60"><div>{account.failures_24h} intentos en 24 h</div><div className="mt-1">Desde {formatDate(account.locked_at || account.updated_at)} · Hasta {formatDate(account.locked_until)}</div><div className="mt-1 font-mono">IP reciente: {account.last_failure_ip || 'No disponible'}</div>{account.ip_globally_blocked && <div className="mt-2 font-semibold text-rose-600">La IP permanece bloqueada globalmente.</div>}</div>
            <button className="btn-outline btn-md min-h-11 w-full" onClick={() => openAccountUnlock(account)}><Unlock className="h-4 w-4" /> Desbloquear usuario</button>
          </article>)}
          {!loading && lockedAccounts.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No hay usuarios bloqueados.</div>}
        </div>
      </section>

      {webObservation && <WebObservationPanel observation={webObservation} />}

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">Direcciones bloqueadas</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Los desbloqueos no crean una excepción permanente.
              </p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-[minmax(18rem,22rem)_auto_auto] xl:items-center">
              <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  className="input-field pl-9"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Buscar IP, motivo o protección"
                />
              </div>
              <button className="btn-outline inline-flex min-h-11 min-w-[12rem] shrink-0 items-center justify-center gap-2 whitespace-nowrap px-4 text-sm" onClick={() => open('trust')}>
                <ShieldCheck className="h-4 w-4" /> Agregar confiable
              </button>
              <button className="btn-primary inline-flex min-h-11 min-w-[10rem] shrink-0 items-center justify-center gap-2 whitespace-nowrap px-4 text-sm" onClick={() => open('ban')}>
                <Ban className="h-4 w-4" /> Bloquear IP
              </button>
            </div>
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[900px] w-full table-fixed text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60">
              <tr>
                <th className="w-[27%] px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">Dirección y motivo</th>
                <th className="w-[10%] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-600" title={attemptHistorySince ? `Contados desde ${formatDate(attemptHistorySince)}` : 'Según el historial disponible de Fail2ban'}>Intentos</th>
                <th className="w-[25%] px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">Periodo</th>
                <th className="w-[15%] px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">Protección</th>
                <th className="w-[23%] px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {rows.map((row) => (
                <BlockedTableRow key={`${row.jail}-${row.ip}`} row={row} open={open} showAttempts={showAttempts} />
              ))}
              {!loading && rows.length === 0 && <EmptyBlockedRows colSpan={5} />}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-200 md:hidden dark:divide-slate-700">
          {rows.map((row) => (
            <BlockedCard key={`${row.jail}-${row.ip}`} row={row} open={open} showAttempts={showAttempts} />
          ))}
          {!loading && rows.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No hay direcciones bloqueadas.</div>}
        </div>
      </section>

      <section className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Lista confiable permanente</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Estas direcciones no serán bloqueadas por Fail2ban.</p>
          </div>
          {currentIp && (
            <button className="btn-outline btn-md self-start" onClick={() => open('trust', currentIp)}>
              <ShieldCheck className="h-4 w-4" /> Confiar en mi IP actual
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {trusted.map((ip) => (
            <span key={ip} className="badge badge-success gap-2 px-3 py-2 font-mono text-xs">
              {ip}
              <button className="rounded p-1 hover:bg-emerald-200/70" aria-label={`Retirar ${ip}`} onClick={() => open('untrust', ip)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {trusted.length === 0 && <span className="text-sm text-slate-500">Sin excepciones adicionales.</span>}
        </div>
      </section>

      <RecentActivity history={history} />

      {action && (
        <ActionDialog
          action={action} target={target} setTarget={setTarget} duration={duration}
          setDuration={setDuration} category={category} setCategory={setCategory}
          reason={reason} setReason={setReason} password={password} setPassword={setPassword}
          confirmRisk={confirmRisk} setConfirmRisk={setConfirmRisk} busy={busy}
          close={() => setAction(null)} execute={execute}
        />
      )}

      {attempts && <AttemptsDialog result={attempts} close={() => setAttempts(null)} />}
      {unlockAccount && <AccountUnlockDialog account={unlockAccount} category={category} setCategory={setCategory}
        reason={reason} setReason={setReason} password={password} setPassword={setPassword} busy={busy}
        close={() => setUnlockAccount(null)} execute={executeAccountUnlock} />}
    </div>
  );
}

function WebObservationPanel({ observation }: { observation: WebObservation }) {
  const recommended = observation.sources.filter((source) => source.recommendations.length > 0).length;
  const recentActions = observation.actions.slice(0, 10);
  const recommendationLabel = (items:string[]) => {
    if (items.length === 0) return 'Sin umbral superado';
    if (items.includes('INDEFINITE_AUTH_ABUSE')) return 'Candidato a bloqueo indefinido';
    return 'Candidato a bloqueo temporal';
  };
  return <section className="card overflow-hidden">
    <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
      <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-900 dark:text-white">Observación de ataques web</h2><span className={`badge ${observation.enforcement.active ? 'badge-warning' : observation.enforcement.armed ? 'badge-neutral' : 'badge-info'}`}>{observation.enforcement.active ? `Canary activo · ${observation.enforcement.rolloutPercent}%` : observation.enforcement.armed ? 'Armado · rollout 0%' : 'Preparado · desactivado'}</span>{observation.enforcement.active && <span className={`badge ${observation.enforcement.indefiniteActive ? 'badge-danger' : 'badge-neutral'}`}>{observation.enforcement.indefiniteActive ? 'Escalada indefinida activa' : 'Escalada indefinida desactivada'}</span>}</div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{observation.enforcement.active ? 'Las direcciones incluidas en el porcentaje del canary pueden recibir protección automática.' : 'Analiza las últimas 24 horas sin aplicar nuevos bloqueos.'} Conservación: {observation.retentionDays} días.</p></div>
      <div className="flex gap-2"><span className="badge badge-neutral">{observation.sources.length} direcciones</span><span className={recommended ? 'badge badge-warning' : 'badge badge-success'}>{recommended} superan umbral</span></div>
    </div>
    {observation.truncated && <div className="border-b border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">La vista alcanzó el límite de análisis; los datos no se han eliminado.</div>}
    <div className="hidden overflow-x-auto md:block"><table className="min-w-[940px] w-full text-left text-sm"><thead className="bg-slate-50 dark:bg-slate-900/60"><tr>
      {['Dirección', 'Login 24 h', 'Límites 10 min', 'Rutas 5 min', 'Sensibles 10 min', 'Evaluación'].map((heading)=><th key={heading} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">{heading}</th>)}
    </tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">
      {observation.sources.slice(0,50).map((source)=><tr key={source.sourceIp}>
        <td className="px-4 py-4"><div className="font-mono font-semibold">{source.sourceIp}</div><div className="mt-1 text-xs text-slate-500">Último: {formatDate(source.lastSeen)}</div></td>
        <td className="px-4 py-4"><div className="font-semibold">{source.authFailures24h}</div><div className="text-xs text-slate-500">{source.identities24h} identidades</div></td>
        <td className="px-4 py-4 text-center">{source.rateLimited10m}</td><td className="px-4 py-4"><div>{source.notFound5m} intentos</div><div className="text-xs text-slate-500">{source.distinctRoutes5m} rutas</div></td>
        <td className="px-4 py-4 text-center">{source.sensitive10m}</td><td className="px-4 py-4"><span className={source.recommendations.length ? 'badge badge-warning' : 'badge badge-neutral'}>{recommendationLabel(source.recommendations)}</span></td>
      </tr>)}
      {observation.sources.length===0&&<tr><td colSpan={6} className="p-8 text-center text-sm text-slate-500">Aún no hay eventos web observados.</td></tr>}
    </tbody></table></div>
    <div className="divide-y divide-slate-200 md:hidden dark:divide-slate-700">{observation.sources.slice(0,50).map((source)=><article key={source.sourceIp} className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div className="font-mono text-sm font-semibold">{source.sourceIp}</div><span className={source.recommendations.length?'badge badge-warning':'badge badge-neutral'}>{recommendationLabel(source.recommendations)}</span></div><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">Login 24 h<br/><strong>{source.authFailures24h}</strong></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">429 en 10 min<br/><strong>{source.rateLimited10m}</strong></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">Rutas en 5 min<br/><strong>{source.notFound5m}</strong></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">Sensibles<br/><strong>{source.sensitive10m}</strong></div></div></article>)}</div>
    {recentActions.length > 0 && <div className="border-t border-slate-200 p-4 dark:border-slate-700"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Actividad automática reciente</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{recentActions.map((action)=><article key={action.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-semibold">{action.source_ip}</span><span className={`badge ${action.status==='APPLIED'?'badge-success':action.status==='FAILED'?'badge-danger':'badge-neutral'}`}>{action.status==='APPLIED'?'Aplicado':action.status==='FAILED'?'Falló':'Pendiente'}</span></div><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{action.jail==='gestionvpn-indefinite'?'Protección indefinida':action.jail==='gestionvpn-web-scan-24h'?'Protección temporal · 24 h':action.jail==='gestionvpn-web-scan-6h'?'Protección temporal · 6 h':'Protección temporal · 1 h'}</p><p className="mt-1 text-xs text-slate-500">{formatDate(action.created_at)}</p></article>)}</div></div>}
  </section>;
}

function AccountUnlockDialog(props: {
  account: LockedAccount; category: SecurityMutation['category']; setCategory:(value:SecurityMutation['category'])=>void;
  reason:string; setReason:(value:string)=>void; password:string; setPassword:(value:string)=>void;
  busy:boolean; close:()=>void; execute:(google?:boolean)=>Promise<void>;
}) {
  const disabled = props.busy || props.reason.trim().length < 10;
  return <div className="modal-overlay" role="presentation"><div className="modal-panel w-full max-w-lg space-y-4 p-5" role="dialog" aria-modal="true" aria-labelledby="account-unlock-title">
    <div className="flex items-center justify-between gap-3"><div><h2 id="account-unlock-title" className="text-lg font-bold">Desbloquear usuario</h2><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{props.account.email}</p></div><button className="btn-ghost h-10 w-10 p-0" aria-label="Cerrar" onClick={props.close}><X className="h-5 w-5" /></button></div>
    <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900/60">Se borrarán los contadores de contraseñas incorrectas. La acción quedará registrada.</div>
    <label className="block text-sm font-semibold">Categoría<select className="input-field mt-1" value={props.category} onChange={(event)=>props.setCategory(event.target.value as SecurityMutation['category'])}>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label className="block text-sm font-semibold">Motivo<input className="input-field mt-1" value={props.reason} onChange={(event)=>props.setReason(event.target.value)} placeholder="Mínimo 10 caracteres" /></label>
    <label className="block text-sm font-semibold">Contraseña actual<input type="password" autoComplete="current-password" className="input-field mt-1" value={props.password} onChange={(event)=>props.setPassword(event.target.value)} /></label>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="btn-ghost" onClick={props.close}>Cancelar</button><button className="btn-outline btn-md" disabled={disabled} onClick={()=>void props.execute(true)}>Confirmar con Google</button><button className="btn-primary btn-md" disabled={disabled || !props.password} onClick={()=>void props.execute(false)}>{props.busy?'Aplicando…':'Desbloquear'}</button></div>
  </div></div>;
}

function BlockedTableRow({ row, open, showAttempts }: {
  row: BlockedRow;
  open: (kind: SecurityAction, ip?: string, jail?: string) => void;
  showAttempts: (ip: string) => Promise<void>;
}) {
  return (
    <tr className="align-middle hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
      <td className="px-4 py-4">
        <div className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{row.ip}</div>
        <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{row.protection}</div>
      </td>
      <td className="px-4 py-4 text-center">
        <span className="badge badge-neutral min-w-8 justify-center">{row.attempts}</span>
      </td>
      <td className="px-4 py-4">
        <DateLine label="Desde" value={row.blockedSince} />
        <DateLine label="Hasta" value={row.expiresAt} />
      </td>
      <td className="px-4 py-4"><ProtectionBadge jail={row.jail} reason={row.protection} /></td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-1.5">
          <IconAction label="Ver intentos" icon={Eye} onClick={() => void showAttempts(row.ip)} />
          {!isIndefiniteJail(row.jail) && <IconAction label="Hacer indefinido" icon={InfinityIcon} onClick={() => open('promote', row.ip, row.jail)} />}
          <IconAction label="Hacer confiable" icon={ShieldCheck} onClick={() => open('trust', row.ip)} />
          <IconAction label="Desbloquear" icon={Unlock} danger onClick={() => open('unban', row.ip, row.jail)} />
        </div>
      </td>
    </tr>
  );
}

function BlockedCard({ row, open, showAttempts }: {
  row: BlockedRow;
  open: (kind: SecurityAction, ip?: string, jail?: string) => void;
  showAttempts: (ip: string) => Promise<void>;
}) {
  return (
    <article className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-all font-mono text-sm font-semibold text-slate-900 dark:text-white">{row.ip}</div>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{row.protection}</p>
        </div>
        <ProtectionBadge jail={row.jail} reason={row.protection} />
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
        <DateLine label="Bloqueada desde" value={row.blockedSince} />
        <DateLine label="Expira" value={row.expiresAt} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn-ghost min-h-11" onClick={() => void showAttempts(row.ip)}><Eye className="h-4 w-4" /> Intentos</button>
        <button className="btn-outline btn-md min-h-11" onClick={() => open('trust', row.ip)}><ShieldCheck className="h-4 w-4" /> Confiar</button>
        <button className="btn-danger btn-md min-h-11" onClick={() => open('unban', row.ip, row.jail)}><Unlock className="h-4 w-4" /> Quitar</button>
      </div>
      {!isIndefiniteJail(row.jail) && <button className="btn-outline btn-md min-h-11 w-full" onClick={() => open('promote', row.ip, row.jail)}><InfinityIcon className="h-4 w-4" /> Hacer indefinido</button>}
    </article>
  );
}

function DateLine({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="truncate font-medium text-slate-700 dark:text-slate-200">{formatDate(value)}</span>
    </div>
  );
}

function ProtectionBadge({ jail, reason = '' }: { jail: string; reason?: string }) {
  const automatic = ['sshd', 'gestionvpn-recidive', 'gestionvpn-web-1h', 'gestionvpn-web-scan-6h', 'gestionvpn-web-scan-24h'].includes(jail);
  const recidive = jail === 'gestionvpn-recidive';
  const web = jail === 'gestionvpn-web-1h';
  const webScan6h = jail === 'gestionvpn-web-scan-6h';
  const webScan24h = jail === 'gestionvpn-web-scan-24h';
  const webIndefinite = jail === 'gestionvpn-indefinite'
    && (reason.includes('web') || reason.includes('autenticación'));
  return (
    <span className={`badge ${automatic || webIndefinite ? 'badge-neutral' : 'badge-info'} whitespace-nowrap`}>
      {recidive ? 'Fail2ban · Reincidente' : webIndefinite ? 'Protección web · Indefinida' : webScan24h ? 'Escaneo web · 24 h' : webScan6h ? 'Escaneo web · 6 h' : web ? 'Protección web · 1 h' : automatic ? 'Fail2ban · SSH' : 'Manual'}
    </span>
  );
}

function IconAction({ label, icon: Icon, danger = false, onClick }: {
  label: string; icon: typeof Eye; danger?: boolean; onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${danger ? 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/50' : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
      title={label}
      aria-label={`${label} ${label === 'Ver intentos' ? 'de' : ''}`}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function EmptyBlockedRows({ colSpan }: { colSpan: number }) {
  return (
    <tr><td colSpan={colSpan} className="p-10 text-center text-sm text-slate-500">No hay direcciones bloqueadas.</td></tr>
  );
}

function RecentActivity({ history }: { history: Array<Record<string, unknown>> }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 p-4 dark:border-slate-700">
        <h2 className="font-bold text-slate-900 dark:text-white">Actividad reciente</h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Registro de quién realizó cada cambio y por qué.</p>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[780px] w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/60"><tr>
            {['Fecha', 'Administrador', 'Acción', 'Objetivo', 'Resultado', 'Motivo'].map((heading) => (
              <th key={heading} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">{heading}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {history.slice(0, 25).map((row, index) => (
              <tr key={String(row.id || index)}>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatDate(Number(row.created_at))}</td>
                <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{String(row.actor_email || 'Administrador')}</td>
                <td className="px-4 py-3"><ActionBadge action={String(row.action || '')} /></td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">{String(row.target || '—')}</td>
                <td className="px-4 py-3"><OutcomeBadge success={row.outcome === 'SUCCESS'} /></td>
                <td className="max-w-sm px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{String(row.reason || '')}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-500">Aún no hay acciones administrativas.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-200 md:hidden dark:divide-slate-700">
        {history.slice(0, 25).map((row, index) => (
          <article key={String(row.id || index)} className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2"><ActionBadge action={String(row.action || '')} /><OutcomeBadge success={row.outcome === 'SUCCESS'} /></div>
            <div className="font-mono text-xs text-slate-700 dark:text-slate-200">{String(row.target || '—')}</div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{String(row.reason || '')}</p>
            <div className="text-xs text-slate-500">{String(row.actor_email || 'Administrador')} · {formatDate(Number(row.created_at))}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ActionBadge({ action }: { action: string }) {
  const labels: Record<string, string> = { BAN: 'Bloqueó', PROMOTE_INDEFINITE: 'Hizo indefinido', UNBAN: 'Desbloqueó', TRUST_ADD: 'Confió', TRUST_REMOVE: 'Retiró confianza', ACCOUNT_UNLOCK: 'Desbloqueó usuario' };
  return <span className="badge badge-neutral whitespace-nowrap">{labels[action] || action}</span>;
}

function OutcomeBadge({ success }: { success: boolean }) {
  return <span className={`badge ${success ? 'badge-success' : 'badge-danger'}`}>{success ? 'Aplicado' : 'Falló'}</span>;
}

function ActionDialog(props: {
  action: Exclude<SecurityAction, null>;
  target: string; setTarget: (value: string) => void;
  duration: SecurityMutation['duration']; setDuration: (value: SecurityMutation['duration']) => void;
  category: SecurityMutation['category']; setCategory: (value: SecurityMutation['category']) => void;
  reason: string; setReason: (value: string) => void;
  password: string; setPassword: (value: string) => void;
  confirmRisk: boolean; setConfirmRisk: (value: boolean) => void;
  busy: boolean; close: () => void; execute: (google?: boolean) => Promise<void>;
}) {
  const needsRisk = props.action === 'promote' || props.duration === 'indefinite' || (props.action === 'trust' && props.target.includes('/'));
  const disabled = props.busy || props.reason.trim().length < 10 || (needsRisk && !props.confirmRisk);
  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-panel w-full max-w-lg space-y-4 p-5" role="dialog" aria-modal="true" aria-labelledby="security-action-title">
        <div className="flex items-center justify-between gap-3">
          <div><h2 id="security-action-title" className="text-lg font-bold">Confirmar acción de seguridad</h2><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Se registrará en la auditoría del VPS.</p></div>
          <button className="btn-ghost h-10 w-10 p-0" aria-label="Cerrar" onClick={props.close}><X className="h-5 w-5" /></button>
        </div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">IP o red
          <input className="input-field mt-1 font-mono" value={props.target} onChange={(event) => props.setTarget(event.target.value)} disabled={props.action === 'promote' || props.action === 'unban' || props.action === 'untrust'} />
        </label>
        {props.action === 'ban' && <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Duración
          <select className="input-field mt-1" value={props.duration} onChange={(event) => { props.setDuration(event.target.value as SecurityMutation['duration']); props.setConfirmRisk(false); }}>
            {['15m', '1h', '6h', '24h', '7d', 'indefinite'].map((value) => <option key={value} value={value}>{value === 'indefinite' ? 'Indefinido' : value}</option>)}
          </select>
        </label>}
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Categoría
          <select className="input-field mt-1" value={props.category} onChange={(event) => props.setCategory(event.target.value as SecurityMutation['category'])}>
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Motivo
          <input className="input-field mt-1" value={props.reason} onChange={(event) => props.setReason(event.target.value)} placeholder="Mínimo 10 caracteres" />
        </label>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Contraseña actual
          <input type="password" autoComplete="current-password" className="input-field mt-1" value={props.password} onChange={(event) => props.setPassword(event.target.value)} />
        </label>
        {(props.action === 'trust' || props.action === 'promote' || props.duration === 'indefinite') && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p>{props.action === 'promote' ? 'El bloqueo temporal se trasladará a la protección indefinida sin dejar la IP desprotegida.' : 'Esta acción permanece hasta retirarla manualmente. Verifica cuidadosamente el objetivo.'}</p>
          {needsRisk && <label className="mt-2 flex items-start gap-2 font-semibold"><input className="mt-0.5" type="checkbox" checked={props.confirmRisk} onChange={(event) => props.setConfirmRisk(event.target.checked)} /> Confirmo el alcance y el riesgo de esta excepción permanente.</label>}
        </div>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-ghost" onClick={props.close}>Cancelar</button>
          <button className="btn-outline btn-md" disabled={disabled} onClick={() => void props.execute(true)}>Confirmar con Google</button>
          <button className="btn-primary btn-md" disabled={disabled || !props.password} onClick={() => void props.execute(false)}>{props.busy ? 'Aplicando…' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  );
}

function AttemptsDialog({ result, close }: { result: AttemptResult; close: () => void }) {
  const period = result.historySince
    ? `Historial disponible desde ${formatDate(result.historySince)}.`
    : 'No hay historial retenido para esta dirección.';
  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-panel max-h-[80vh] w-full max-w-2xl overflow-auto p-5" role="dialog" aria-modal="true" aria-labelledby="attempts-title">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 id="attempts-title" className="text-lg font-bold">Intentos detectados por Fail2ban</h2><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{period} Total: {result.total}.</p></div><button className="btn-ghost h-10 w-10 p-0" aria-label="Cerrar" onClick={close}><X className="h-5 w-5" /></button></div>
        <div className="space-y-2">{result.attempts.map((row, index) => <div key={index} className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700 dark:bg-slate-900 dark:text-slate-200"><div className="font-medium">{String(row.message || '')}</div>{row.detectedAt ? <div className="mt-1 text-slate-500">{formatDate(Number(row.detectedAt))}</div> : null}</div>)}{result.attempts.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No se encontraron detecciones en el historial conservado.</p>}</div>
      </div>
    </div>
  );
}

function Summary({ icon: Icon, label, value }: { icon: typeof Shield; label: string; value: number }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"><Icon className="h-5 w-5" /></div>
      <div><div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div><div className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</div></div>
    </div>
  );
}
