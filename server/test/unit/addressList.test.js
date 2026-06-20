import { describe, it, expect } from 'vitest';
const { entriesToAdd } = require('../../lib/addressList');

const L = 'LIST-NET-REMOTE-TOWERS';

describe('entriesToAdd — dedup de address-list (M3)', () => {
  it('omite direcciones ya presentes en la lista', () => {
    const existing = [
      { list: L, address: '142.152.7.0/24' },
      { list: 'otra', address: '10.0.0.0/24' },
    ];
    expect(entriesToAdd(existing, L, ['142.152.7.0/24', '10.1.1.0/24'])).toEqual(['10.1.1.0/24']);
  });

  it('dedup dentro del propio lote', () => {
    expect(entriesToAdd([], L, ['10.1.1.0/24', '10.1.1.0/24', '10.2.2.0/24'])).toEqual(['10.1.1.0/24', '10.2.2.0/24']);
  });

  it('ignora entradas de OTRAS listas al calcular presentes', () => {
    const existing = [{ list: 'otra', address: '10.1.1.0/24' }];
    expect(entriesToAdd(existing, L, ['10.1.1.0/24'])).toEqual(['10.1.1.0/24']);
  });

  it('normaliza espacios y descarta vacías; tolera existing nulo', () => {
    expect(entriesToAdd(null, L, ['', '  ', ' 10.1.1.0/24 '])).toEqual(['10.1.1.0/24']);
  });

  it('LAN compartida ya presente (otro nodo la añadió) → no se vuelve a añadir', () => {
    const existing = [{ list: L, address: '142.152.7.0/24', comment: 'Ruta NODOA' }];
    // El nodo B trae la misma LAN + su IP de gestión única.
    expect(entriesToAdd(existing, L, ['142.152.7.0/24', '10.11.250.4/32'])).toEqual(['10.11.250.4/32']);
  });
});
