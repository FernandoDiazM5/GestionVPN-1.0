// ============================================================
//  Diagnostics — ping / traceroute desde el router central (Q3)
//
//  El backend conecta a RouterOS y ejecuta /tool/ping y /tool/traceroute
//  contra el target. Esto NO ejecuta los comandos desde el servidor:
//  los lanza desde el MikroTik, así el path de red coincide con el
//  que usan los túneles reales (mismas reglas, mismas VRFs).
//
//  Targets aceptados:
//   • IPv4 dotted (ej. 192.168.50.1).
//   • Hostname (ej. cpe-norte) — RouterOS lo resuelve si tiene DNS.
//   • No se aceptan rangos/CIDR.
// ============================================================
import { z } from 'zod';

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const HOSTNAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

export const DiagnosticsTargetSchema = z.string()
  .min(1)
  .max(253)
  .refine(v => IPV4.test(v) || HOSTNAME.test(v), 'target debe ser IPv4 o hostname');

export const DiagnosticsPingRequestSchema = z.object({
  target: DiagnosticsTargetSchema,
  /** Solo informativo; el backend ignora si el usuario no es admin. */
  count: z.number().int().min(1).max(10).optional(),
});
export type DiagnosticsPingRequest = z.infer<typeof DiagnosticsPingRequestSchema>;

export interface DiagnosticsPingResponse {
  success: true;
  target: string;
  /** Filas individuales devueltas por /tool/ping (una por seq). */
  rows: Array<{
    seq: number;
    host?: string;          // IP resuelta del target
    time?: string;          // ej. "12ms" — viene como string desde RouterOS
    size?: number;
    ttl?: number;
    status?: string;        // 'timeout' | undefined
  }>;
  /** Resumen calculado por el backend a partir de las filas. */
  summary: {
    sent: number;
    received: number;
    lossPct: number;
    minMs: number | null;
    avgMs: number | null;
    maxMs: number | null;
  };
}

export const DiagnosticsTraceRequestSchema = z.object({
  target: DiagnosticsTargetSchema,
});
export type DiagnosticsTraceRequest = z.infer<typeof DiagnosticsTraceRequestSchema>;

export interface DiagnosticsTraceResponse {
  success: true;
  target: string;
  hops: Array<{
    /** Posición del hop (1, 2, 3...). */
    hop: number;
    /** IP del hop (si responde). */
    address: string | null;
    /** RTT en ms, o null si timeout. */
    rttMs: number | null;
    /** Loss en %, viene como número de RouterOS. */
    lossPct: number | null;
    /** Más reciente status — 'timeout' | 'reached' | undefined. */
    status?: string;
  }>;
}
