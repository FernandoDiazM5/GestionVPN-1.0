import { z } from 'zod';
import {
  EmptyStrictObjectSchema,
  EntityIdSchema,
  Ipv4Schema,
  PortSchema,
  SecretTextSchema,
  SshUsernameSchema,
  boundedText,
} from './network';

const CidrV4Schema = z.cidrv4({ message: 'CIDR IPv4 inválido' });
const LanSubnetsSchema = z.array(CidrV4Schema).max(32, 'Máximo 32 subredes');
const NodeNameSchema = boundedText(100, { allowEmpty: false }).refine(
  (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').length >= 2,
  'Nombre de nodo inválido',
);
const NonEmptySecretSchema = SecretTextSchema.refine((value) => value.length > 0, 'Secreto requerido');
const WireGuardPublicKeySchema = z.string()
  .trim()
  .regex(/^[A-Za-z0-9+/]{43}=$/, 'Clave pública WireGuard inválida');
const ProvisionIdSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9-]+$/, 'provisionId inválido');
const HostSchema = z.union([
  Ipv4Schema,
  z.string().trim().max(253).regex(
    /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/,
    'Host inválido',
  ),
]);

export const NodeEmptyBodySchema = EmptyStrictObjectSchema;

export const NodeLookupRequestSchema = z.object({ pppUser: EntityIdSchema }).strict();

export const NodeProvisionRequestSchema = z.object({
  nodeNumber: z.coerce.number().int().min(1).max(254),
  nodeName: NodeNameSchema,
  pppUser: EntityIdSchema.optional(),
  pppPassword: SecretTextSchema.optional(),
  lanSubnet: CidrV4Schema.optional(),
  lanSubnets: LanSubnetsSchema.optional(),
  remoteAddress: Ipv4Schema.optional(),
  protocol: z.enum(['sstp', 'wireguard']),
  cpePublicKey: z.union([WireGuardPublicKeySchema, z.literal('')]).optional(),
  wgListenPort: PortSchema.optional(),
  provisionId: ProvisionIdSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.lanSubnet && (!value.lanSubnets || value.lanSubnets.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['lanSubnets'], message: 'Se requiere al menos una subred LAN' });
  }
});
export type NodeProvisionRequest = z.infer<typeof NodeProvisionRequestSchema>;

export const NodeDeprovisionRequestSchema = z.object({
  vrfName: EntityIdSchema.optional(),
  pppUser: EntityIdSchema,
  protocol: z.enum(['sstp', 'wireguard']).optional(),
}).strict();
export type NodeDeprovisionRequest = z.infer<typeof NodeDeprovisionRequestSchema>;

export const NodeEditRequestSchema = z.object({
  pppUser: EntityIdSchema,
  newPppUser: EntityIdSchema.optional(),
  newPassword: SecretTextSchema.optional(),
  newRemoteAddress: Ipv4Schema.optional(),
  newComment: boundedText(200).nullable().optional(),
  vrfName: EntityIdSchema.optional(),
  addSubnets: LanSubnetsSchema.optional(),
  removeSubnets: LanSubnetsSchema.optional(),
}).strict();
export type NodeEditRequest = z.infer<typeof NodeEditRequestSchema>;

export const NodeLabelRequestSchema = z.object({
  pppUser: EntityIdSchema,
  label: boundedText(200).optional(),
}).strict();
export type NodeLabelRequest = z.infer<typeof NodeLabelRequestSchema>;

export const NodeCredsSaveRequestSchema = z.object({
  pppUser: EntityIdSchema,
  pppPassword: NonEmptySecretSchema,
}).strict();
export type NodeCredsSaveRequest = z.infer<typeof NodeCredsSaveRequestSchema>;

export const SshCredItemSchema = z.object({
  user: SshUsernameSchema.optional(),
  pass: SecretTextSchema.optional(),
  port: PortSchema.optional(),
}).strict();
export const NodeSshCredsSaveRequestSchema = z.object({
  pppUser: EntityIdSchema,
  creds: z.array(SshCredItemSchema).max(20, 'Máximo 20 credenciales'),
}).strict();
export type NodeSshCredsSaveRequest = z.infer<typeof NodeSshCredsSaveRequestSchema>;

export const NodeDetailsRequestSchema = z.object({
  vrfName: EntityIdSchema.optional(),
  pppUser: EntityIdSchema,
}).strict();

export const NodeScriptRequestSchema = z.object({
  pppUser: EntityIdSchema,
  pppPassword: SecretTextSchema.optional(),
  serverPublicIP: HostSchema,
}).strict();

export const NodeSetPeerRequestSchema = z.object({
  pppUser: EntityIdSchema,
  cpePublicKey: WireGuardPublicKeySchema,
}).strict();

export const NodeHistoryAddRequestSchema = z.object({
  pppUser: EntityIdSchema,
  event: boundedText(200, { allowEmpty: false }),
}).strict();

export const NodeTagsSaveRequestSchema = z.object({
  pppUser: EntityIdSchema,
  tags: z.array(boundedText(64, { allowEmpty: false })).max(20, 'Máximo 20 etiquetas')
    .transform((tags) => [...new Set(tags)]),
}).strict();

export const NodeScanRequestSchema = z.object({
  nodeLan: CidrV4Schema.refine(
    (value) => Number(value.split('/')[1]) >= 16,
    'CIDR demasiado grande',
  ),
}).strict();

// Responses
export const NodeStepSchema = z.object({
  step: z.union([z.number(), z.string()]),
  obj: z.string(),
  name: z.string(),
  status: z.enum(['ok', 'warn', 'error']),
});
export type NodeStep = z.infer<typeof NodeStepSchema>;

export const NodeNextResponseSchema = z.object({
  success: z.literal(true),
  nextNode: z.number(),
  nextRemote: z.string(),
});
export type NodeNextResponse = z.infer<typeof NodeNextResponseSchema>;

export const NodeListItemSchema = z.object({
  id: z.string().optional(),
  nombre_nodo: z.string(),
  ppp_user: z.string(),
  segmento_lan: z.string(),
  lan_subnets: z.array(z.string()),
  nombre_vrf: z.string(),
  service: z.enum(['sstp', 'wireguard']),
  disabled: z.boolean(),
  running: z.boolean(),
  ip_tunnel: z.string(),
  uptime: z.string(),
  cached: z.boolean().optional(),
  wg_public_key: z.string().optional(),
  wg_listen_port: z.number().optional(),
  wg_last_handshake_secs: z.number().nullable().optional(),
  wg_allowed_ips: z.string().optional(),
});
export type NodeListItem = z.infer<typeof NodeListItemSchema>;
