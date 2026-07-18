// ────────────────────────────────────────────────────────────────────
//  Device — APs Ubiquiti + interfaces wireless del router core (F5.B)
// ────────────────────────────────────────────────────────────────────
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

// ── Requests ────────────────────────────────────────────────────────

export const DeviceAutoLoginRequestSchema = z.object({
  ip: Ipv4Schema,
  sshCredentials: z.array(z.object({
    user: SshUsernameSchema,
    pass: SecretTextSchema,
    port: PortSchema.optional(),
  }).strict()).min(1).max(20),
}).strict();
export type DeviceAutoLoginRequest = z.infer<typeof DeviceAutoLoginRequestSchema>;

export const DeviceAntennaRequestSchema = z.object({
  deviceIP: Ipv4Schema,
  deviceUser: boundedText(64),
  devicePass: SecretTextSchema.optional(),
  devicePort: PortSchema.optional().default(22),
  deviceId: EntityIdSchema.optional(),
}).strict();
export type DeviceAntennaRequest = z.infer<typeof DeviceAntennaRequestSchema>;

const OptionalMacSchema = z.union([z.literal(''), MacAddressSchema]);
const OptionalIpSchema = z.union([z.literal(''), Ipv4Schema]);
const TimestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const DevicePersistShape = {
  id: EntityIdSchema,
  mac: boundedText(128).optional(),
  ip: Ipv4Schema,
  name: boundedText(255).optional(),
  deviceName: boundedText(255).optional(),
  model: boundedText(255).optional(),
  firmware: boundedText(255).optional(),
  role: z.enum(['ap', 'sta', 'unknown']).optional(),
  parentAp: boundedText(128).optional(),
  essid: boundedText(255).optional(),
  frequency: z.number().finite().min(0).max(100000).nullable().optional(),
  nodeId: boundedText(128).nullable().optional(),
  nodeName: boundedText(255).optional(),
  sshUser: boundedText(64).optional(),
  sshPass: SecretTextSchema.optional(),
  hasSshPass: z.boolean().optional(),
  sshPort: PortSchema.optional(),
  wlanMac: OptionalMacSchema.optional(),
  lanMac: OptionalMacSchema.optional(),
  apMac: OptionalMacSchema.optional(),
  wifiPassword: SecretTextSchema.optional(),
  routerIp: OptionalIpSchema.optional(),
  routerUser: boundedText(64).optional(),
  routerPass: SecretTextSchema.optional(),
  routerPort: PortSchema.optional(),
  security: boundedText(64).optional(),
  channelWidth: z.number().finite().min(0).max(1000).nullable().optional(),
  networkMode: boundedText(64).optional(),
  chains: boundedText(32).optional(),
  is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  addedAt: TimestampSchema.nullable().optional(),
  lastSeen: TimestampSchema.nullable().optional(),
  lastCpeCount: z.number().int().min(0).max(10000).nullable().optional(),
  lastCpeCountAt: TimestampSchema.nullable().optional(),
  cachedStats: z.object({
    stations: z.array(z.unknown()).max(512).optional(),
  }).optional(),
};

export const DevicePersistRequestSchema = z.object(DevicePersistShape).strict();
export type DevicePersistRequest = z.infer<typeof DevicePersistRequestSchema>;

export const DevicePatchRequestSchema = z.object(DevicePersistShape)
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Debe indicar al menos un campo');
export type DevicePatchRequest = z.infer<typeof DevicePatchRequestSchema>;

export const DeviceIdParamsSchema = z.object({ id: EntityIdSchema }).strict();
export const DeviceEmptyBodySchema = EmptyStrictObjectSchema;

// ── Responses ───────────────────────────────────────────────────────

export const SavedDeviceSchema = z.object({
  id: z.string(),
  mac: z.string(),
  nodeId: z.string().nullable(),
  ip: z.string(),
  name: z.string(),
  deviceName: z.string(),
  model: z.string(),
  firmware: z.string(),
  frequency: z.number().nullable(),
  channelWidth: z.number().nullable(),
  essid: z.string(),
  lanMac: z.string(),
  wlanMac: z.string(),
  role: z.enum(['ap', 'sta']),
  sshUser: z.string(),
  hasSshPass: z.boolean(),
  sshPort: z.number(),
  wifiPassword: z.string(),
  is_active: z.boolean(),
  lastCpeCount: z.number().nullable().optional(),
  lastCpeCountAt: z.number().nullable().optional(),
  addedAt: z.number().nullable(),
  nodeName: z.string(),
  routerPort: z.number(),
  lastSeen: z.number(),
});
export type SavedDevice = z.infer<typeof SavedDeviceSchema>;

export const DevicesListResponseSchema = z.object({
  success: z.literal(true),
  devices: z.array(SavedDeviceSchema),
});
export type DevicesListResponse = z.infer<typeof DevicesListResponseSchema>;

export const AutoLoginResponseSchema = z.discriminatedUnion('authenticated', [
  z.object({
    success: z.literal(true),
    authenticated: z.literal(true),
    user: z.string(),
    pass: z.string(),
    port: z.number(),
    stats: z.unknown(),
  }),
  z.object({
    success: z.literal(true),
    authenticated: z.literal(false),
    message: z.string(),
  }),
]);
export type AutoLoginResponse = z.infer<typeof AutoLoginResponseSchema>;
