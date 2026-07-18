import { z } from 'zod';
import {
  EmptyStrictObjectSchema,
  EntityIdSchema,
  Ipv4Schema,
  MacAddressSchema,
  PortSchema,
  SecretTextSchema,
  SshUsernameSchema,
  boundedText,
} from './network';

export const ApEntityParamsSchema = z.object({ id: EntityIdSchema }).strict();
export const ApGroupParamsSchema = z.object({ nodeId: EntityIdSchema }).strict();
export const CpeMacParamsSchema = z.object({ mac: MacAddressSchema }).strict();

export const ApGroupRequestSchema = z.object({
  nombre: boundedText(100, { allowEmpty: false }),
  descripcion: boundedText(500).optional().default(''),
  ubicacion: boundedText(200).optional().default(''),
}).strict();

export const ApCreateRequestSchema = z.object({
  nodo_id: EntityIdSchema,
  ip: Ipv4Schema,
  usuario_ssh: boundedText(64).optional(),
  clave_ssh_plain: SecretTextSchema.optional(),
  puerto_ssh: PortSchema.optional().default(22),
}).strict();

export const ApUpdateRequestSchema = z.object({
  ip: Ipv4Schema.optional(),
  usuario_ssh: boundedText(64).optional(),
  clave_ssh_plain: SecretTextSchema.optional(),
  puerto_ssh: PortSchema.optional(),
  activo: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'Debe indicar al menos un campo');

export const ApPollRequestSchema = z.object({
  saveHistory: z.boolean().optional().default(false),
}).strict();

export const CpeDetailRequestSchema = z.object({
  ap_id: EntityIdSchema,
  cpe_ip: Ipv4Schema,
}).strict();

export const SignalHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
}).strict();

export const ApIdRequestSchema = z.object({ apId: EntityIdSchema }).strict();
export const ApDetailRequestSchema = z.object({ id: EntityIdSchema }).strict();

export const ApPollDirectRequestSchema = z.object({
  apId: EntityIdSchema,
  saveHistory: z.boolean().optional().default(false),
}).strict();

export const CpeEnrichBatchRequestSchema = z.object({
  cpes: z.array(z.object({
    mac: MacAddressSchema,
    ip: Ipv4Schema,
  }).strict()).min(1).max(100),
  apId: EntityIdSchema,
  port: PortSchema.optional(),
}).strict();

export const CpeDetailDirectRequestSchema = z.object({
  cpe_ip: Ipv4Schema,
  port: PortSchema.optional(),
  user: boundedText(64).optional(),
  pass: SecretTextSchema.optional(),
  apId: EntityIdSchema.optional(),
}).strict();

export const CpeCredentialsRequestSchema = z.object({
  user: SshUsernameSchema,
  pass: SecretTextSchema.optional().default(''),
  port: PortSchema.optional().default(22),
}).strict();

export const ApEmptyBodySchema = EmptyStrictObjectSchema;
