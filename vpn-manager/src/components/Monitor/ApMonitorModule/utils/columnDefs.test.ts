import { describe, expect, it } from 'vitest';
import { CPE_COL_DEFS } from './columnDefs';

function widthOf(key: string) {
  const width = CPE_COL_DEFS.find(column => column.key === key)?.width;
  return Number.parseInt(width ?? '', 10);
}

describe('CPE column geometry', () => {
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
