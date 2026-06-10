import { z } from 'zod';
import { RoleSchema } from './common';

// ────────────────────────────────────────────────────────────────────
//  /api/workspace  (renombrar, export, import)
// ────────────────────────────────────────────────────────────────────

/** PATCH /api/workspace/name (sólo OWNER) */
export const WorkspaceRenameRequestSchema = z.object({
  name: z.string().min(1).max(160),
});
export type WorkspaceRenameRequest = z.infer<typeof WorkspaceRenameRequestSchema>;

// ────────────────────────────────────────────────────────────────────
//  GET /api/workspace/export — payload JSON
// ────────────────────────────────────────────────────────────────────

export const EXPORT_VERSION = '1.0.0';

const ExportMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().optional().nullable(),
  role: RoleSchema,
  disabled: z.boolean().optional(),
  joined_at: z.number().optional(),
});

const ExportTunnelSchema = z.object({
  ppp_user: z.string(),
  nombre_nodo: z.string().optional(),
  nombre_vrf: z.string().optional(),
  iface_name: z.string().optional(),
  segmento_lan: z.string().optional(),
  ip_tunnel: z.string().optional(),
  ppp_password_enc: z.string().nullable().optional(),
  label: z.string().optional(),
  server_ip: z.string().optional(),
  lan_subnets: z.string().optional(),
  protocol: z.string().optional(),
  mikrotik_id: z.string().optional(),
  ssh_creds: z.array(z.any()).optional(),
});

const ExportApGroupSchema = z.object({
  uuid: z.string(),
  nombre: z.string(),
  descripcion: z.string().optional(),
  ubicacion: z.string().optional(),
  aps: z.array(z.any()).optional(),
});

export const ExportPayloadSchema = z
  .object({
    version: z.string(),
    workspace: z.object({ name: z.string().max(160).optional() }).optional(),
    members: z.array(ExportMemberSchema).optional(),
    tunnels: z.array(ExportTunnelSchema).optional(),
    ap_groups: z.array(ExportApGroupSchema).optional(),
  })
  .passthrough();
export type ExportPayload = z.infer<typeof ExportPayloadSchema>;

// ────────────────────────────────────────────────────────────────────
//  POST /api/workspace/import
// ────────────────────────────────────────────────────────────────────

export const ImportRequestSchema = z.object({
  payload: ExportPayloadSchema,
  conflict: z.enum(['skip', 'overwrite']).default('skip'),
  dryRun: z.boolean().default(true),
});
export type ImportRequest = z.infer<typeof ImportRequestSchema>;

/** Plan calculado en dryRun. */
export interface ImportPlan {
  members: { create: string[]; update: string[]; skip: string[] };
  tunnels: { create: string[]; update: string[]; skip: string[] };
  ap_groups: { create: string[]; update: string[]; skip: string[] };
}

export interface ImportDryRunResponse {
  success: true;
  message: string;
  version: string;
  conflict: 'skip' | 'overwrite';
  plan: ImportPlan;
}

export interface ImportApplyResponse {
  success: true;
  message: string;
  version: string;
  conflict: 'skip' | 'overwrite';
  inserts: { tunnels: number; ap_groups: number };
  updates: { tunnels: number; ap_groups: number };
}
