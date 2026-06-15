// ────────────────────────────────────────────────────────────────────
//  Tunnel — activación/keepalive multi-usuario (Fase F5.B)
// ────────────────────────────────────────────────────────────────────
import { z } from 'zod';

// ── Requests ────────────────────────────────────────────────────────

export const TunnelActivateRequestSchema = z.object({
  targetVRF: z.string().min(1, 'targetVRF requerido'),
});
export type TunnelActivateRequest = z.infer<typeof TunnelActivateRequestSchema>;

export const TunnelMangleAccessRequestSchema = z.object({
  vrfSeleccionado: z.string().min(1, 'vrfSeleccionado es requerido'),
  ipCliente: z.string().optional(),
});
export type TunnelMangleAccessRequest = z.infer<typeof TunnelMangleAccessRequestSchema>;

export const RegisterMyIpRequestSchema = z.object({
  mgmtIp: z.string().regex(/^192\.168\.21\.\d{1,3}(\/\d+)?$/, 'Debe ser 192.168.21.x'),
});
export type RegisterMyIpRequest = z.infer<typeof RegisterMyIpRequestSchema>;

// ── Responses ───────────────────────────────────────────────────────

export const TunnelStatusResponseSchema = z.object({
  success: z.literal(true),
  activeNodeVrf: z.string().nullable(),
  tunnelExpiry: z.number().nullable(),
});
export type TunnelStatusResponse = z.infer<typeof TunnelStatusResponseSchema>;

export const TunnelActivateResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  vrf: z.string(),
  ipCliente: z.string(),
  sessionId: z.string(),
  tunnelExpiry: z.number().nullable(),
});
export type TunnelActivateResponse = z.infer<typeof TunnelActivateResponseSchema>;

export const KeepaliveResponseSchema = z.object({
  success: z.literal(true),
  restored: z.boolean(),
  restoredItems: z.array(z.string()),
  note: z.string().optional(),
});
export type KeepaliveResponse = z.infer<typeof KeepaliveResponseSchema>;

// Códigos máquina específicos del dominio tunnel (preservados de F5.A)
export const TUNNEL_ERROR_CODES = {
  NO_MGMT_IP: 'NO_MGMT_IP',
  NOT_YOUR_PEER: 'NOT_YOUR_PEER',
  PEER_FOREIGN_WORKSPACE: 'PEER_FOREIGN_WORKSPACE',
  NEEDS_CONFIG: 'NEEDS_CONFIG',
} as const;
export type TunnelErrorCode = (typeof TUNNEL_ERROR_CODES)[keyof typeof TUNNEL_ERROR_CODES];
