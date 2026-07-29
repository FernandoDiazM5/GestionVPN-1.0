import { useQuery } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ScopedQueryProvider from './ScopedQueryProvider';

function PendingQuery({ onAbort }: { onAbort: () => void }) {
  useQuery({
    queryKey: ['pending'],
    queryFn: ({ signal }) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        onAbort();
        reject(new DOMException('Cancelada', 'AbortError'));
      }, { once: true });
    }),
  });
  return null;
}

describe('ScopedQueryProvider', () => {
  it('cancela consultas activas al abandonar el ámbito autenticado', async () => {
    const onAbort = vi.fn();
    const { unmount } = render(
      <ScopedQueryProvider>
        <PendingQuery onAbort={onAbort} />
      </ScopedQueryProvider>,
    );

    unmount();
    await waitFor(() => expect(onAbort).toHaveBeenCalledTimes(1));
  });
});

