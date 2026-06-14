// ============================================================
//  health.ts (E3) — salud de un CPE por umbrales de señal/CCQ.
//  Umbrales ALINEADOS con utils/colors.ts (una sola fuente de verdad
//  para "qué es bueno/advertencia/crítico"):
//    señal: ok ≥ -65 dBm · warning [-78,-65) · critical < -78
//    CCQ:   ok ≥ 80 %   · warning [60,80)   · critical < 60
// ============================================================
import type { LiveCpe } from '../../../../types/apMonitor';

export type HealthLevel = 'ok' | 'warning' | 'critical';

export const SIGNAL_WARN_DBM = -65;
export const SIGNAL_CRIT_DBM = -78;
export const CCQ_WARN_PCT = 80;
export const CCQ_CRIT_PCT = 60;

export function signalLevel(v?: number | null): HealthLevel {
  if (v == null) return 'ok';
  if (v < SIGNAL_CRIT_DBM) return 'critical';
  if (v < SIGNAL_WARN_DBM) return 'warning';
  return 'ok';
}

export function ccqLevel(v?: number | null): HealthLevel {
  if (v == null) return 'ok';
  if (v < CCQ_CRIT_PCT) return 'critical';
  if (v < CCQ_WARN_PCT) return 'warning';
  return 'ok';
}

const RANK: Record<HealthLevel, number> = { ok: 0, warning: 1, critical: 2 };

/** Salud global del CPE = la peor entre señal y CCQ. */
export function cpeHealth(cpe: Pick<LiveCpe, 'signal' | 'ccq'>): HealthLevel {
  const s = signalLevel(cpe.signal);
  const c = ccqLevel(cpe.ccq);
  return RANK[s] >= RANK[c] ? s : c;
}

/** Cuenta CPEs degradados (warning + critical) y si hay alguno crítico. */
export function degradedSummary(cpes: Pick<LiveCpe, 'signal' | 'ccq'>[]): { count: number; hasCritical: boolean } {
  let count = 0, hasCritical = false;
  for (const c of cpes) {
    const h = cpeHealth(c);
    if (h !== 'ok') count++;
    if (h === 'critical') hasCritical = true;
  }
  return { count, hasCritical };
}
