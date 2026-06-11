// ============================================================
//  Audit — export de bitácora de túneles (Q4)
//
//  La auditoría ya existía (GET /api/audit/logs). Q4 agrega export
//  a CSV / JSON con filtros de rango de fechas y acción para
//  reportes mensuales / SLA / análisis ad-hoc.
//
//  Filtros aceptados:
//   • from / to — epoch ms inclusivos. Defaults: ahora-30d / ahora.
//   • tunnelId — string del VRF (ya existía en la query individual).
//   • action — opcional, sólo eventos de ese tipo
//     (ACTIVATE/DEACTIVATE/SCAN/EXPIRE/ERROR/...).
//   • format — 'csv' (default) o 'json'.
// ============================================================
import { z } from 'zod';

export const AuditExportFormatSchema = z.enum(['csv', 'json']);
export type AuditExportFormat = z.infer<typeof AuditExportFormatSchema>;

export const AuditExportRequestSchema = z.object({
  /** epoch ms — default ahora-30d. */
  from: z.number().int().nonnegative().optional(),
  /** epoch ms — default ahora. */
  to: z.number().int().nonnegative().optional(),
  /** VRF o ppp_user del túnel (textual, sobrevive borrado lógico). */
  tunnelId: z.string().max(160).optional(),
  /** ACTIVATE | DEACTIVATE | EXPIRE | SCAN | ERROR | ... */
  action: z.string().max(40).optional(),
  format: AuditExportFormatSchema.optional().default('csv'),
});
export type AuditExportRequest = z.infer<typeof AuditExportRequestSchema>;

/**
 * Forma plana de cada fila exportada — espejo del query subyacente.
 * Si cambias auditRepo.list, este tipo te avisa en tsc del lado del frontend
 * (los servicios que descargan JSON tipan contra este tipo).
 */
export interface AuditExportRow {
  id: string;
  tunnel_id: string;
  action: string;
  ip_address: string | null;
  detail: string | null;
  created_at: number;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
}

/** Respuesta JSON (cuando format='json'). El CSV se sirve como text/csv. */
export interface AuditExportJsonResponse {
  success: true;
  rows: AuditExportRow[];
  meta: {
    from: number;
    to: number;
    tunnelId: string | null;
    action: string | null;
    count: number;
  };
}
