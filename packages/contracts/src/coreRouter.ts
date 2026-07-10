// ────────────────────────────────────────────────────────────────────
//  Core Router — bootstrap del router que hace de "Servidor VPN".
//
//  El Administrador (platform_admin) da de alta un RouterOS/CHR en blanco
//  desde Ajustes: ingresa la IP pública + usuario + contraseña, el backend
//  valida el acceso, detecta el estado del equipo y aplica de forma
//  IDEMPOTENTE toda la config base del Core (interfaces WG de gestión,
//  SSTP server, firewall, NAT, allowlist de la API, etc.). Al terminar
//  devuelve un checklist de todo lo aplicado — igual que el alta de nodo.
//
//  ⚠️ Los valores de red se DERIVAN de server/lib/mgmtNet.js (fuente de
//     verdad). Este contrato solo define la forma del request/response.
// ────────────────────────────────────────────────────────────────────
import { z } from 'zod';

// La IP pública es lo PRIMERO que ingresa el admin: sirve para conectar,
// se guarda como `server_public_ip` (la consumen los scripts CPE) y alimenta
// la regla src-nat del NAT. `connectIp` es opcional (modo avanzado): conectar
// por una IP privada/gestión distinta de la pública.
const HOST_RE = /^[a-zA-Z0-9.\-:]+$/; // IPv4/host/hostname permisivo — la conexión real valida
// CIDR IPv4 (o IP suelta) para las redes de gestión adicionales de confianza.
const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

// ── Requests ────────────────────────────────────────────────────────

export const CoreRouterCredsSchema = z.object({
  publicIp: z.string().min(3, 'IP pública requerida').regex(HOST_RE, 'IP pública inválida'),
  user: z.string().min(1, 'Usuario requerido').default('admin'),
  pass: z.string().min(1, 'Contraseña requerida'),
  // Opción avanzada: conectar por una IP distinta de la pública (p. ej. la IP
  // de gestión WireGuard si el router ya está enlazado). Default = publicIp.
  connectIp: z.string().regex(HOST_RE).optional(),
});
export type CoreRouterCreds = z.infer<typeof CoreRouterCredsSchema>;

export const CoreRouterValidateRequestSchema = CoreRouterCredsSchema;
export type CoreRouterValidateRequest = z.infer<typeof CoreRouterValidateRequestSchema>;

export const CoreRouterBootstrapRequestSchema = CoreRouterCredsSchema.extend({
  // El admin confirma cambiar el "Servidor VPN" a ESTE equipo cuando ya había
  // otro router configurado (MT_IP apuntaba a otra IP). Sin esto, el backend
  // devuelve 409 CORE_DEVICE_CHANGE para forzar la confirmación explícita.
  confirmSwitch: z.boolean().optional(),
  // Redes de gestión ADICIONALES de confianza (además de los planos 10.x): p.ej.
  // la LAN local desde la que el admin administra por Winbox (192.168.18.0/24).
  // El backend las añade a LIST-MGMT-TRUSTED y a la allowlist de api/api-ssl, para
  // que el blindado del bootstrap (§4.18: drop WAN + restricción de la API) NO deje
  // sin acceso a esa red. Sin esto, un equipo blindado solo se administra por el
  // túnel de gestión 10.x.
  trustedNets: z.array(z.string().regex(CIDR_RE, 'Red inválida (CIDR IPv4, ej. 192.168.18.0/24)')).max(10).optional(),
});
export type CoreRouterBootstrapRequest = z.infer<typeof CoreRouterBootstrapRequestSchema>;

// ── Responses ───────────────────────────────────────────────────────

// Estado detectado del equipo tras conectar:
//  • blank   → sin infraestructura de gestión → se aplicará todo.
//  • ours    → ya es un Core nuestro y está completo → "todo conforme".
//  • partial → tiene parte de la config → se completará lo que falte.
//  • foreign → responde pero no reconocemos su config (equipo ajeno con uso).
export const CoreRouterStateSchema = z.enum(['blank', 'ours', 'partial', 'foreign']);
export type CoreRouterState = z.infer<typeof CoreRouterStateSchema>;

// Resumen legible de los valores VIVOS del router (para el panel "conforme").
export const CoreRouterSummarySchema = z.object({
  identity: z.string().optional(),
  version: z.string().optional(),
  boardName: z.string().optional(),
  // Interfaces WG de gestión detectadas: nombre → { listenPort, publicKey?, running? }
  mgmtInterfaces: z.array(z.object({
    name: z.string(),
    listenPort: z.number().nullable().optional(),
    publicKey: z.string().optional(),
    running: z.boolean().optional(),
  })).default([]),
  sstpServer: z.object({ enabled: z.boolean(), port: z.number().nullable().optional() }).nullable().optional(),
  apiAllowlistOk: z.boolean().optional(),      // ¿el origen del backend está en la allowlist? (§4.18)
  firewallRules: z.number().optional(),        // nº de reglas filter gestionadas presentes
  provisionedNodes: z.number().optional(),     // VRF-ND* detectados (nodos ya dados de alta)
  mgmtPeers: z.number().optional(),            // peers WG de gestión activos
});
export type CoreRouterSummary = z.infer<typeof CoreRouterSummarySchema>;

export const CoreRouterValidateResponseSchema = z.object({
  success: z.literal(true),
  reachable: z.literal(true),
  state: CoreRouterStateSchema,
  // true si ya había OTRO router configurado (MT_IP distinto) → pedir confirmación.
  isDifferentDevice: z.boolean(),
  // IP que hoy tiene guardada la plataforma (para mostrar "cambiar de X a Y").
  currentMtIp: z.string().nullable().optional(),
  summary: CoreRouterSummarySchema,
});
export type CoreRouterValidateResponse = z.infer<typeof CoreRouterValidateResponseSchema>;

// Paso del checklist de bootstrap. `skip` = el objeto ya existía (idempotencia).
export const CoreBootstrapStepSchema = z.object({
  step: z.union([z.number(), z.string()]),
  obj: z.string(),
  name: z.string(),
  status: z.enum(['ok', 'skip', 'warn', 'error']),
});
export type CoreBootstrapStep = z.infer<typeof CoreBootstrapStepSchema>;

export const CoreRouterBootstrapResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  state: CoreRouterStateSchema,
  steps: z.array(CoreBootstrapStepSchema),
  // Nº de objetos realmente creados vs ya presentes (para el resumen final).
  created: z.number(),
  skipped: z.number(),
  summary: CoreRouterSummarySchema,
});
export type CoreRouterBootstrapResponse = z.infer<typeof CoreRouterBootstrapResponseSchema>;

// Respuesta de GET /settings/core-router/status (usa las creds guardadas).
export const CoreRouterStatusResponseSchema = z.object({
  success: z.literal(true),
  configured: z.boolean(),      // ¿hay MT_IP/MT_USER/MT_PASS guardados?
  reachable: z.boolean(),       // ¿responde el router ahora mismo?
  state: CoreRouterStateSchema.nullable().optional(),
  mtIp: z.string().nullable().optional(),
  summary: CoreRouterSummarySchema.nullable().optional(),
  message: z.string().optional(),
});
export type CoreRouterStatusResponse = z.infer<typeof CoreRouterStatusResponseSchema>;
