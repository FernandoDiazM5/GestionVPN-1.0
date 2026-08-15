// ────────────────────────────────────────────────────────────────────
//  Settings — configuración del router core (Fase F5.B)
// ────────────────────────────────────────────────────────────────────
import { z } from 'zod';

// Claves del router core (solo platform_admin las modifica)
export const CORE_ROUTER_KEYS = ['MT_IP', 'MT_USER', 'MT_PASS'] as const;
export type CoreRouterKey = (typeof CORE_ROUTER_KEYS)[number];

// ── Requests ────────────────────────────────────────────────────────

export const SaveSettingRequestSchema = z.object({
  key: z.string().min(1, 'key requerido').max(64),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});
export type SaveSettingRequest = z.infer<typeof SaveSettingRequestSchema>;

export const ManagementNetworkPlanSchema = z.object({
  net: z.string(),
  scanNet: z.string(),
  scanBase: z.string(),
  clientsNet: z.string(),
  clientsBase: z.string(),
  vpsNet: z.string(),
  vpsBase: z.string(),
  adminNet: z.string(),
  adminBase: z.string(),
});
export type ManagementNetworkPlan = z.infer<typeof ManagementNetworkPlanSchema>;

export const ManagementSupernetPreviewSchema = z.object({
  valid: z.boolean(),
  canSave: z.boolean(),
  locked: z.boolean(),
  sameValue: z.boolean().optional(),
  blockers: z.array(z.string()),
  overlaps: z.array(z.object({ source: z.string(), name: z.string(), cidr: z.string() })),
  plan: ManagementNetworkPlanSchema.nullable(),
});
export type ManagementSupernetPreview = z.infer<typeof ManagementSupernetPreviewSchema>;

export const InterfaceActionRequestSchema = z.object({
  vpnName: z.string().min(1, 'vpnName requerido'),
  vpnService: z.enum(['sstp', 'pptp', 'l2tp', 'ovpn']),
});
export type InterfaceActionRequest = z.infer<typeof InterfaceActionRequestSchema>;

// ── Responses ───────────────────────────────────────────────────────

export const SettingsGetResponseSchema = z.object({
  success: z.literal(true),
  settings: z.record(z.string(), z.unknown()),
});
export type SettingsGetResponse = z.infer<typeof SettingsGetResponseSchema>;
