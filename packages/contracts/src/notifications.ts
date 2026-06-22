// ============================================================
//  Notifications — schemas Zod compartidos (Q1)
//
//  Eventos cubiertos hoy:
//    • TUNNEL_ACTIVATED · TUNNEL_DEACTIVATED  (auditoría en vivo)
//    • SESSION_EXPIRED                         (job batch cada 60s)
//
//  Cambios futuros del enum requieren bump del paquete + migración
//  (validamos contra ALLOWED_EVENTS también en notificationRepo).
// ============================================================
import { z } from 'zod';

export const NotificationEventSchema = z.enum([
  'TUNNEL_ACTIVATED',
  'TUNNEL_DEACTIVATED',
  'SESSION_EXPIRED',
  // M5 — monitoreo proactivo
  'NODE_DOWN',           // un nodo dejó de responder (3 fallos consecutivos)
  'NODE_RECOVERED',      // un nodo down volvió a responder
]);
export type NotificationEvent = z.infer<typeof NotificationEventSchema>;

export const NotificationChannelsSchema = z.object({
  email: z.boolean(),
  telegram: z.boolean(),
});
export type NotificationChannels = z.infer<typeof NotificationChannelsSchema>;

/** Body de PATCH /api/account/notifications. */
export const NotificationPreferencesSchema = z.object({
  channels: NotificationChannelsSchema,
  eventTypes: z.array(NotificationEventSchema),
  paused: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

/** Respuesta de GET /api/account/notifications. */
export interface NotificationStatus {
  channels: NotificationChannels;
  eventTypes: NotificationEvent[];
  paused: boolean;
  telegramLinked: boolean;
  telegramBotConfigured: boolean;
  /** @username del bot (sin @) para armar https://t.me/<user>. null si se desconoce. */
  telegramBotUsername?: string | null;
}

/** Respuesta de POST /api/account/telegram/link/start. */
export interface TelegramLinkStartResponse {
  success: true;
  code: string;        // 6 chars hex MAYÚS
  expiresAt: number;   // epoch ms
}
