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
        <Table
          headers={[
            "Nombre",
            "Razón social",
            "Responsable",
            "Correo",
            "Estado",
          ]}
          rows={customers.map((x) => [
            x.display_name,
            x.legal_name,
            x.contact_name || "—",
            x.contact_email || "—",
            x.status,
          ])}
        />
      </Resource>
    );
  if (tab === "plans")
    return (
      <Resource
        title="Planes"
        action={<PlanForm done={reload} />}
        empty="Todavía no hay planes."
      >
        <Table
          headers={[
            "Código",
            "Nombre",
            "Mensual",
            "Anual",
            "Capacidades",
            "Estado",
          ]}
          rows={plans.map((x) => [
            x.code,
            x.name,
            formatPlanPrice(x, "MONTH"),
            formatPlanPrice(x, "YEAR"),
            String(x.entitlements.filter((item) => item.enabled).length),
            x.is_active ? "Activo" : "Archivado",
          ])}
        />
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
function CustomerForm({ done }: { done: () => void }) {
  return (
    <QuickCreate
      label="Nuevo cliente"
      fields={[
        ["legalName", "Razón social"],
        ["displayName", "Nombre visible"],
        ["taxId", "RUC / identificación"],
        ["contactName", "Nombre del responsable"],
        ["contactEmail", "Correo del responsable"],
        ["contactPhone", "Teléfono"],
      ]}
      map={(v) => ({
        legalName: v.legalName,
        displayName: v.displayName,
        taxId: v.taxId,
        contact: {
          fullName: v.contactName,
          email: v.contactEmail,
          phone: v.contactPhone,
        },
      })}
      submit={centralApi.createCustomer}
      done={done}
    />
  );
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
    <form className="plan-editor" onSubmit={save}>
      <div className="form-grid">
        <input
          required
          placeholder="Código"
          onChange={(e) => setValues({ ...values, code: e.target.value })}
        />
        <input
          required
          placeholder="Nombre comercial"
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
        <input
          placeholder="Descripción"
          onChange={(e) =>
            setValues({ ...values, description: e.target.value })
          }
        />
        <select
          value={values.currency}
          onChange={(e) => setValues({ ...values, currency: e.target.value })}
        >
          <option value="PEN">Soles (PEN)</option>
          <option value="USD">Dólares (USD)</option>
        </select>
        <input
          required
          type="number"
          min="0"
          step="0.01"
          placeholder="Precio mensual"
          onChange={(e) => setValues({ ...values, monthly: e.target.value })}
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Precio anual (opcional)"
          onChange={(e) => setValues({ ...values, annual: e.target.value })}
        />
      </div>
      <h4>Capacidades incluidas</h4>
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
      {error ? <div className="error">{error}</div> : null}
      <div className="form-actions">
        <button className="primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar plan"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
function SubscriptionPanel() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [error, setError] = useState("");
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
  async function action(item: Subscription, action: string) {
    let body: Record<string, unknown> = {
      action,
      version: Number(item.version),
    };
    if (action === "RENEW") body.months = 1;
    if (["SUSPEND", "CANCEL", "GRANT_GRACE"].includes(action)) {
      const reason = window.prompt("Indica el motivo (mínimo 8 caracteres):");
      if (!reason) return;
      body.reason = reason;
    }
    if (action === "GRANT_GRACE") {
      const value = window.prompt("Fecha final de gracia (AAAA-MM-DD):");
      if (!value) return;
      body.graceEndsAt = new Date(value + "T23:59:59-05:00").toISOString();
    }
    try {
      await centralApi.transitionSubscription(item.id, body);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }
  return (
    <section className="card">
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
                <td>{item.status}</td>
                <td>{new Date(item.ends_at).toLocaleDateString("es-PE")}</td>
                <td className="row-actions">
                  <button onClick={() => action(item, "RENEW")}>
                    Renovar 1 mes
                  </button>
                  <button onClick={() => action(item, "GRANT_GRACE")}>
                    Dar gracia
                  </button>
                  {item.status === "SUSPENDED" ? (
                    <button onClick={() => action(item, "REACTIVATE")}>
                      Reactivar
                    </button>
                  ) : (
                    <button onClick={() => action(item, "SUSPEND")}>
                      Suspender
                    </button>
                  )}
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
  async function reviewPayment(payment: Payment, confirmed: boolean) {
    try {
      if (!confirmed) {
        const reason = window.prompt(
          "Motivo del rechazo (mínimo 8 caracteres):",
        );
        if (!reason) return;
        await centralApi.verifyPayment(payment.id, {
          confirmed: false,
          reason,
        });
      } else {
        const eligible = items.filter(
          (invoice) =>
            invoice.instance_id === payment.instance_id &&
            ["ISSUED", "PARTIALLY_PAID"].includes(invoice.status),
        );
        if (!eligible.length) {
          setError("No existe una factura pendiente para este pago.");
          return;
        }
        const invoiceNumber = window.prompt(
          "Número de factura:",
          eligible[0].invoice_number,
        );
        const invoice = eligible.find(
          (item) => item.invoice_number === invoiceNumber,
        );
        if (!invoice) return;
        const remainingPayment =
            Number(payment.amount) - Number(payment.amount_applied),
          remainingInvoice =
            Number(invoice.total) - Number(invoice.amount_paid);
        const proposed = Math.min(remainingPayment, remainingInvoice);
        const amount = window.prompt("Monto a aplicar:", String(proposed));
        if (!amount) return;
        await centralApi.verifyPayment(payment.id, {
          confirmed: true,
          invoiceId: invoice.id,
          amountApplied: Number(amount),
        });
      }
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo verificar el pago.",
      );
    }
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
        <form className="inline-form" onSubmit={save}>
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
        <form className="inline-form" onSubmit={savePayment}>
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
                      <button onClick={() => reviewPayment(payment, true)}>
                        Confirmar / aplicar
                      </button>
                      {payment.status === "PENDING_VERIFICATION" ? (
                        <button onClick={() => reviewPayment(payment, false)}>
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
function TemplateSettings(){const [item,setItem]=useState<any>(null);const [allowed,setAllowed]=useState<string[]>([]);const [message,setMessage]=useState("");useEffect(()=>{centralApi.templates().then(x=>{setItem(x.templates.find(t=>t.template_key==='CUSTOMER_WELCOME'));setAllowed(x.allowedVariables)}).catch(e=>setMessage(e.message))},[]);async function save(e:FormEvent){e.preventDefault();try{await centralApi.saveTemplate('CUSTOMER_WELCOME',{channel:'EMAIL',locale:'es-PE',subject:item.subject_template,body:item.body_text_template});setMessage('Nueva versión de la plantilla guardada.');const x=await centralApi.templates();setItem(x.templates.find(t=>t.template_key==='CUSTOMER_WELCOME'))}catch(e){setMessage(e instanceof Error?e.message:'No se pudo guardar')}}return <section className="card"><div className="card-head"><div><h2>Plantilla de bienvenida</h2><p className="muted">Correo enviado al crear la instancia y emitir su activación.</p></div><strong>v{item?.version||1}</strong></div>{item?<form className="inline-form smtp-form" onSubmit={save}><label className="wide"><span>Asunto</span><input required value={item.subject_template||''} onChange={e=>setItem({...item,subject_template:e.target.value})}/></label><label className="wide"><span>Contenido en texto</span><textarea required rows={12} value={item.body_text_template||''} onChange={e=>setItem({...item,body_text_template:e.target.value})}/></label><p className="muted wide">Variables permitidas: {allowed.map(x=>'{{'+x+'}}').join(', ')}</p><button className="primary">Guardar nueva versión</button></form>:<p className="muted">Cargando plantilla…</p>}{message?<p role="status" className="muted">{message}</p>:null}</section>}
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
    <form className="onboarding-form" onSubmit={save}>
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
