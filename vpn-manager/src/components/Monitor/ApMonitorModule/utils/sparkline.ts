// ============================================================
//  sparkline.ts (E2) — geometría de un sparkline SVG, sin dependencias.
//  Pura y testeable (no toca el DOM): construye el path y los extremos
//  a partir de una serie de valores (ignora null/undefined).
// ============================================================

export interface SparkData {
  path: string;   // atributo `d` del <path>
  min: number;
  max: number;
  last: number;
  count: number;
}

/**
 * Devuelve la geometría del sparkline o null si hay < 2 puntos válidos.
 * El eje Y se invierte (SVG crece hacia abajo) para que "más alto = mejor".
 */
export function buildSparkline(
  values: Array<number | null | undefined>,
  width = 200,
  height = 36,
  pad = 2,
): SparkData | null {
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v));
  if (nums.length < 2) return null;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const n = nums.length;

  const x = (k: number) => pad + (k / (n - 1)) * (width - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / range) * (height - 2 * pad);

  const path = nums
    .map((v, k) => `${k === 0 ? 'M' : 'L'}${x(k).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');

  return { path, min, max, last: nums[n - 1], count: n };
}
