import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './apiClient';
import { fetchWithTimeout } from './fetchWithTimeout';

vi.mock('./apiClient', () => ({ apiFetch: vi.fn() }));

const mockedApiFetch = vi.mocked(apiFetch);

function rejectWhenAborted(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_, reject) => {
    const rejectWithReason = () => reject(signal?.reason);
    if (signal?.aborted) {
      rejectWithReason();
    } else {
      signal?.addEventListener('abort', rejectWithReason, { once: true });
    }
  });
}

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('propaga el aborto y el motivo indicado por el caller', async () => {
    mockedApiFetch.mockImplementation((_url, options) => rejectWhenAborted(options?.signal));
    const callerController = new AbortController();
    const callerReason = new DOMException('Vista desmontada', 'AbortError');

    const request = fetchWithTimeout('/api/test', { signal: callerController.signal }, 5_000);
    callerController.abort(callerReason);

    await expect(request).rejects.toBe(callerReason);
    expect(mockedApiFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('aborta la peticion con TimeoutError al agotar el plazo', async () => {
    mockedApiFetch.mockImplementation((_url, options) => rejectWhenAborted(options?.signal));

    const request = fetchWithTimeout('/api/test', undefined, 1_000);
    const rejection = expect(request).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'Request timed out',
    });
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
  });

  it('limpia el timeout despues de una peticion exitosa', async () => {
    const response = new Response(null, { status: 204 });
    mockedApiFetch.mockResolvedValue(response);

    await expect(fetchWithTimeout('/api/test', undefined, 1_000)).resolves.toBe(response);
    expect(vi.getTimerCount()).toBe(0);
  });
});
