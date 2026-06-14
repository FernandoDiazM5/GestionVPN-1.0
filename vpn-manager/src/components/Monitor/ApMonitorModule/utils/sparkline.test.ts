import { describe, it, expect } from 'vitest';
import { buildSparkline } from './sparkline';

describe('buildSparkline', () => {
  it('null con menos de 2 puntos válidos', () => {
    expect(buildSparkline([])).toBeNull();
    expect(buildSparkline([5])).toBeNull();
    expect(buildSparkline([null, undefined, NaN])).toBeNull();
  });

  it('ignora null/undefined/NaN y calcula min/max/last/count', () => {
    const d = buildSparkline([-60, null, -70, NaN, -55], 100, 40)!;
    expect(d).not.toBeNull();
    expect(d.count).toBe(3);
    expect(d.min).toBe(-70);
    expect(d.max).toBe(-55);
    expect(d.last).toBe(-55);
  });

  it('el path empieza con M y usa L para el resto', () => {
    const d = buildSparkline([1, 2, 3], 100, 40)!;
    expect(d.path.startsWith('M')).toBe(true);
    expect((d.path.match(/L/g) || []).length).toBe(2);
  });

  it('invierte Y (mayor valor → menor coordenada y)', () => {
    // serie creciente: el primer punto (más bajo) debe quedar más abajo (y mayor)
    const d = buildSparkline([0, 10], 100, 40, 0)!;
    const ys = d.path.split(' ').map(seg => parseFloat(seg.split(',')[1]));
    expect(ys[0]).toBeGreaterThan(ys[1]);
  });
});
