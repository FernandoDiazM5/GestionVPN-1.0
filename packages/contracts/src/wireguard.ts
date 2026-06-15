// ────────────────────────────────────────────────────────────────────
//  WireGuard — peers de gestión del router core (Fase F5.B)
// ────────────────────────────────────────────────────────────────────
import { z } from 'zod';
import { PublicKeySchema } from './common';

// ── Requests ────────────────────────────────────────────────────────

export const PeerAddRequestSchema = z.object({
  name: z.string().max(128).optional(),
  publicKey: PublicKeySchema.min(1, 'Se requiere la clave pública WireGuard'),
});
export type PeerAddRequest = z.infer<typeof PeerAddRequestSchema>;

export const PeerEditRequestSchema = z.object({
  peerId: z.string().min(1, 'peerId requerido'),
  newName: z.string().max(128),
});
export type PeerEditRequest = z.infer<typeof PeerEditRequestSchema>;

export const PeerColorRequestSchema = z.object({
  peerAddress: z.string().min(1),
  color: z.string().min(1).max(32),
});
export type PeerColorRequest = z.infer<typeof PeerColorRequestSchema>;

export const PeerAliasRequestSchema = z.object({
  peerAddress: z.string().min(1, 'peerAddress requerido'),
  alias: z.string().max(120, 'alias máximo 120 caracteres').optional(),
});
export type PeerAliasRequest = z.infer<typeof PeerAliasRequestSchema>;

// ── Responses ───────────────────────────────────────────────────────

export const WgPeerSchema = z.object({
  id: z.string(),
  name: z.string(),
  allowedAddress: z.string(),
  publicKey: z.string(),
  lastHandshakeSecs: z.number().nullable(),
  active: z.boolean(),
  email: z.string().optional(),
  alias: z.string().optional(),
});
export type WgPeer = z.infer<typeof WgPeerSchema>;

export const WgPeersResponseSchema = z.object({
  success: z.literal(true),
  peers: z.array(WgPeerSchema),
  serverPublicKey: z.string(),
  serverListenPort: z.number(),
  serverPublicIP: z.string(),
});
export type WgPeersResponse = z.infer<typeof WgPeersResponseSchema>;

export const PeerAddResponseSchema = z.object({
  success: z.literal(true),
  assignedIP: z.string(),
  message: z.string(),
});
export type PeerAddResponse = z.infer<typeof PeerAddResponseSchema>;
