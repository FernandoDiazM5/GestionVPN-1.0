import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isStaleChunkError, reloadOnceForStaleChunk } from './moduleRecovery';

describe('moduleRecovery', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('reconoce los errores de chunks dinamicos obsoletos', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isStaleChunkError(new Error('fallo de render'))).toBe(false);
  });

  it('recarga una sola vez dentro de la ventana de seguridad', () => {
    const reload = vi.fn();
    const error = new TypeError('Failed to fetch dynamically imported module');

    expect(reloadOnceForStaleChunk(error, 100_000, reload)).toBe(true);
    expect(reloadOnceForStaleChunk(error, 120_000, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
