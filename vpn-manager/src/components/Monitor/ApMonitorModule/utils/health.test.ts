import { describe, it, expect } from 'vitest';
import { signalLevel, ccqLevel, cpeHealth, degradedSummary } from './health';

describe('signalLevel', () => {
  it('ok cuando ≥ -65 dBm o null', () => {
    expect(signalLevel(-50)).toBe('ok');
    expect(signalLevel(-65)).toBe('ok');
    expect(signalLevel(null)).toBe('ok');
    expect(signalLevel(undefined)).toBe('ok');
  });
  it('warning en [-78, -65)', () => {
    expect(signalLevel(-66)).toBe('warning');
    expect(signalLevel(-77)).toBe('warning');
  });
  it('critical < -78', () => {
    expect(signalLevel(-79)).toBe('critical');
    expect(signalLevel(-95)).toBe('critical');
  });
});

describe('ccqLevel', () => {
  it('ok ≥ 80 o null', () => {
    expect(ccqLevel(95)).toBe('ok');
    expect(ccqLevel(80)).toBe('ok');
    expect(ccqLevel(null)).toBe('ok');
  });
  it('warning en [60, 80)', () => {
    expect(ccqLevel(79)).toBe('warning');
    expect(ccqLevel(60)).toBe('warning');
  });
  it('critical < 60', () => {
    expect(ccqLevel(59)).toBe('critical');
  });
});

describe('cpeHealth = peor de señal y CCQ', () => {
  it('toma el peor nivel', () => {
    expect(cpeHealth({ signal: -50, ccq: 95 })).toBe('ok');
    expect(cpeHealth({ signal: -50, ccq: 70 })).toBe('warning');   // CCQ manda
    expect(cpeHealth({ signal: -90, ccq: 95 })).toBe('critical');  // señal manda
    expect(cpeHealth({ signal: -70, ccq: 50 })).toBe('critical');  // CCQ crítico
  });
});

describe('degradedSummary', () => {
  it('cuenta degradados y detecta críticos', () => {
    const r = degradedSummary([
      { signal: -50, ccq: 95 },   // ok
      { signal: -70, ccq: 90 },   // warning
      { signal: -90, ccq: 90 },   // critical
    ]);
    expect(r.count).toBe(2);
    expect(r.hasCritical).toBe(true);
  });
  it('sin degradados', () => {
    const r = degradedSummary([{ signal: -55, ccq: 90 }]);
    expect(r.count).toBe(0);
    expect(r.hasCritical).toBe(false);
  });
});
