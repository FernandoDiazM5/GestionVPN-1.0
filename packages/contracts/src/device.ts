// ────────────────────────────────────────────────────────────────────
//  Device — APs Ubiquiti + interfaces wireless del router core (F5.B)
// ────────────────────────────────────────────────────────────────────
import { z } from 'zod';

// ── Requests ────────────────────────────────────────────────────────

export const DeviceAutoLoginRequestSchema = z.object({
  ip: z.string().min(1),
  sshCredentials: z.array(z.object({
    user: z.string(),
    pass: z.string(),
    port: z.number().optional(),
  })),
});
export type DeviceAutoLoginRequest = z.infer<typeof DeviceAutoLoginRequestSchema>;

export const DeviceAntennaRequestSchema = z.object({
  deviceIP: z.string().min(1),
  deviceUser: z.string(),
  devicePass: z.string().optional(),
  devicePort: z.union([z.number(), z.string()]).optional(),
  deviceId: z.string().optional(),
});
export type DeviceAntennaRequest = z.infer<typeof DeviceAntennaRequestSchema>;

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
