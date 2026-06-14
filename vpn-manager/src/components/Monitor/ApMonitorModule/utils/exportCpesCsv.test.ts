import { describe, it, expect } from 'vitest';
import { buildCpesCsv } from './exportCpesCsv';
import type { LiveCpe } from '../../../../types/apMonitor';

const cpe = (over: Partial<LiveCpe>): LiveCpe => ({ mac: 'AA:BB:CC:DD:EE:FF', ...over });

describe('buildCpesCsv', () => {
  it('empieza con BOM y la fila de cabeceras', () => {
    const csv = buildCpesCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);            // BOM UTF-8
    const header = csv.slice(1).split('\r\n')[0];
    expect(header.startsWith('MAC,Nombre,Modelo,')).toBe(true);
    expect(header).toContain('CCQ_pct');
  });

  it('serializa los valores de un CPE en orden', () => {
    const csv = buildCpesCsv([cpe({ remote_hostname: 'Casa1', signal: -62, ccq: 91, lastip: '10.0.50.20' })]);
    const row = csv.slice(1).split('\r\n')[1];
    expect(row).toContain('AA:BB:CC:DD:EE:FF');
    expect(row).toContain('Casa1');
    expect(row).toContain('-62');
    expect(row).toContain('91');
    expect(row).toContain('10.0.50.20');
  });

  it('campos vacíos cuando faltan datos (no "null"/"undefined")', () => {
    const csv = buildCpesCsv([cpe({})]);
    const row = csv.slice(1).split('\r\n')[1];
    expect(row).not.toContain('null');
    expect(row).not.toContain('undefined');
    expect(row.startsWith('AA:BB:CC:DD:EE:FF,,,')).toBe(true);  // Nombre/Modelo vacíos
  });

  it('entrecomilla valores con coma (RFC-4180)', () => {
    const csv = buildCpesCsv([cpe({ remote_hostname: 'Casa, depto 2' })]);
    const row = csv.slice(1).split('\r\n')[1];
    expect(row).toContain('"Casa, depto 2"');
  });
});
