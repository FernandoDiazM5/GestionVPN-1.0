import { describe, it, expect } from 'vitest';
import { fmtAgo } from './formatters';

describe('fmtAgo', () => {
  const now = 1_000_000_000_000;
  it('"nunca" si no hay timestamp', () => {
    expect(fmtAgo(0, now)).toBe('nunca');
    expect(fmtAgo(null, now)).toBe('nunca');
  });
  it('segundos / minutos / horas / días', () => {
    expect(fmtAgo(now - 5_000, now)).toBe('hace 5s');
    expect(fmtAgo(now - 3 * 60_000, now)).toBe('hace 3m');
    expect(fmtAgo(now - 2 * 3_600_000, now)).toBe('hace 2h');
    expect(fmtAgo(now - 3 * 86_400_000, now)).toBe('hace 3d');
  });
  it('no devuelve negativos si ts está en el futuro', () => {
    expect(fmtAgo(now + 5_000, now)).toBe('hace 0s');
  });
});
