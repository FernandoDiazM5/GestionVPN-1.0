import { z } from 'zod';
import { EmptyStrictObjectSchema, EntityIdSchema } from './network';

const CidrV4Schema = z.cidrv4({ message: 'CIDR IPv4 inválido' });
const MgmtIpInputSchema = z.string().trim().max(32).refine((value) => {
  const [ip, prefix, ...rest] = value.split('/');
  if (rest.length > 0 || !z.ipv4().safeParse(ip).success) return false;
  if (prefix === undefined) return true;
  const parsed = Number(prefix);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 32;
}, 'IP de gestión inválida');

export const TunnelEmptyBodySchema = EmptyStrictObjectSchema;

export const TunnelActivateRequestSchema = z.object({
  targetVRF: EntityIdSchema,
}).strict();
export type TunnelActivateRequest = z.infer<typeof TunnelActivateRequestSchema>;

export const TunnelMangleAccessRequestSchema = z.object({
  vrfSeleccionado: EntityIdSchema,
  ipCliente: z.ipv4().optional(),
}).strict();
export type TunnelMangleAccessRequest = z.infer<typeof TunnelMangleAccessRequestSchema>;

export const RegisterMyIpRequestSchema = z.object({
  mgmtIp: MgmtIpInputSchema,
}).strict();
export type RegisterMyIpRequest = z.infer<typeof RegisterMyIpRequestSchema>;

export const TunnelRepairRequestSchema = z.object({
  pppUser: EntityIdSchema,
  vrfName: EntityIdSchema,
  lanSubnets: z.array(CidrV4Schema).min(1).max(32),
  adminWgNet: CidrV4Schema.optional(),
}).strict();

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

export const TUNNEL_ERROR_CODES = {
  NO_MGMT_IP: 'NO_MGMT_IP',
  NOT_YOUR_PEER: 'NOT_YOUR_PEER',
  PEER_FOREIGN_WORKSPACE: 'PEER_FOREIGN_WORKSPACE',
  NEEDS_CONFIG: 'NEEDS_CONFIG',
} as const;
export type TunnelErrorCode = (typeof TUNNEL_ERROR_CODES)[keyof typeof TUNNEL_ERROR_CODES];
