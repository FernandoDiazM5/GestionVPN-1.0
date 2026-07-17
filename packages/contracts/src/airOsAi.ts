import { z } from 'zod';

export const AIR_OS_AI_POLICY_VERSION = 'air-os-ai-v1';

const NullableNumber = z.number().finite().nullable().optional();
const NullableString = z.string().max(160).nullable().optional();

/** Allowlist de métricas que el backend puede aceptar para un análisis. */
export const AirOsAiMetricsSchema = z.object({
  signal: NullableNumber,
  noiseFloor: NullableNumber,
  ccq: NullableNumber,
  txRate: NullableNumber,
  rxRate: NullableNumber,
  cpuLoad: NullableNumber,
  memoryPercent: NullableNumber,
  airmaxQuality: NullableNumber,
  airmaxCapacity: NullableNumber,
  uptimeStr: NullableString,
  firmwareVersion: NullableString,
  mode: NullableString,
  networkMode: NullableString,
  frequency: NullableNumber,
  channelNumber: NullableNumber,
  channelWidth: NullableNumber,
  txPower: NullableNumber,
  distance: NullableNumber,
  chains: NullableString,
  rssi: NullableNumber,
  txRetries: NullableNumber,
  missedBeacons: NullableNumber,
  rxCrypts: NullableNumber,
  chainRssi: z.array(z.number().finite()).max(8).nullable().optional(),
  opmode: NullableString,
  countryCode: NullableString,
  temperature: NullableNumber,
  loadAvg: NullableString,
  lanSpeed: NullableNumber,
  lanInfo: NullableString,
  cinr: NullableNumber,
  airtime: NullableNumber,
  txAirtime: NullableNumber,
  rxAirtime: NullableNumber,
  txLatency: NullableNumber,
}).strict();
export type AirOsAiMetrics = z.infer<typeof AirOsAiMetricsSchema>;

export const AirOsAiDeviceSchema = z.object({
  ip: z.string().min(1).max(64),
  mac: z.string().max(32).optional().default(''),
  name: z.string().max(160).optional().default(''),
  model: z.string().max(120).optional().default(''),
  firmware: z.string().max(120).optional().default(''),
  role: z.enum(['ap', 'sta', 'unknown']),
  essid: z.string().max(160).optional(),
  parentAp: z.string().max(160).optional(),
  cachedStats: AirOsAiMetricsSchema,
}).strict();
export type AirOsAiDevice = z.infer<typeof AirOsAiDeviceSchema>;

/** Identidad mínima usada sólo para localizar el historial seudonimizado. */
export const AirOsAiDeviceIdentitySchema = z.object({
  ip: z.string().min(1).max(64),
  mac: z.string().max(32).optional().default(''),
  name: z.string().max(160).optional().default(''),
  model: z.string().max(120).optional().default(''),
}).strict();
export type AirOsAiDeviceIdentity = z.infer<typeof AirOsAiDeviceIdentitySchema>;

export const AirOsAiDeviceHistoryRequestSchema = z.object({
  device: AirOsAiDeviceIdentitySchema,
  limit: z.number().int().min(1).max(30).optional().default(30),
}).strict();
export type AirOsAiDeviceHistoryRequest = z.infer<typeof AirOsAiDeviceHistoryRequestSchema>;

export const AirOsAiDeviceAnalysisRequestSchema = z.object({
  snapshotAt: z.number().int().positive(),
  device: AirOsAiDeviceSchema,
}).strict();
export type AirOsAiDeviceAnalysisRequest = z.infer<typeof AirOsAiDeviceAnalysisRequestSchema>;

export const AirOsAiNetworkAnalysisRequestSchema = z.object({
  snapshotAt: z.number().int().positive(),
  scope: z.object({
    subnet: z.string().max(64).optional(),
    roleFilter: z.enum(['ap', 'sta', 'unknown']).optional(),
    ssidFilter: z.string().max(160).optional(),
    searchApplied: z.boolean().optional(),
  }).strict(),
  devices: z.array(AirOsAiDeviceSchema).min(1).max(100),
}).strict();
export type AirOsAiNetworkAnalysisRequest = z.infer<typeof AirOsAiNetworkAnalysisRequestSchema>;

export const AirOsAiConsentRequestSchema = z.object({
  policyVersion: z.literal(AIR_OS_AI_POLICY_VERSION),
  accepted: z.boolean(),
}).strict();
export type AirOsAiConsentRequest = z.infer<typeof AirOsAiConsentRequestSchema>;

export const AirOsAiAccessPatchSchema = z.object({ enabled: z.boolean() }).strict();
export type AirOsAiAccessPatch = z.infer<typeof AirOsAiAccessPatchSchema>;

export const AirOsAiFindingSchema = z.object({
  title: z.string().min(1).max(160),
  evidence: z.array(z.string().min(1).max(240)).max(8),
  interpretation: z.string().min(1).max(800),
  possibleCauses: z.array(z.string().min(1).max(300)).max(5),
  manualChecks: z.array(z.string().min(1).max(300)).max(6),
}).strict();

export const AirOsAiAnalysisSchema = z.object({
  summary: z.string().min(1).max(1200),
  severity: z.enum(['info', 'warning', 'critical']),
  confidence: z.enum(['low', 'medium', 'high']),
  findings: z.array(AirOsAiFindingSchema).max(8),
  limitations: z.array(z.string().min(1).max(300)).max(8),
  advisoryOnly: z.literal(true),
  actionsExecuted: z.array(z.never()).max(0),
}).strict();
export type AirOsAiAnalysis = z.infer<typeof AirOsAiAnalysisSchema>;

export interface AirOsAiAnalysisResult {
  uuid: string;
  analysis: AirOsAiAnalysis;
  cached: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  createdAt: number;
}

export interface AirOsAiStatus {
  configured: boolean;
  enabled: boolean;
  model: string | null;
  moderatorAccessEnabled: boolean;
  consentAccepted: boolean;
  policyVersion: string;
  cooldownSeconds: number;
  limits: {
    dailyRequests: number;
    workspaceDailyRequests: number;
    dailyTokens: number;
    maxDevicesPerNetwork: number;
    maxInputBytes: number;
  };
  usage: {
    requestCount: number;
    totalTokens: number;
  };
}

export interface ModeratorAiAccess {
  enabled: boolean;
  enabled_at: number | null;
  disabled_at: number | null;
  updated_at: number | null;
}

export interface AirOsAiHistoryItem {
  uuid: string;
  type: 'DEVICE' | 'NETWORK';
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED';
  analysis: AirOsAiAnalysis | null;
  model: string;
  totalTokens: number;
  createdAt: number;
}

export interface AirOsAiHistoryDetail extends AirOsAiHistoryItem {
  scope: Record<string, unknown> | null;
  usage: AirOsAiAnalysisResult['usage'];
}
