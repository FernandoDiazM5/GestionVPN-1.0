export type Admin = { id: string; email: string; displayName: string };
export type Customer = {
  id: string;
  legal_name: string;
  display_name: string;
  tax_id?: string;
  status: string;
  created_at: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  version: number;
};
export type PlanEntitlement = {
  feature_key: string;
  enabled: boolean;
  numeric_limit?: number | null;
};
export type PlanPrice = {
  billing_interval: "MONTH" | "YEAR";
  currency: string;
  amount: string | number;
};
export type Plan = {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  version: number;
  entitlements: PlanEntitlement[];
  prices: PlanPrice[];
};
export type Instance = {
  id: string;
  customer_id: string;
  fqdn: string;
  public_ip?: string;
  status: string;
  management_pool_cidr: string;
  created_at: string;
};
export type SmtpProvider = {
  type: "SMTP";
  displayName?: string;
  status: string;
  configured: boolean;
  config?: {
    host: string;
    port: number;
    secure: boolean;
    username?: string;
    fromName: string;
    fromEmail: string;
    replyTo?: string;
  };
  lastTestedAt?: string;
  lastSuccessAt?: string;
  lastErrorCode?: string;
  version?: number;
};
export type Subscription = {
  id: string;
  instance_id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  grace_ends_at?: string;
  version: number;
  plan_name: string;
  customer_name: string;
  subdomain_label: string;
};
export type Invoice = {
  id: string;
  invoice_number: string;
  instance_id: string;
  status: string;
  total: string | number;
  amount_paid: string | number;
  currency: string;
  due_at: string;
  customer_name: string;
  plan_name: string;
};
export type Delivery = {
  id: string;
  recipient: string;
  template_key: string;
  status: string;
  attempts: number;
  next_attempt_at: string;
  delivered_at?: string;
  last_error_code?: string;
};
export type Payment = {
  id: string;
  instance_id: string;
  customer_name: string;
  amount: string | number;
  amount_applied: string | number;
  currency: string;
  payment_method: string;
  reference?: string;
  paid_at: string;
  status: string;
  rejection_reason?: string;
};

const CSRF_KEY = "joinpoint-central-csrf";
async function request<T>(path: string, init: RequestInit = {}) {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD"].includes(method)) {
    const csrf = sessionStorage.getItem(CSRF_KEY);
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.code === "ADMIN_LOGIN_FAILED"
        ? "Credenciales o código incorrectos."
        : data.code || "No se pudo completar la operación.",
    );
  return data as T;
}
export const centralApi = {
  async login(email: string, password: string, totp: string) {
    const result = await request<{ csrfToken: string; admin: Admin }>(
      "/api/admin-auth/login",
      { method: "POST", body: JSON.stringify({ email, password, totp }) },
    );
    sessionStorage.setItem(CSRF_KEY, result.csrfToken);
    return result.admin;
  },
  async me() {
    const result = await request<{ admin: Admin; csrfToken: string }>(
      "/api/admin/me",
    );
    sessionStorage.setItem(CSRF_KEY, result.csrfToken);
    return result.admin;
  },
  async logout() {
    await request("/api/admin/logout", { method: "POST" });
    sessionStorage.removeItem(CSRF_KEY);
  },
  overview: () =>
    Promise.all([
      request<{ customers: Customer[] }>("/api/admin/customers").then(
        (x) => x.customers,
      ),
      request<{ plans: Plan[] }>("/api/admin/plans").then((x) => x.plans),
      request<{ instances: Instance[] }>("/api/admin/instances").then(
        (x) => x.instances,
      ),
    ]),
  createCustomer: (body: {
    legalName: string;
    displayName: string;
    taxId?: string;
    contact: { fullName: string; email: string; phone?: string };
  }) =>
    request("/api/admin/customers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCustomer: (id:string,body:Record<string,unknown>) => request("/api/admin/customers/"+id,{method:"PUT",body:JSON.stringify(body)}),
  setCustomerStatus: (id:string,status:"ACTIVE"|"SUSPENDED",version:number) => request("/api/admin/customers/"+id+"/status",{method:"POST",body:JSON.stringify({status,version})}),
  createPlan: (body: {
    code: string;
    name: string;
    description?: string;
    entitlements: Array<{
      key: string;
      enabled: boolean;
      limit?: number | null;
    }>;
    prices: Array<{
      interval: "MONTH" | "YEAR";
      currency: string;
      amount: number;
    }>;
  }) =>
    request("/api/admin/plans", { method: "POST", body: JSON.stringify(body) }),
  updatePlan: (id:string,body:Record<string,unknown>) => request("/api/admin/plans/"+id,{method:"PUT",body:JSON.stringify(body)}),
  setPlanStatus: (id:string,active:boolean,version:number) => request("/api/admin/plans/"+id+"/status",{method:"POST",body:JSON.stringify({active,version})}),
  createInstance: (body: {
    customerId: string;
    subdomainLabel?: string;
    publicIp?: string;
  }) =>
    request<{ instance: Instance }>("/api/admin/instances", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((result) => result.instance),
  onboard: (body: {
    customerId: string;
    planId: string;
    status: "TRIAL" | "ACTIVE";
    startsAt: string;
    endsAt: string;
    ttlHours?: number;
    subdomainLabel?: string;
    publicIp?: string;
  }) => request<{
    instance: Instance;
    activation: { id: string; code: string; expiresAt: string };
    welcome?: { queued: boolean; reason?: string };
  }>("/api/admin/onboarding", { method:"POST", body:JSON.stringify(body) }),
  assignSubscription: (
    instanceId: string,
    body: {
      planId: string;
      status: "TRIAL" | "ACTIVE";
      startsAt: string;
      endsAt: string;
    },
  ) =>
    request("/api/admin/instances/" + instanceId + "/subscriptions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  issueActivation: (instanceId: string, ttlHours = 24) =>
    request<{
      activation: { id: string; code: string; expiresAt: string };
      welcome?: { queued: boolean; reason?: string };
    }>("/api/admin/instances/" + instanceId + "/activation-codes", {
      method: "POST",
      body: JSON.stringify({ ttlHours }),
    }),
  getSmtp: () =>
    request<{ provider: SmtpProvider }>("/api/admin/settings/smtp").then(
      (x) => x.provider,
    ),
  getCommercialSettings: () => request<{settings:Record<string, any>}>("/api/admin/settings/commercial").then(x=>x.settings),
  saveCommercialSettings: (body:Record<string, unknown>) => request<{settings:Record<string, any>}>("/api/admin/settings/commercial",{method:"PUT",body:JSON.stringify(body)}).then(x=>x.settings),
  templates: () => request<{templates:any[];allowedVariables:string[]}>("/api/admin/settings/templates"),
  saveTemplate: (key:string,body:Record<string,unknown>) => request("/api/admin/settings/templates/"+key,{method:"PUT",body:JSON.stringify(body)}),
  saveSmtp: (body: Record<string, unknown>) =>
    request<{ provider: SmtpProvider }>("/api/admin/settings/smtp", {
      method: "PUT",
      body: JSON.stringify(body),
    }).then((x) => x.provider),
  testSmtp: (recipient: string) =>
    request("/api/admin/settings/smtp/test", {
      method: "POST",
      body: JSON.stringify({ recipient }),
    }),
  getTelegram: () =>
    request<{ provider: SmtpProvider }>("/api/admin/settings/telegram").then(
      (x) => x.provider,
    ),
  saveTelegram: (body: Record<string, unknown>) =>
    request<{ provider: SmtpProvider }>("/api/admin/settings/telegram", {
      method: "PUT",
      body: JSON.stringify(body),
    }).then((x) => x.provider),
  testTelegram: () =>
    request("/api/admin/settings/telegram/test", { method: "POST" }),
  subscriptions: () =>
    request<{ subscriptions: Subscription[] }>("/api/admin/subscriptions").then(
      (x) => x.subscriptions,
    ),
  transitionSubscription: (id: string, body: Record<string, unknown>) =>
    request<{subscription:Subscription;notification?:{queued:boolean;reason?:string}}>("/api/admin/subscriptions/" + id + "/transition", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  invoices: () =>
    request<{ invoices: Invoice[] }>("/api/admin/invoices").then(
      (x) => x.invoices,
    ),
  createInvoice: (body: Record<string, unknown>) =>
    request("/api/admin/invoices", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  payments: () =>
    request<{ payments: Payment[] }>("/api/admin/payments").then(
      (x) => x.payments,
    ),
  registerPayment: (body: Record<string, unknown>) =>
    request("/api/admin/payments", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyPayment: (id: string, body: Record<string, unknown>) =>
    request("/api/admin/payments/" + id + "/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  communications: () =>
    request<{ deliveries: Delivery[] }>("/api/admin/communications").then(
      (x) => x.deliveries,
    ),
  retryDelivery: (id: string) =>
    request("/api/admin/communications/" + id + "/retry", { method: "POST" }),
};
