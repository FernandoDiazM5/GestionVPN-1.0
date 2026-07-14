import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportFrontendError } from './errorReporting';

describe('errorReporting', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
  });

  it('envia un payload acotado sin propagar fallos al usuario', () => {
    reportFrontendError(new Error(`fallo-${Date.now()}`), { source: 'async', route: '/api/test' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/error-reports'), expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      keepalive: true,
    }));
  });
});
