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
