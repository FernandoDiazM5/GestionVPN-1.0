// ────────────────────────────────────────────────────────────────────
//  Nodes — túneles SSTP y WireGuard (Fase F5.B)
// ────────────────────────────────────────────────────────────────────
import { z } from 'zod';

const CIDR_RE = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

// ── Requests ────────────────────────────────────────────────────────

export const NodeProvisionRequestSchema = z.object({
  nodeNumber: z.union([z.number(), z.string()]),
  nodeName: z.string().min(1),
  pppUser: z.string().optional(),
  pppPassword: z.string().optional(),
  lanSubnet: z.string().regex(CIDR_RE).optional(),
  lanSubnets: z.array(z.string().regex(CIDR_RE)).optional(),
  remoteAddress: z.string().regex(IPV4_RE).optional(),
  protocol: z.enum(['sstp', 'wireguard']),
  // WireGuard: si se omite (o vacío), el servidor GENERA el par de llaves del CPE
  // y entrega la privada embebida en el script. Pegarla aquí fuerza el modo manual.
  cpePublicKey: z.string().optional(),
  wgListenPort: z.union([z.number(), z.string()]).optional(),
});
export type NodeProvisionRequest = z.infer<typeof NodeProvisionRequestSchema>;

export const NodeDeprovisionRequestSchema = z.object({
  vrfName: z.string().optional(),
  pppUser: z.string().min(1, 'pppUser es requerido'),
  protocol: z.enum(['sstp', 'wireguard']).optional(),
});
export type NodeDeprovisionRequest = z.infer<typeof NodeDeprovisionRequestSchema>;

export const NodeEditRequestSchema = z.object({
  pppUser: z.string().min(1, 'pppUser requerido'),
  newPppUser: z.string().optional(),
  newPassword: z.string().optional(),
  newRemoteAddress: z.string().regex(IPV4_RE).optional(),
  newComment: z.string().nullable().optional(),
  vrfName: z.string().optional(),
  addSubnets: z.array(z.string().regex(CIDR_RE)).optional(),
  removeSubnets: z.array(z.string().regex(CIDR_RE)).optional(),
});
export type NodeEditRequest = z.infer<typeof NodeEditRequestSchema>;

export const NodeLabelRequestSchema = z.object({
  pppUser: z.string().min(1, 'pppUser requerido'),
  label: z.string().max(200).optional(),
});
export type NodeLabelRequest = z.infer<typeof NodeLabelRequestSchema>;

export const NodeCredsSaveRequestSchema = z.object({
  pppUser: z.string().min(1),
  pppPassword: z.string().min(1),
});
export type NodeCredsSaveRequest = z.infer<typeof NodeCredsSaveRequestSchema>;

export const SshCredItemSchema = z.object({
  user: z.string().optional(),
  pass: z.string().optional(),
  port: z.number().optional(),
});
export const NodeSshCredsSaveRequestSchema = z.object({
  pppUser: z.string().min(1),
  creds: z.array(SshCredItemSchema),
});
export type NodeSshCredsSaveRequest = z.infer<typeof NodeSshCredsSaveRequestSchema>;

// ── Responses ───────────────────────────────────────────────────────

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
