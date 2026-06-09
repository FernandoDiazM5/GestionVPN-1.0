// ============================================================
//  src/test/setup.ts — setup global de Vitest (frontend)
//
//   • Matchers de @testing-library/jest-dom (toBeInTheDocument, etc.)
//   • Mocks de APIs del navegador que jsdom no implementa:
//       - matchMedia    (Tailwind dark mode usa esto)
//       - IntersectionObserver (lazy-load, scroll triggers)
//       - ResizeObserver
//   • MSW server con handlers vacíos por defecto: cada test puede
//     llamar server.use(http.get(...)) para mockear endpoints puntuales.
// ============================================================
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { setupServer } from 'msw/node';

// ── Browser API shims ───────────────────────────────────────────────
if (typeof window !== 'undefined') {
  // matchMedia: Tailwind / dark mode lo consultan al render
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),       // deprecated
      removeListener: vi.fn(),    // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  // IntersectionObserver: usado por componentes con scroll/visibility
  if (!('IntersectionObserver' in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    };
  }

  // ResizeObserver: tablas virtualizadas, paneles fluidos
  if (!('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // scrollTo: jsdom no implementa
  if (!window.scrollTo) {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  }
}

// ── MSW server (handlers vacíos por defecto) ────────────────────────
//  Cada test puede agregar handlers via server.use(...).
//  Cualquier request no-mockeada falla con "unhandled request" en consola
//  para forzarte a ser explícito.
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
