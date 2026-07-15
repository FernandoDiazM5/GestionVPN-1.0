import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from './config';

describe('resolveApiBaseUrl', () => {
  it('usa rutas relativas cuando no hay un origen externo configurado', () => {
    expect(resolveApiBaseUrl()).toBe('');
    expect(resolveApiBaseUrl('   ')).toBe('');
  });

  it('normaliza el origen externo configurado', () => {
    expect(resolveApiBaseUrl(' http://api.example.test:3001/ '))
      .toBe('http://api.example.test:3001');
  });
});
