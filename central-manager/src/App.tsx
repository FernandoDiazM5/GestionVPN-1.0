import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Building2,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Network,
  PackageCheck,
  Plus,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  centralApi,
  type Admin,
  type Customer,
  type Delivery,
  type Instance,
  type Invoice,
  type Plan,
  type Payment,
  type Subscription,
} from "./api";

type Tab =
  | "overview"
  | "customers"
  | "plans"
  | "subscriptions"
  | "billing"
  | "instances"
  | "communications"
  | "settings";
export default function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    centralApi
      .me()
      .then(setAdmin)
      .catch(() => setAdmin(null))
      .finally(() => setChecking(false));
  }, []);
  if (checking) return <Loading />;
  if (!admin) return <Login onLogin={setAdmin} />;
  return <Console admin={admin} onLogout={() => setAdmin(null)} />;
}

function Loading() {
  return (
    <main className="center">
      <div className="brand-mark">
        <Network />
      </div>
      <p>Iniciando Joinpoint Central…</p>
    </main>
  );
}
function Login({ onLogin }: { onLogin: (admin: Admin) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await centralApi.login(email.trim(), password, totp));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Acceso denegado.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="legacy-login-page">
      <div className="login-glow login-glow-a" />
      <div className="login-glow login-glow-b" />
      <section className="legacy-login-shell">
        <div className="legacy-login-form">
          <form onSubmit={submit}>
            <header className="legacy-login-heading">
              <span className="eyebrow">Bienvenido de nuevo</span>
              <h1>Inicia sesión</h1>
              <p>
                Usa tus credenciales para entrar a tu centro de operaciones.
              </p>
            </header>
            {error ? (
              <div className="error login-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="legacy-fields">
              <label>
                Correo
                <div className="input-with-icon">
                  <UserRound />
                  <input
                    autoFocus
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="administrador@joinpoint.cloud"
                  />
                </div>
              </label>
              <label>
                Contraseña
                <div className="input-with-icon">
                  <Lock />
                  <input
                    type="password"
                    minLength={12}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                  />
                </div>
              </label>
              <label>
                Código de autenticación
                <div className="input-with-icon">
                  <ShieldCheck />
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={totp}
                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
                    required
                    placeholder="000000"
                  />
                </div>
              </label>
            </div>
            <button
              className="legacy-submit"
              disabled={busy || totp.length !== 6}
            >
              <span className="button-shine" />
              <Server />
              {busy ? "Verificando…" : "Ingresar a Joinpoint"}
            </button>
            <p className="secure-copy">
              <Lock /> Operación segura · Monitoreo centralizado · MFA
            </p>
          </form>
        </div>
        <aside className="legacy-login-brand" aria-label="Joinpoint Central">
          <span className="brand-orbit brand-orbit-top" />
          <span className="brand-orbit brand-orbit-bottom" />
          <div className="brand-content">
            <div className="logo-glass">
              <JoinpointLogo inverted />
            </div>
            <span className="brand-kicker">JOINPOINT CENTRAL</span>
            <h2>¡Hola de nuevo!</h2>
            <p>
              Administra clientes, membresías e instancias desde una plataforma
              segura.
            </p>
            <div className="brand-feature">
              <Mail />
              <span>Control comercial y operativo</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function JoinpointLogo({ inverted = false }: { inverted?: boolean }) {
  const primary = inverted ? "#fff" : "#3157D5";
  const accent = inverted ? "#9DECF0" : "#16B8C4";
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Joinpoint" fill="none">
      <rect
        width="64"
        height="64"
        rx="18"
        fill={inverted ? "rgba(255,255,255,.14)" : "#EEF2FF"}
      />
      <path
        d="M42 15v25c0 8.3-6.7 15-15 15-7.2 0-13-4.7-15-11.2"
        stroke={primary}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M23 25h19"
        stroke={primary}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="42" cy="15" r="5" fill={accent} />
      <circle cx="23" cy="25" r="5" fill={accent} />
      <circle cx="12" cy="43" r="5" fill={accent} />
    </svg>
  );
}

function Console({ admin, onLogout }: { admin: Admin; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<[Customer[], Plan[], Instance[]]>([
    [],
    [],
    [],
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    centralApi
      .overview()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function logout() {
    try {
      await centralApi.logout();
    } finally {
      onLogout();
    }
  }
  const nav: [Tab, string, typeof LayoutDashboard][] = [
    ["overview", "Resumen", LayoutDashboard],
    ["customers", "Clientes", Building2],
    ["plans", "Planes", PackageCheck],
    ["subscriptions", "Membresías", KeyRound],
    ["billing", "Facturación", Mail],
    ["instances", "Instancias", Server],
    ["communications", "Comunicaciones", Mail],
    ["settings", "Configuración", Settings],
  ];
  return (
    <div className="app-shell">
      <aside>
        <div className="wordmark">
          <span className="sidebar-logo">
            <JoinpointLogo />
          </span>
          <div>
            <strong>
              JOINPOINT <em>CENTRAL</em>
            </strong>
            <small>Tu negocio, bajo control</small>
          </div>
        </div>
        <small>PLATAFORMA</small>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="account">
          <span>{admin.displayName}</span>
          <small>{admin.email}</small>
          <button onClick={logout}>
            <LogOut />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="content">
        <header>
          <div>
            <span className="eyebrow">Administrador</span>
            <h1>{nav.find((x) => x[0] === tab)?.[1]}</h1>
          </div>
          <button className="secondary" onClick={load} disabled={loading}>
            <RefreshCw />
            Actualizar
          </button>
        </header>
        {error ? <div className="error">{error}</div> : null}
        {loading ? (
          <div className="skeleton-grid">
            <i />
            <i />
            <i />
          </div>
        ) : (
          <TabContent tab={tab} data={data} reload={load} />
        )}
      </main>
    </div>
  );
}

function TabContent({
  tab,
  data,
  reload,
}: {
  tab: Tab;
  data: [Customer[], Plan[], Instance[]];
  reload: () => void;
}) {
  const [customers, plans, instances] = data;
  if (tab === "overview")
    return (
      <>
        <section className="metrics">
          <Metric icon={Building2} label="Clientes" value={customers.length} />
          <Metric icon={PackageCheck} label="Planes" value={plans.length} />
          <Metric icon={Server} label="Instancias" value={instances.length} />
          <Metric
            icon={KeyRound}
            label="Activas"
            value={instances.filter((x) => x.status === "ACTIVE").length}
          />
        </section>
        <section className="card">
          <h2>Estado de la plataforma</h2>
          <div className="healthy">
            <ShieldCheck />
            Servicios centrales operativos
          </div>
          <p className="muted">
            El siguiente paso es registrar el primer cliente, asignar un plan y
            preparar su instancia.
          </p>
        </section>
      </>
    );
  if (tab === "customers")
    return (
      <Resource
        title="Clientes"
        action={<CustomerForm done={reload} />}
        empty="Todavía no hay clientes."
      >
        <CustomerManager items={customers} reload={reload}/>
      </Resource>
    );
  if (tab === "plans")
    return (
      <Resource
        title="Planes"
        action={<PlanForm done={reload} />}
        empty="Todavía no hay planes."
      >
        <PlanManager items={plans} reload={reload}/>
      </Resource>
    );
  if (tab === "subscriptions") return <SubscriptionPanel />;
  if (tab === "billing")
    return <BillingPanel plans={plans} instances={instances} />;
  if (tab === "communications") return <CommunicationsPanel />;
  if (tab === "settings") return <SettingsPanel />;
  return (
    <Resource
      title="Instancias"
      action={
        <InstanceForm customers={customers} plans={plans} done={reload} />
      }
      empty="Todavía no hay instancias."
    >
      <Table
        headers={["Dominio", "IP pública", "Pool", "Estado"]}
        rows={instances.map((x) => [
          x.fqdn,
          x.public_ip || "Pendiente",
          x.management_pool_cidr,
          x.status,
        ])}
      />
    </Resource>
  );
}
function formatPlanPrice(plan: Plan, interval: "MONTH" | "YEAR") {
  const price = plan.prices.find((item) => item.billing_interval === interval);
  return price ? price.currency + " " + Number(price.amount).toFixed(2) : "—";
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Server;
  label: string;
  value: number;
}) {
  return (
    <article className="metric">
      <span>
        <Icon />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}
function Resource({
  title,
  action,
  empty,
  children,
}: {
  title: string;
  action: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <p className="muted">
            Información gestionada por la plataforma central.
          </p>
        </div>
        {action}
      </div>
      {children || <p>{empty}</p>}
    </section>
  );
}
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (!rows.length) return <div className="empty">Sin registros todavía.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((x, j) => (
                <td key={j}>{x}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function CustomerManager({items,reload}:{items:Customer[];reload:()=>void}){const [edit,setEdit]=useState<Customer|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");async function status(x:Customer){setBusy(true);setError("");try{await centralApi.setCustomerStatus(x.id,x.status==='ACTIVE'?'SUSPENDED':'ACTIVE',x.version);reload()}catch(e){setError(e instanceof Error?e.message:'No se pudo cambiar el estado')}finally{setBusy(false)}}async function save(e:FormEvent){e.preventDefault();if(!edit)return;setBusy(true);setError("");try{await centralApi.updateCustomer(edit.id,{legalName:edit.legal_name,displayName:edit.display_name,taxId:edit.tax_id||undefined,contact:{fullName:edit.contact_name,email:edit.contact_email,phone:edit.contact_phone||undefined},version:edit.version});setEdit(null);reload()}catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar')}finally{setBusy(false)}}if(!items.length)return <div className="empty">Sin registros todavía.</div>;return <><div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Razón social</th><th>Responsable</th><th>Correo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{x.display_name}</td><td>{x.legal_name}</td><td>{x.contact_name||'—'}</td><td>{x.contact_email||'—'}</td><td><span className={'status-pill '+x.status.toLowerCase()}>{x.status==='ACTIVE'?'Activo':'Suspendido'}</span></td><td><div className="row-actions"><button onClick={()=>setEdit({...x})}>Editar</button><button disabled={busy} onClick={()=>status(x)}>{x.status==='ACTIVE'?'Suspender':'Reactivar'}</button></div></td></tr>)}</tbody></table></div>{edit?<form className="crud-form edit-form" onSubmit={save}><div className="crud-form-head"><div><h3>Editar cliente</h3><p>Los cambios no modifican facturas ni comunicaciones ya emitidas.</p></div></div><div className="crud-grid">{[['display_name','Nombre visible'],['legal_name','Razón social'],['tax_id','RUC / identificación'],['contact_name','Responsable'],['contact_email','Correo'],['contact_phone','Teléfono']].map(([k,l])=><label className="form-field" key={k}><span>{l}</span><input required={!['tax_id','contact_phone'].includes(k)} type={k==='contact_email'?'email':'text'} value={(edit as any)[k]||''} onChange={e=>setEdit({...edit,[k]:e.target.value})}/></label>)}</div>{error?<div className="form-feedback error" role="alert">{error}</div>:null}<div className="form-actions"><button type="button" className="secondary" onClick={()=>setEdit(null)}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar cambios'}</button></div></form>:error?<div className="form-feedback error" role="alert">{error}</div>:null}</>}
function PlanManager({items,reload}:{items:Plan[];reload:()=>void}){const [edit,setEdit]=useState<Plan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");async function status(x:Plan){setBusy(true);setError("");try{await centralApi.setPlanStatus(x.id,!x.is_active,x.version);reload()}catch(e){setError(e instanceof Error?e.message:'No se pudo cambiar el estado')}finally{setBusy(false)}}async function save(e:FormEvent){e.preventDefault();if(!edit)return;setBusy(true);setError("");try{await centralApi.updatePlan(edit.id,{name:edit.name,description:edit.description||undefined,version:edit.version});setEdit(null);reload()}catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar')}finally{setBusy(false)}}if(!items.length)return <div className="empty">Sin registros todavía.</div>;return <><div className="table-wrap"><table><thead><tr><th>Código</th><th>Nombre</th><th>Mensual</th><th>Anual</th><th>Capacidades</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{x.code}</td><td>{x.name}</td><td>{formatPlanPrice(x,'MONTH')}</td><td>{formatPlanPrice(x,'YEAR')}</td><td>{x.entitlements.filter(i=>i.enabled).length}</td><td><span className={'status-pill '+(x.is_active?'active':'suspended')}>{x.is_active?'Activo':'Archivado'}</span></td><td><div className="row-actions"><button onClick={()=>setEdit({...x})}>Editar</button><button disabled={busy} onClick={()=>status(x)}>{x.is_active?'Archivar':'Reactivar'}</button></div></td></tr>)}</tbody></table></div>{edit?<form className="crud-form edit-form" onSubmit={save}><div className="crud-form-head"><div><h3>Editar plan {edit.code}</h3><p>Para cambiar precios o capacidades crea un plan nuevo; así no alteras contratos históricos.</p></div></div><div className="crud-grid"><label className="form-field"><span>Nombre comercial</span><input required value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></label><label className="form-field wide"><span>Descripción</span><textarea rows={3} value={edit.description||''} onChange={e=>setEdit({...edit,description:e.target.value})}/></label></div>{error?<div className="form-feedback error" role="alert">{error}</div>:null}<div className="form-actions"><button type="button" className="secondary" onClick={()=>setEdit(null)}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar cambios'}</button></div></form>:error?<div className="form-feedback error" role="alert">{error}</div>:null}</>}
function CustomerForm({ done }: { done: () => void }) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [v,setV]=useState<Record<string,string>>({});
  if(!open)return <button className="primary" onClick={()=>setOpen(true)}><Plus/>Nuevo cliente</button>;
  async function save(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{await centralApi.createCustomer({legalName:v.legalName.trim(),displayName:v.displayName.trim(),taxId:v.taxId?.trim()||undefined,contact:{fullName:v.contactName.trim(),email:v.contactEmail.trim(),phone:v.contactPhone?.trim()||undefined}});setOpen(false);done()}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar el cliente.")}finally{setBusy(false)}}
  const field=(key:string,label:string,help:string,type="text",required=true)=><label className="form-field"><span>{label}{required?<b aria-hidden="true"> *</b>:null}</span><input required={required} type={type} value={v[key]||""} onChange={e=>setV({...v,[key]:e.target.value})} aria-describedby={key+"-help"}/><small id={key+"-help"}>{help}</small></label>;
  return <form className="crud-form" onSubmit={save} noValidate={false}>
    <div className="crud-form-head"><div><h3>Registrar cliente</h3><p>Completa la identidad comercial y el contacto que recibirá la activación.</p></div><span className="required-note">* Obligatorio</span></div>
    <fieldset><legend>Datos de la empresa</legend><div className="crud-grid">{field('legalName','Razón social','Nombre legal para contratos y facturas.')}{field('displayName','Nombre visible','Nombre corto usado dentro de Joinpoint.')}{field('taxId','RUC / identificación','Opcional; puede completarse antes de facturar.','text',false)}</div></fieldset>
    <fieldset><legend>Contacto principal</legend><div className="crud-grid">{field('contactName','Nombre completo','Responsable autorizado del servicio.')}{field('contactEmail','Correo electrónico','Aquí se enviará el manual y código de activación.','email')}{field('contactPhone','Teléfono','Opcional, incluye código de país.','tel',false)}</div></fieldset>
    {error?<div className="form-feedback error" role="alert">{error}</div>:null}
    <div className="form-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)} disabled={busy}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Guardando…':'Crear cliente'}</button></div>
  </form>;
}
function PlanForm({ done }: { done: () => void }) {
  const featureCatalog = [
    ["sites.manage", "Administrar sitios", false],
    ["sites.max", "Máximo de sitios", true],
    ["members.manage", "Administrar miembros", false],
    ["members.max", "Máximo de miembros", true],
    ["devices.scan", "Escanear equipos", false],
    ["devices.persist", "Guardar equipos", false],
    ["devices.inventory", "Inventario de equipos", false],
    ["ap_monitor.use", "Monitor AP/CPE", false],
    ["diagnostics.use", "Diagnósticos técnicos", false],
    ["exports.advanced", "Exportaciones avanzadas", false],
    ["notifications.email", "Notificaciones por correo", false],
    ["notifications.telegram", "Notificaciones por Telegram", false],
    ["ai_air_os.use", "IA para AirOS", false],
  ] as const;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({
    currency: "PEN",
  });
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open)
    return (
      <button className="primary" onClick={() => setOpen(true)}>
        <Plus />
        Nuevo plan
      </button>
    );
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await centralApi.createPlan({
        code: values.code.toUpperCase(),
        name: values.name,
        description: values.description,
        prices: [
          {
            interval: "MONTH",
            currency: values.currency,
            amount: Number(values.monthly),
          },
          ...(values.annual
            ? [
                {
                  interval: "YEAR" as const,
                  currency: values.currency,
                  amount: Number(values.annual),
                },
              ]
            : []),
        ],
        entitlements: featureCatalog.map(([key, , hasLimit]) => ({
          key,
          enabled: Boolean(enabled[key]),
          limit:
            hasLimit && enabled[key] && values[key]
              ? Number(values[key])
              : null,
        })),
      });
      setOpen(false);
      done();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="plan-editor crud-form" onSubmit={save}>
      <div className="crud-form-head"><div><h3>Configurar nuevo plan</h3><p>Define primero la oferta comercial y luego las capacidades incluidas.</p></div><span className="required-note">* Obligatorio</span></div>
      <fieldset><legend>Información y precio</legend>
      <div className="form-grid">
        <label className="form-field"><span>Código *</span><input
          required
          placeholder="BASICO"
          onChange={(e) => setValues({ ...values, code: e.target.value })}
        /><small>Identificador interno único, sin espacios.</small></label>
        <label className="form-field"><span>Nombre comercial *</span><input
          required
          placeholder="Plan Básico"
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        /><small>Nombre que verá el cliente.</small></label>
        <label className="form-field"><span>Descripción</span><input
          placeholder="Para operaciones pequeñas"
          onChange={(e) =>
            setValues({ ...values, description: e.target.value })
          }
        /><small>Resumen breve de su propósito.</small></label>
        <label className="form-field"><span>Moneda *</span><select
          value={values.currency}
          onChange={(e) => setValues({ ...values, currency: e.target.value })}
        >
          <option value="PEN">Soles (PEN)</option>
          <option value="USD">Dólares (USD)</option>
        </select><small>Se conservará en sus precios históricos.</small></label>
        <label className="form-field"><span>Precio mensual *</span><input
          required
          type="number"
          min="0"
          step="0.01"
          placeholder="Precio mensual"
          onChange={(e) => setValues({ ...values, monthly: e.target.value })}
        /><small>Importe sin símbolos de moneda.</small></label>
        <label className="form-field"><span>Precio anual</span><input
          type="number"
          min="0"
          step="0.01"
          placeholder="Opcional"
          onChange={(e) => setValues({ ...values, annual: e.target.value })}
        /><small>Déjalo vacío si no ofrecerás ciclo anual.</small></label>
      </div>
      </fieldset>
      <fieldset><legend>Capacidades incluidas</legend><p className="fieldset-help">Activa únicamente lo incluido en la membresía. Los límites se aplicarán en el VPS cliente.</p>
      <div className="feature-grid">
        {featureCatalog.map(([key, label, hasLimit]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={Boolean(enabled[key])}
              onChange={(e) =>
                setEnabled({ ...enabled, [key]: e.target.checked })
              }
            />
            <span>{label}</span>
            {hasLimit ? (
              <input
                aria-label={"Límite de " + label}
                type="number"
                min="0"
                disabled={!enabled[key]}
                required={enabled[key]}
                placeholder="Límite"
                onChange={(e) =>
                  setValues({ ...values, [key]: e.target.value })
                }
              />
            ) : null}
          </label>
        ))}
      </div>
      </fieldset>
      {error ? <div className="error">{error}</div> : null}
      <div className="form-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar plan"}
        </button>
      </div>
    </form>
  );
}
function SubscriptionPanel() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [operation, setOperation] = useState("RENEW");
  const [months, setMonths] = useState("1");
  const [graceEndsAt, setGraceEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      centralApi
        .subscriptions()
        .then(setItems)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  function openAction(item: Subscription, action: string) {
    setSelected(item); setOperation(action); setReason(""); setMonths("1");
    const suggested = new Date(Math.max(Date.now(), new Date(item.ends_at).getTime()) + 7 * 86400000);
    setGraceEndsAt(suggested.toISOString().slice(0, 10)); setError(""); setNotice("");
  }
  async function submitAction(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    const body: Record<string, unknown> = { action: operation, version: Number(selected.version) };
    if (operation === "RENEW") body.months = Number(months);
    if (["SUSPEND", "CANCEL", "GRANT_GRACE"].includes(operation)) body.reason = reason;
    if (operation === "GRANT_GRACE") body.graceEndsAt = new Date(graceEndsAt + "T23:59:59-05:00").toISOString();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await centralApi.transitionSubscription(selected.id, body) as {notification?:{queued?:boolean;reason?:string}};
      await load(); setSelected(null);
      setNotice(result.notification?.queued ? "Membresía actualizada y aviso enviado a la cola." : "Membresía actualizada. El aviso quedó pendiente: " + (result.notification?.reason || "proveedor no disponible"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally { setBusy(false); }
  }
  const operationLabels: Record<string,string>={RENEW:"Renovar membresía",GRANT_GRACE:"Conceder periodo de gracia",SUSPEND:"Suspender membresía",REACTIVATE:"Reactivar membresía",CANCEL:"Cancelar membresía"};
  return (
    <div className="membership-stack"><section className="card">
      <div className="card-head">
        <div>
          <h2>Membresías</h2>
          <p className="muted">
            Renovación, gracia y suspensión conservan todos los datos del
            cliente.
          </p>
        </div>
        <button className="secondary" onClick={load}>
          <RefreshCw />
          Actualizar
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="success-note" role="status">{notice}</div> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Vencimiento</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.customer_name}</td>
                <td>{item.plan_name}</td>
                <td><span className={"status-pill " + item.status.toLowerCase().replace("_","-")}>{item.status}</span></td>
                <td>{new Date(item.ends_at).toLocaleDateString("es-PE")}</td>
                <td className="row-actions">
                  <button onClick={() => openAction(item, "RENEW")}>
                    Renovar 1 mes
                  </button>
                  <button onClick={() => openAction(item, "GRANT_GRACE")}>
                    Dar gracia
                  </button>
                  {item.status === "SUSPENDED" ? (
                    <button onClick={() => openAction(item, "REACTIVATE")}>
                      Reactivar
                    </button>
                  ) : (
                    <button onClick={() => openAction(item, "SUSPEND")}>
                      Suspender
                    </button>
                  )}
                  {!['CANCELLED'].includes(item.status) ? <button className="danger-text" onClick={() => openAction(item,"CANCEL")}>Cancelar</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? (
          <div className="empty">Aún no hay membresías asignadas.</div>
        ) : null}
      </div>
    </section>
    {selected ? <form className="card crud-form membership-editor" onSubmit={submitAction}>
      <div className="crud-form-head"><div><h3>{operationLabels[operation]}</h3><p>{selected.customer_name} · {selected.plan_name} · vence {new Date(selected.ends_at).toLocaleDateString('es-PE')}</p></div><span className="required-note">* Obligatorio</span></div>
      <fieldset><legend>Acción administrativa</legend><p className="fieldset-help">La operación conserva el historial. Suspender o cancelar revoca el acceso, pero no elimina la instancia ni sus datos.</p><div className="crud-grid">
        {operation==='RENEW'?<label className="form-field"><span>Meses a renovar <b>*</b></span><input type="number" min="1" max="36" required value={months} onChange={e=>setMonths(e.target.value)}/><small>Se suman desde el vencimiento vigente o desde hoy.</small></label>:null}
        {operation==='GRANT_GRACE'?<label className="form-field"><span>Fin del periodo de gracia <b>*</b></span><input type="date" required value={graceEndsAt} onChange={e=>setGraceEndsAt(e.target.value)}/><small>Debe ser posterior al vencimiento de la membresía.</small></label>:null}
        {['SUSPEND','CANCEL','GRANT_GRACE'].includes(operation)?<label className="form-field wide"><span>Motivo <b>*</b></span><textarea rows={3} minLength={8} maxLength={500} required value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explica el motivo para la auditoría y comunicación al cliente."/><small>Mínimo 8 caracteres. Se guardará en el historial.</small></label>:null}
        {operation==='REACTIVATE'?<div className="operation-warning">La reactivación devuelve el servicio a ACTIVO sólo si la vigencia no terminó; de lo contrario quedará pendiente de renovación.</div>:null}
        {operation==='CANCEL'?<div className="operation-warning danger">La cancelación revoca las licencias activas. No elimina al cliente, la instancia, facturas ni pagos.</div>:null}
      </div></fieldset>
      <div className="form-actions"><button type="button" className="secondary" onClick={()=>setSelected(null)}>Volver</button><button className={operation==='CANCEL'?'danger':'primary'} disabled={busy}>{busy?'Procesando…':operationLabels[operation]}</button></div>
    </form>:null}</div>
  );
}
function BillingPanel({
  plans,
  instances,
}: {
  plans: Plan[];
  instances: Instance[];
}) {
  const [items, setItems] = useState<Invoice[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [open, setOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [reviewingPayment,setReviewingPayment]=useState<Payment|null>(null);
  const [reviewMode,setReviewMode]=useState<'confirm'|'reject'>('confirm');
  const [reviewInvoiceId,setReviewInvoiceId]=useState('');
  const [reviewAmount,setReviewAmount]=useState('');
  const [reviewReason,setReviewReason]=useState('');
  const [reviewBusy,setReviewBusy]=useState(false);
  const [paymentValues, setPaymentValues] = useState<Record<string, string>>({
    currency: "PEN",
    paymentMethod: "TRANSFER",
  });
  const [values, setValues] = useState<Record<string, string>>({
    currency: "PEN",
    billingInterval: "MONTH",
    tax: "0",
  });
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      Promise.all([
        centralApi.invoices(),
        centralApi.subscriptions(),
        centralApi.payments(),
      ])
        .then(([invoices, currentSubscriptions, currentPayments]) => {
          setItems(invoices);
          setSubscriptions(currentSubscriptions);
          setPayments(currentPayments);
        })
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await centralApi.createInvoice({
        instanceId: values.instanceId,
        subscriptionId: subscriptions.find(
          (subscription) => subscription.instance_id === values.instanceId,
        )?.id,
        planId: values.planId,
        billingInterval: values.billingInterval,
        periodStart: new Date(values.periodStart).toISOString(),
        periodEnd: new Date(values.periodEnd).toISOString(),
        dueAt: new Date(values.dueAt).toISOString(),
        subtotal: Number(values.subtotal),
        tax: Number(values.tax),
        currency: values.currency,
      });
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo emitir.");
    }
  }
  async function savePayment(event: FormEvent) {
    event.preventDefault();
    try {
      await centralApi.registerPayment({
        instanceId: paymentValues.instanceId,
        amount: Number(paymentValues.amount),
        currency: paymentValues.currency,
        paymentMethod: paymentValues.paymentMethod,
        reference: paymentValues.reference || undefined,
        paidAt: new Date(paymentValues.paidAt).toISOString(),
        notes: paymentValues.notes || undefined,
      });
      setPaymentOpen(false);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo registrar el pago.",
      );
    }
  }
  function openPaymentReview(payment:Payment,mode:'confirm'|'reject'){
    setReviewingPayment(payment);setReviewMode(mode);setReviewReason('');setError('');
    const eligible=items.filter(invoice=>invoice.instance_id===payment.instance_id&&['ISSUED','PARTIALLY_PAID','OVERDUE'].includes(invoice.status));
    const invoice=eligible[0];setReviewInvoiceId(invoice?.id||'');
    const available=Number(payment.amount)-Number(payment.amount_applied),pending=invoice?Number(invoice.total)-Number(invoice.amount_paid):0;
    setReviewAmount(String(Math.max(0,Math.min(available,pending))));
  }
  function chooseReviewInvoice(id:string){setReviewInvoiceId(id);const invoice=items.find(x=>x.id===id);if(reviewingPayment&&invoice){setReviewAmount(String(Math.max(0,Math.min(Number(reviewingPayment.amount)-Number(reviewingPayment.amount_applied),Number(invoice.total)-Number(invoice.amount_paid)))))} }
  async function reviewPayment(event:FormEvent) {
    event.preventDefault();if(!reviewingPayment)return;setReviewBusy(true);setError('');
    try {
      if (reviewMode==='reject') {
        await centralApi.verifyPayment(reviewingPayment.id, {confirmed:false,reason:reviewReason});
      } else {
        await centralApi.verifyPayment(reviewingPayment.id,{confirmed:true,invoiceId:reviewInvoiceId,amountApplied:Number(reviewAmount)});
      }
      setReviewingPayment(null);await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo verificar el pago.",
      );
    } finally {setReviewBusy(false)}
  }
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Facturación y pagos</h2>
          <p className="muted">
            Facturas internas; no reemplazan comprobantes electrónicos SUNAT.
          </p>
        </div>
        <button
          className="primary"
          disabled={!plans.length || !instances.length}
          onClick={() => setOpen(true)}
        >
          <Plus />
          Emitir factura
        </button>
        <button
          className="secondary"
          disabled={!instances.length}
          onClick={() => setPaymentOpen(true)}
        >
          <Plus />
          Registrar pago
        </button>
      </div>
      {open ? (
        <form className="inline-form crud-form crud-compact" onSubmit={save}>
          <div className="crud-form-head wide"><div><h3>Emitir factura</h3><p>Selecciona la instancia, periodo e importes que quedarán congelados.</p></div></div>
          <select
            required
            onChange={(e) =>
              setValues({ ...values, instanceId: e.target.value })
            }
          >
            <option value="">Instancia</option>
            {instances.map((x) => (
              <option key={x.id} value={x.id}>
                {x.fqdn}
              </option>
            ))}
          </select>
          <select
            required
            onChange={(e) => setValues({ ...values, planId: e.target.value })}
          >
            <option value="">Plan</option>
            {plans.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {[
            ["periodStart", "Inicio"],
            ["periodEnd", "Fin"],
            ["dueAt", "Vence"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required
                type="date"
                onChange={(e) =>
                  setValues({ ...values, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <input
            required
            type="number"
            min="0"
            step="0.01"
            placeholder="Subtotal"
            onChange={(e) => setValues({ ...values, subtotal: e.target.value })}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Impuesto"
            value={values.tax}
            onChange={(e) => setValues({ ...values, tax: e.target.value })}
          />
          <button className="primary">Emitir</button>
          <button
            type="button"
            className="secondary"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </button>
        </form>
      ) : null}
      {paymentOpen ? (
        <form className="inline-form crud-form crud-compact" onSubmit={savePayment}>
          <div className="crud-form-head wide"><div><h3>Registrar pago</h3><p>El pago quedará pendiente de verificación antes de renovar la membresía.</p></div></div>
          <select
            required
            onChange={(e) =>
              setPaymentValues({ ...paymentValues, instanceId: e.target.value })
            }
          >
            <option value="">Cliente / instancia</option>
            {instances.map((instance) => (
              <option key={instance.id} value={instance.id}>
                {instance.fqdn}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Monto"
            onChange={(e) =>
              setPaymentValues({ ...paymentValues, amount: e.target.value })
            }
          />
          <select
            value={paymentValues.paymentMethod}
            onChange={(e) =>
              setPaymentValues({
                ...paymentValues,
                paymentMethod: e.target.value,
              })
            }
          >
            <option value="TRANSFER">Transferencia</option>
            <option value="YAPE">Yape</option>
            <option value="PLIN">Plin</option>
            <option value="CASH">Efectivo</option>
            <option value="OTHER">Otro</option>
          </select>
          <input
            placeholder="Referencia"
            onChange={(e) =>
              setPaymentValues({ ...paymentValues, reference: e.target.value })
            }
          />
          <label>
            Fecha del pago
            <input
              required
              type="date"
              onChange={(e) =>
                setPaymentValues({ ...paymentValues, paidAt: e.target.value })
              }
            />
          </label>
          <button className="primary">Registrar pendiente</button>
          <button
            type="button"
            className="secondary"
            onClick={() => setPaymentOpen(false)}
          >
            Cancelar
          </button>
        </form>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
      <Table
        headers={[
          "Número",
          "Cliente",
          "Plan",
          "Total",
          "Pagado",
          "Estado",
          "Vence",
        ]}
        rows={items.map((x) => [
          x.invoice_number,
          x.customer_name,
          x.plan_name,
          x.currency + " " + Number(x.total).toFixed(2),
          x.currency + " " + Number(x.amount_paid).toFixed(2),
          x.status,
          new Date(x.due_at).toLocaleDateString("es-PE"),
        ])}
      />
      <h3>Pagos recibidos</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Monto</th>
              <th>Aplicado</th>
              <th>Método</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.customer_name}</td>
                <td>
                  {payment.currency + " " + Number(payment.amount).toFixed(2)}
                </td>
                <td>
                  {payment.currency +
                    " " +
                    Number(payment.amount_applied).toFixed(2)}
                </td>
                <td>{payment.payment_method}</td>
                <td>{payment.status}</td>
                <td>
                  {["PENDING_VERIFICATION", "CONFIRMED"].includes(
                    payment.status,
                  ) ? (
                    <>
                      <button onClick={() => openPaymentReview(payment, 'confirm')}>
                        Confirmar / aplicar
                      </button>
                      {payment.status === "PENDING_VERIFICATION" ? (
                        <button onClick={() => openPaymentReview(payment, 'reject')}>
                          Rechazar
                        </button>
                      ) : null}
                    </>
                  ) : (
                    payment.rejection_reason || "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!payments.length ? (
          <div className="empty">Sin pagos registrados.</div>
        ) : null}
      </div>
      {reviewingPayment?<form className="crud-form payment-review" onSubmit={reviewPayment}><div className="crud-form-head"><div><h3>{reviewMode==='confirm'?'Confirmar y aplicar pago':'Rechazar pago'}</h3><p>{reviewingPayment.customer_name} · {reviewingPayment.currency} {Number(reviewingPayment.amount).toFixed(2)} · {reviewingPayment.payment_method}</p></div><span className="required-note">* Obligatorio</span></div><fieldset><legend>Decisión de verificación</legend><div className="crud-grid">{reviewMode==='confirm'?<><label className="form-field wide"><span>Factura pendiente <b>*</b></span><select required value={reviewInvoiceId} onChange={e=>chooseReviewInvoice(e.target.value)}><option value="">Selecciona una factura</option>{items.filter(x=>x.instance_id===reviewingPayment.instance_id&&['ISSUED','PARTIALLY_PAID','OVERDUE'].includes(x.status)).map(x=><option key={x.id} value={x.id}>{x.invoice_number} · pendiente {x.currency} {(Number(x.total)-Number(x.amount_paid)).toFixed(2)} · {x.status}</option>)}</select><small>Sólo aparecen facturas pendientes del mismo cliente y moneda.</small></label><label className="form-field"><span>Monto a aplicar <b>*</b></span><input type="number" min="0.01" step="0.01" required value={reviewAmount} onChange={e=>setReviewAmount(e.target.value)}/><small>Disponible del pago: {reviewingPayment.currency} {(Number(reviewingPayment.amount)-Number(reviewingPayment.amount_applied)).toFixed(2)}</small></label></>:<label className="form-field wide"><span>Motivo del rechazo <b>*</b></span><textarea required minLength={8} maxLength={500} rows={4} value={reviewReason} onChange={e=>setReviewReason(e.target.value)} placeholder="Explica qué dato o evidencia debe corregirse."/><small>Se guardará para auditoría y se incluirá en el aviso al cliente.</small></label>}</div></fieldset><div className="form-actions"><button type="button" className="secondary" onClick={()=>setReviewingPayment(null)}>Cancelar</button><button className={reviewMode==='reject'?'danger':'primary'} disabled={reviewBusy|| (reviewMode==='confirm'&&!reviewInvoiceId)}>{reviewBusy?'Procesando…':reviewMode==='confirm'?'Confirmar pago':'Rechazar pago'}</button></div></form>:null}
    </section>
  );
}
function CommunicationsPanel() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      centralApi
        .communications()
        .then(setItems)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function retry(id: string) {
    try {
      await centralApi.retryDelivery(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reintentar.");
    }
  }
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Comunicaciones</h2>
          <p className="muted">
            Trazabilidad de correos de bienvenida, manuales y avisos.
          </p>
        </div>
        <button className="secondary" onClick={load}>
          <RefreshCw />
          Actualizar
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Destinatario</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Intentos</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x) => (
              <tr key={x.id}>
                <td>{x.recipient}</td>
                <td>{x.template_key}</td>
                <td>{x.status}</td>
                <td>{x.attempts}</td>
                <td>
                  {x.last_error_code || x.delivered_at || "Pendiente"}{" "}
                  {x.status === "FAILED" ? (
                    <button onClick={() => retry(x.id)}>Reintentar</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? (
          <div className="empty">Sin comunicaciones registradas.</div>
        ) : null}
      </div>
    </section>
  );
}
function SettingsPanel() {
  return (
    <div className="settings-stack">
      <CommercialSettings />
      <TemplateSettings />
      <SmtpSettings />
      <TelegramSettings />
    </div>
  );
}
function TemplateSettings(){
  const [items,setItems]=useState<any[]>([]);const [selectedKey,setSelectedKey]=useState('CUSTOMER_WELCOME');const [item,setItem]=useState<any>(null);const [allowed,setAllowed]=useState<string[]>([]);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [preview,setPreview]=useState<{subject:string;body:string}|null>(null);const [testRecipient,setTestRecipient]=useState('');const [testing,setTesting]=useState(false);
  const labels:Record<string,string>={CUSTOMER_WELCOME:'Bienvenida y activación',SUBSCRIPTION_RENEWED:'Membresía renovada',SUBSCRIPTION_GRACE_STARTED:'Periodo de gracia',SUBSCRIPTION_SUSPENDED:'Membresía suspendida',SUBSCRIPTION_REACTIVATED:'Membresía reactivada',SUBSCRIPTION_CANCELLED:'Membresía cancelada',SUBSCRIPTION_EXPIRED:'Membresía vencida',INVOICE_ISSUED:'Factura emitida',INVOICE_OVERDUE:'Factura vencida',PAYMENT_CONFIRMED:'Pago confirmado',PAYMENT_REJECTED:'Pago rechazado'};
  const load=useCallback(async(key=selectedKey)=>{try{const x=await centralApi.templates();setItems(x.templates);setAllowed(x.allowedVariables);setItem(x.templates.find(t=>t.template_key===key)||x.templates[0]||null)}catch(e){setMessage(e instanceof Error?e.message:'No se pudieron cargar las plantillas')}},[selectedKey]);
  useEffect(()=>{void load()},[load]);
  function choose(key:string){setSelectedKey(key);setItem(items.find(t=>t.template_key===key)||null);setMessage('');setPreview(null)}
  async function save(e:FormEvent){e.preventDefault();if(!item)return;setBusy(true);setMessage('');try{await centralApi.saveTemplate(item.template_key,{channel:'EMAIL',locale:'es-PE',subject:item.subject_template,body:item.body_text_template});setMessage('Nueva versión guardada correctamente.');await load(item.template_key)}catch(e){setMessage(e instanceof Error?e.message:'No se pudo guardar')}finally{setBusy(false)}}
  async function showPreview(){if(!item)return;try{setPreview(await centralApi.previewTemplate(item.template_key,{channel:'EMAIL',locale:'es-PE',subject:item.subject_template,body:item.body_text_template}));setMessage('')}catch(e){setMessage(e instanceof Error?e.message:'No se pudo generar la vista previa')}}
  async function sendTest(){if(!item||!testRecipient)return;setTesting(true);setMessage('');try{await centralApi.testTemplate(item.template_key,{channel:'EMAIL',locale:'es-PE',subject:item.subject_template,body:item.body_text_template,recipient:testRecipient});setMessage('Correo de prueba enviado correctamente.')}catch(e){setMessage(e instanceof Error?e.message:'No se pudo enviar la prueba')}finally{setTesting(false)}}
  return <section className="card template-manager"><div className="card-head"><div><h2>Plantillas de comunicaciones</h2><p className="muted">Personaliza los correos transaccionales. Cada guardado crea una versión nueva y conserva el historial.</p></div><span className="status-pill active">{items.length} activas</span></div><div className="template-layout"><nav className="template-list" aria-label="Tipos de comunicación">{items.map(t=><button type="button" key={t.template_key} className={t.template_key===item?.template_key?'selected':''} onClick={()=>choose(t.template_key)}><span>{labels[t.template_key]||t.template_key}</span><small>Versión {t.version}</small></button>)}</nav>{item?<form className="crud-form template-editor" onSubmit={save}><div className="crud-form-head"><div><h3>{labels[item.template_key]||item.template_key}</h3><p>Clave interna: {item.template_key}</p></div><strong>v{item.version}</strong></div><fieldset><legend>Contenido del correo</legend><div className="crud-grid"><label className="form-field wide"><span>Asunto <b>*</b></span><input required maxLength={250} value={item.subject_template||''} onChange={e=>{setItem({...item,subject_template:e.target.value});setPreview(null)}}/><small>Usa un asunto breve y reconocible para el cliente.</small></label><label className="form-field wide"><span>Contenido en texto <b>*</b></span><textarea required minLength={20} maxLength={20000} rows={12} value={item.body_text_template||''} onChange={e=>{setItem({...item,body_text_template:e.target.value});setPreview(null)}}/><small>Las variables se reemplazarán al enviar el correo.</small></label></div></fieldset><details className="variable-help"><summary>Variables permitidas</summary><div>{allowed.map(x=><code key={x}>{'{{'+x+'}}'}</code>)}</div></details><div className="template-test"><label className="form-field"><span>Destinatario de prueba</span><input type="email" value={testRecipient} onChange={e=>setTestRecipient(e.target.value)} placeholder="correo@ejemplo.com"/><small>El asunto llevará el prefijo [PRUEBA].</small></label><button type="button" className="secondary" onClick={showPreview}>Vista previa</button><button type="button" className="secondary" disabled={!testRecipient||testing} onClick={sendTest}>{testing?'Enviando…':'Enviar prueba'}</button></div>{preview?<div className="mail-preview"><strong>{preview.subject}</strong><pre>{preview.body}</pre></div>:null}<div className="form-actions"><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar nueva versión'}</button></div></form>:<p className="muted">Cargando plantillas…</p>}</div>{message?<p role="status" className={message.includes('correctamente')?'success-note':'muted'}>{message}</p>:null}</section>
}
function CommercialSettings(){
  const [v,setV]=useState<Record<string,any>>({});const [message,setMessage]=useState("");
  useEffect(()=>{centralApi.getCommercialSettings().then(x=>setV({legalName:x.legal_name,taxId:x.tax_id||"",billingEmail:x.billing_email||"",address:x.address||"",invoicePrefix:x.invoice_prefix,defaultCurrency:x.default_currency,defaultTaxPercent:Number(x.default_tax_percent),invoiceDueDays:x.invoice_due_days,graceDays:x.grace_days,paymentInstructions:x.payment_instructions||"",brandName:x.brand_name,supportEmail:x.support_email||"",version:x.version})).catch(e=>setMessage(e.message))},[]);
  async function save(e:FormEvent){e.preventDefault();setMessage("");try{const x=await centralApi.saveCommercialSettings({...v,defaultTaxPercent:Number(v.defaultTaxPercent),invoiceDueDays:Number(v.invoiceDueDays),graceDays:Number(v.graceDays)});setV({...v,version:x.version});setMessage("Identidad y políticas comerciales guardadas.")}catch(e){setMessage(e instanceof Error?e.message:"No se pudo guardar")}}
  const field=(key:string,label:string,type="text")=><label><span>{label}</span><input type={type} required={['legalName','invoicePrefix','defaultCurrency','brandName'].includes(key)} value={v[key]??""} onChange={e=>setV({...v,[key]:e.target.value})}/></label>;
  return <section className="card"><div className="card-head"><div><h2>Identidad comercial y facturación</h2><p className="muted">Datos que se congelarán en cada factura y comunicación emitida.</p></div><strong>v{v.version||1}</strong></div><form className="inline-form smtp-form" onSubmit={save}>{field('brandName','Marca')}{field('legalName','Razón social')}{field('taxId','RUC / identificación')}{field('billingEmail','Correo de facturación','email')}{field('supportEmail','Correo de soporte','email')}{field('address','Dirección')}{field('invoicePrefix','Prefijo de factura')}{field('defaultCurrency','Moneda predeterminada')}{field('defaultTaxPercent','Impuesto %','number')}{field('invoiceDueDays','Días para vencimiento','number')}{field('graceDays','Días de gracia','number')}<label className="wide"><span>Instrucciones y medios de pago</span><textarea rows={4} value={v.paymentInstructions||""} onChange={e=>setV({...v,paymentInstructions:e.target.value})} placeholder="Banco, cuenta, Yape/Plin, referencia requerida..."/></label><button className="primary">Guardar configuración comercial</button></form>{message?<p className="muted" role="status">{message}</p>:null}</section>
}
function TelegramSettings() {
  const [provider, setProvider] = useState<any>(null);
  const [values, setValues] = useState<Record<string, any>>({
    enabled: true,
    eventSeverity: "WARNING",
  });
  const [message, setMessage] = useState("");
  useEffect(() => {
    centralApi
      .getTelegram()
      .then((p) => {
        setProvider(p);
        setValues((v) => ({ ...v, ...p.config, botToken: "" }));
      })
      .catch((e) => setMessage(e.message));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      const { adminPassword, adminTotp, ...config } = values;
      setProvider(
        await centralApi.saveTelegram({
          config,
          reauth: { password: adminPassword, totp: adminTotp },
        }),
      );
      setValues({ ...values, botToken: "", adminPassword: "", adminTotp: "" });
      setMessage("Telegram administrativo guardado.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo guardar.",
      );
    }
  }
  async function test() {
    try {
      await centralApi.testTelegram();
      setMessage("Mensaje de prueba entregado.");
      setProvider(await centralApi.getTelegram());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falló la prueba.");
    }
  }
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Telegram administrativo</h2>
          <p className="muted">
            Alertas de activación, vencimientos, comunicaciones fallidas y salud
            de instancias.
          </p>
        </div>
        <strong>{provider?.status || "Cargando"}</strong>
      </div>
      <form className="inline-form smtp-form" onSubmit={save}>
        <input
          required
          placeholder="Chat ID administrativo"
          value={values.chatId || ""}
          onChange={(e) => setValues({ ...values, chatId: e.target.value })}
        />
        <input
          required={!provider?.configured}
          type="password"
          placeholder={
            provider?.configured ? "Nuevo token (opcional)" : "Token del bot"
          }
          value={values.botToken || ""}
          onChange={(e) => setValues({ ...values, botToken: e.target.value })}
        />
        <select
          value={values.eventSeverity}
          onChange={(e) =>
            setValues({ ...values, eventSeverity: e.target.value })
          }
        >
          <option value="ALL">Todos los eventos</option>
          <option value="WARNING">Advertencias y críticos</option>
          <option value="CRITICAL">Solo críticos</option>
        </select>
        <input
          required
          type="password"
          autoComplete="current-password"
          placeholder="Tu contraseña administrativa"
          value={values.adminPassword || ""}
          onChange={(e) =>
            setValues({ ...values, adminPassword: e.target.value })
          }
        />
        <input
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="Código MFA"
          value={values.adminTotp || ""}
          onChange={(e) =>
            setValues({
              ...values,
              adminTotp: e.target.value.replace(/\D/g, ""),
            })
          }
        />
        <button className="primary">Guardar</button>
        <button
          type="button"
          className="secondary"
          disabled={!provider?.configured}
          onClick={test}
        >
          Enviar prueba
        </button>
      </form>
      {message ? (
        <p className="muted" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
function SmtpSettings() {
  const [provider, setProvider] = useState<any>(null);
  const [values, setValues] = useState<Record<string, any>>({
    port: 587,
    secure: false,
    enabled: true,
  });
  const [message, setMessage] = useState("");
  useEffect(() => {
    centralApi
      .getSmtp()
      .then((p) => {
        setProvider(p);
        setValues((v) => ({ ...v, ...p.config, password: "" }));
      })
      .catch((e) => setMessage(e.message));
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      const {
        adminPassword,
        adminTotp,
        testRecipient: _testRecipient,
        ...config
      } = values;
      setProvider(
        await centralApi.saveSmtp({
          config: { ...config, port: Number(values.port) },
          reauth: { password: adminPassword, totp: adminTotp },
        }),
      );
      setValues({ ...values, password: "", adminPassword: "", adminTotp: "" });
      setMessage("Configuración guardada de forma segura.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }
  async function test() {
    try {
      await centralApi.testSmtp(values.testRecipient);
      setMessage("Correo de prueba entregado.");
      setProvider(await centralApi.getSmtp());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falló la prueba.");
    }
  }
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Correo de Joinpoint Central</h2>
          <p className="muted">
            Para altas, manuales, activaciones y avisos comerciales. La
            contraseña nunca vuelve al navegador.
          </p>
        </div>
        <strong>{provider?.status || "Cargando"}</strong>
      </div>
      <form className="inline-form smtp-form" onSubmit={save}>
        {[
          ["host", "Servidor SMTP"],
          ["port", "Puerto"],
          ["username", "Usuario"],
          [
            "password",
            provider?.configured ? "Nueva contraseña (opcional)" : "Contraseña",
          ],
          ["fromName", "Nombre remitente"],
          ["fromEmail", "Correo remitente"],
          ["replyTo", "Responder a"],
        ].map(([key, label]) => (
          <input
            key={key}
            type={
              key === "password"
                ? "password"
                : key.includes("Email") || key === "replyTo"
                  ? "email"
                  : key === "port"
                    ? "number"
                    : "text"
            }
            required={
              !["username", "replyTo", "password"].includes(key) ||
              !provider?.configured
            }
            placeholder={label}
            value={values[key] || ""}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
          />
        ))}
        <label>
          <input
            type="checkbox"
            checked={Boolean(values.secure)}
            onChange={(e) => setValues({ ...values, secure: e.target.checked })}
          />{" "}
          TLS directo
        </label>
        <input
          required
          type="password"
          autoComplete="current-password"
          placeholder="Tu contraseña administrativa"
          value={values.adminPassword || ""}
          onChange={(e) =>
            setValues({ ...values, adminPassword: e.target.value })
          }
        />
        <input
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="Código MFA de 6 dígitos"
          value={values.adminTotp || ""}
          onChange={(e) =>
            setValues({
              ...values,
              adminTotp: e.target.value.replace(/\D/g, ""),
            })
          }
        />
        <button className="primary">Guardar</button>
      </form>
      <div className="inline-form test-mail">
        <input
          type="email"
          placeholder="Destinatario de prueba"
          value={values.testRecipient || ""}
          onChange={(e) =>
            setValues({ ...values, testRecipient: e.target.value })
          }
        />
        <button
          type="button"
          className="secondary"
          disabled={!values.testRecipient}
          onClick={test}
        >
          Enviar prueba
        </button>
      </div>
      {message ? (
        <p role="status" className="muted">
          {message}
        </p>
      ) : null}
    </section>
  );
}
function InstanceForm({
  customers,
  plans,
  done,
}: {
  customers: Customer[];
  plans: Plan[];
  done: () => void;
}) {
  const initialStart = new Date();
  const initialEnd = new Date(initialStart.getTime() + 30 * 86400000);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({
    customerId: customers[0]?.id || "",
    planId: plans[0]?.id || "",
    status: "ACTIVE",
    startsAt: initialStart.toISOString().slice(0, 10),
    endsAt: initialEnd.toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activation, setActivation] = useState<{
    code: string;
    expiresAt: string;
    welcome?: string;
  } | null>(null);
  if (!customers.length || !plans.length)
    return (
      <button className="primary" disabled>
        <Plus />
        Primero crea un cliente y un plan
      </button>
    );
  if (!open)
    return (
      <button className="primary" onClick={() => setOpen(true)}>
        <Plus />
        Alta completa
      </button>
    );
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const issued = await centralApi.onboard({
        customerId: values.customerId,
        planId: values.planId,
        status: values.status as "TRIAL" | "ACTIVE",
        startsAt: new Date(values.startsAt + "T00:00:00-05:00").toISOString(),
        endsAt: new Date(values.endsAt + "T23:59:59-05:00").toISOString(),
        ttlHours: 24,
        subdomainLabel: values.subdomainLabel || undefined,
        publicIp: values.publicIp || undefined,
      });
      setActivation({
        code: issued.activation.code,
        expiresAt: issued.activation.expiresAt,
        welcome: issued.welcome?.queued
          ? "Correo de bienvenida procesado."
          : issued.welcome?.reason || "Correo pendiente.",
      });
      done();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar el alta.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (activation)
    return (
      <div className="activation-result">
        <strong>Alta preparada</strong>
        <p>Guarda este código: solo se muestra una vez.</p>
        <code>{activation.code}</code>
        <p>{activation.welcome}</p>
        <button
          className="secondary"
          onClick={() => {
            setActivation(null);
            setOpen(false);
          }}
        >
          Cerrar
        </button>
      </div>
    );
  return (
    <form className="onboarding-form crud-form" onSubmit={save}>
      <div className="crud-form-head wide"><div><h3>Alta completa del cliente</h3><p>Crea la instancia, asigna la membresía y genera el código en una sola operación segura.</p></div><span className="required-note">* Obligatorio</span></div>
      <select
        required
        value={values.customerId}
        onChange={(e) => setValues({ ...values, customerId: e.target.value })}
      >
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.display_name}
          </option>
        ))}
      </select>
      <select
        required
        value={values.planId}
        onChange={(e) => setValues({ ...values, planId: e.target.value })}
      >
        {plans
          .filter((plan) => plan.is_active)
          .map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
      </select>
      <select
        value={values.status}
        onChange={(e) => setValues({ ...values, status: e.target.value })}
      >
        <option value="ACTIVE">Activa</option>
        <option value="TRIAL">Prueba</option>
      </select>
      <input
        placeholder="Subdominio (automático si queda vacío)"
        value={values.subdomainLabel || ""}
        onChange={(e) =>
          setValues({ ...values, subdomainLabel: e.target.value })
        }
      />
      <input
        placeholder="IP pública del VPS"
        value={values.publicIp || ""}
        onChange={(e) => setValues({ ...values, publicIp: e.target.value })}
      />
      <label>
        Inicio
        <input
          required
          type="date"
          value={values.startsAt}
          onChange={(e) => setValues({ ...values, startsAt: e.target.value })}
        />
      </label>
      <label>
        Vencimiento
        <input
          required
          type="date"
          value={values.endsAt}
          onChange={(e) => setValues({ ...values, endsAt: e.target.value })}
        />
      </label>
      {error ? <div className="error">{error}</div> : null}
      <button className="primary" disabled={busy}>
        {busy ? "Preparando…" : "Crear, licenciar y enviar manual"}
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => setOpen(false)}
      >
        Cancelar
      </button>
    </form>
  );
}
function QuickCreate({
  label,
  fields,
  defaults = {},
  map = (x) => x,
  submit,
  done,
}: {
  label: string;
  fields: string[][];
  defaults?: Record<string, string>;
  map?: (x: any) => any;
  submit: (x: any) => Promise<unknown>;
  done: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await submit(
        map(Object.fromEntries(Object.entries(values).filter(([, v]) => v))),
      );
      setOpen(false);
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button className="primary" onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </button>
    );
  const optional = [
    "taxId",
    "description",
    "subdomainLabel",
    "publicIp",
    "contactPhone",
    "annual",
  ];
  return (
    <form className="inline-form" onSubmit={save}>
      {fields.map(([key, text]) => (
        <input
          key={key}
          required={!optional.includes(key)}
          type={
            key.toLowerCase().includes("email")
              ? "email"
              : key === "monthly" || key === "annual"
                ? "number"
                : "text"
          }
          min={key === "monthly" || key === "annual" ? "0" : undefined}
          step={key === "monthly" || key === "annual" ? "0.01" : undefined}
          placeholder={text}
          value={values[key] || ""}
          onChange={(e) => setValues({ ...values, [key]: e.target.value })}
        />
      ))}
      {error ? <span className="error">{error}</span> : null}
      <button className="primary" disabled={busy}>
        {busy ? "Guardando…" : "Guardar"}
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => setOpen(false)}
      >
        Cancelar
      </button>
    </form>
  );
}
