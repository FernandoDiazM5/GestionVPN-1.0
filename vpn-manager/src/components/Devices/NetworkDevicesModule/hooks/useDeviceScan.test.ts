import { describe, expect, it } from 'vitest';
import { sanitizeRestoredSshStatus } from './useDeviceScan';

describe('restauración segura del escaneo SSH', () => {
  it('invalida éxitos que ya no tienen una contraseña recuperable', () => {
    expect(sanitizeRestoredSshStatus({
      '10.0.0.1': 'success',
      '10.0.0.2': 'failed',
      '10.0.0.3': 'pending',
    })).toEqual({
      '10.0.0.2': 'failed',
    });
  });
});
