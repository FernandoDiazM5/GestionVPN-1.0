import { describe, expect, it } from 'vitest';
import { CPE_COL_DEFS, getUnavailableCpeMetricColumns } from './columnDefs';

function widthOf(key: string) {
  const width = CPE_COL_DEFS.find(column => column.key === key)?.width;
  return Number.parseInt(width ?? '', 10);
}

describe('CPE column geometry', () => {
  it('omite la IP no confiable de la tabla visible', () => {
    expect(CPE_COL_DEFS.some(column => column.key === 'lastip')).toBe(false);
  });

  it('reserva espacio suficiente para los encabezados fijos', () => {
    expect(widthOf('status')).toBeGreaterThanOrEqual(56);
    expect(widthOf('mac')).toBeGreaterThanOrEqual(180);
    expect(widthOf('actions')).toBeGreaterThanOrEqual(80);
  });

  it('mantiene legibles las columnas métricas visibles por defecto', () => {
    expect(widthOf('signal')).toBeGreaterThanOrEqual(84);
    expect(widthOf('rssi')).toBeGreaterThanOrEqual(84);
    expect(widthOf('tx_rate')).toBeGreaterThanOrEqual(92);
    expect(widthOf('rx_rate')).toBeGreaterThanOrEqual(92);
  });
});

describe('CPE metric availability', () => {
  it('oculta sólo las métricas sin datos en toda la antena', () => {
    const unavailable = getUnavailableCpeMetricColumns([
      { ccq: null, airmax_quality: null, airmax_capacity: null, airmax_dcap: 120, airmax_ucap: 80 },
      { ccq: undefined, airmax_quality: null, airmax_capacity: null, airmax_dcap: 0, airmax_ucap: 0 },
    ]);

    expect([...unavailable]).toEqual(['ccq', 'am_qual', 'am_cap']);
  });

  it('considera cero como un valor disponible y no oculta antes de recibir estaciones', () => {
    expect(getUnavailableCpeMetricColumns([{ ccq: 0 }]).has('ccq')).toBe(false);
    expect(getUnavailableCpeMetricColumns([]).size).toBe(0);
  });
});
