// ============================================================
//  Tipos del sistema multi-tenant — espejo del backend.
//
//  Tras FASE 5: los tipos viven en @gestionvpn/contracts y aquí
//  los re-exportamos para no romper imports existentes. Cambiar
//  un campo en contracts rompe ambos lados en tsc (no más drift).
// ============================================================

export type {
  Role,
  SessionUser,
} from '@gestionvpn/contracts';

export type {
  Member,
  Invitation,
  MyInvitation,
  WgServerConfig,
  AcceptResponse,
  Assignment,
  MemberWireguard,
} from '@gestionvpn/contracts';

export { ROLE_LABEL } from '@gestionvpn/contracts';

export type {
  Moderator,
  AdminSummary,
} from '@gestionvpn/contracts';

// Alias retro-compatible: el frontend antes llamaba al sobre "AcceptResult".
// Mantener el nombre evita tocar todos los servicios/componentes que lo usan.
export type { AcceptResponse as AcceptResult } from '@gestionvpn/contracts';

// ── Tipos auxiliares del frontend que NO están en contracts ──
// (no son contrato de API: solo viven en el cliente)

/** Entrada de auditoría (GET /api/audit/logs). */
export interface AuditLog {
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
