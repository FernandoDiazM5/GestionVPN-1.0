// ============================================================
//  csv.test.js — serializer RFC 4180-ish (Q4)
//
//  La regla más fácil de romper: campos con comas, comillas o newlines.
//  Estos tests fijan el comportamiento esperado.
// ============================================================
const { escapeField, rowToCsv, toCsv } = require('../../lib/csv');

describe('escapeField', () => {
  it('null y undefined → string vacío', () => {
    expect(escapeField(null)).toBe('');
    expect(escapeField(undefined)).toBe('');
  });

  it('string simple sin caracteres especiales no se entrecomilla', () => {
    expect(escapeField('hola')).toBe('hola');
    expect(escapeField('ACTIVATE')).toBe('ACTIVATE');
  });

  it('número va sin comillas', () => {
    expect(escapeField(42)).toBe('42');
    expect(escapeField(0)).toBe('0');
  });

  it('valor con coma se entrecomilla', () => {
    expect(escapeField('a,b')).toBe('"a,b"');
  });

  it('valor con newline (LF) se entrecomilla', () => {
    expect(escapeField('linea1\nlinea2')).toBe('"linea1\nlinea2"');
  });

  it('valor con CR se entrecomilla', () => {
    expect(escapeField('a\rb')).toBe('"a\rb"');
  });

  it('comilla doble interna se duplica y se entrecomilla', () => {
    expect(escapeField('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('combinación de coma + comillas internas', () => {
    expect(escapeField('"name, surname"')).toBe('"""name, surname"""');
  });

  it('string vacío sigue siendo vacío (no se entrecomilla por gusto)', () => {
    expect(escapeField('')).toBe('');
  });
});

describe('rowToCsv', () => {
  it('arma fila con los separadores correctos', () => {
    expect(rowToCsv(['a', 'b', 'c'])).toBe('a,b,c');
  });

  it('mezcla null/string/number/coma', () => {
    expect(rowToCsv(['hola', null, 42, 'con,coma'])).toBe('hola,,42,"con,coma"');
  });
});

describe('toCsv generator', () => {
  it('emite header + filas con CRLF', () => {
    const out = Array.from(toCsv(
      [['ana', 1], ['bob', 2]],
      ['nombre', 'edad'],
    )).join('');
    expect(out).toBe('nombre,edad\r\nana,1\r\nbob,2\r\n');
  });

  it('sin header arranca directo en data', () => {
    const out = Array.from(toCsv([['x'], ['y']])).join('');
    expect(out).toBe('x\r\ny\r\n');
  });

  it('sin filas y sin header → string vacío', () => {
    expect(Array.from(toCsv([])).join('')).toBe('');
  });
});
