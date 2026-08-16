export type Admin = { id:string; email:string; displayName:string };
export type Customer = { id:string; legal_name:string; display_name:string; tax_id?:string; status:string; created_at:string };
export type Plan = { id:string; code:string; name:string; description?:string; status:string; entitlements?:unknown[] };
export type Instance = { id:string; customer_id:string; fqdn:string; public_ip?:string; status:string; management_pool_cidr:string; created_at:string };

const CSRF_KEY='joinpoint-central-csrf';
async function request<T>(path:string, init:RequestInit={}) {
  const method=(init.method||'GET').toUpperCase();
  const headers=new Headers(init.headers);
  if(init.body) headers.set('Content-Type','application/json');
  if(!['GET','HEAD'].includes(method)) { const csrf=sessionStorage.getItem(CSRF_KEY); if(csrf) headers.set('X-CSRF-Token',csrf); }
  const response=await fetch(path,{...init,headers,credentials:'include'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.code==='ADMIN_LOGIN_FAILED'?'Credenciales o código incorrectos.':data.code||'No se pudo completar la operación.');
  return data as T;
}
export const centralApi={
  async login(email:string,password:string,totp:string){const result=await request<{csrfToken:string;admin:Admin}>('/api/admin-auth/login',{method:'POST',body:JSON.stringify({email,password,totp})});sessionStorage.setItem(CSRF_KEY,result.csrfToken);return result.admin;},
  async me(){const result=await request<{admin:Admin;csrfToken:string}>('/api/admin/me');sessionStorage.setItem(CSRF_KEY,result.csrfToken);return result.admin;},
  async logout(){await request('/api/admin/logout',{method:'POST'});sessionStorage.removeItem(CSRF_KEY);},
  overview:()=>Promise.all([
    request<{customers:Customer[]}>('/api/admin/customers').then(x=>x.customers),
    request<{plans:Plan[]}>('/api/admin/plans').then(x=>x.plans),
    request<{instances:Instance[]}>('/api/admin/instances').then(x=>x.instances),
  ]),
  createCustomer:(body:{legalName:string;displayName:string;taxId?:string})=>request('/api/admin/customers',{method:'POST',body:JSON.stringify(body)}),
  createPlan:(body:{code:string;name:string;description?:string;entitlements:unknown[]})=>request('/api/admin/plans',{method:'POST',body:JSON.stringify(body)}),
  createInstance:(body:{customerId:string;subdomainLabel?:string;publicIp?:string})=>request('/api/admin/instances',{method:'POST',body:JSON.stringify(body)}),
};
