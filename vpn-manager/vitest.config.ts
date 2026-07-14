// ============================================================
//  Vitest config — frontend (FASE 3 del REFACTOR_PLAN)
//
//   • Entorno jsdom — necesario para Testing Library
//   • include: src/**/*.{test,spec}.{ts,tsx}
//   • setupFiles: src/test/setup.ts (MSW + matchers)
//   • coverage v8 con thresholds bajos al inicio; F4 sube a 40% frontend
// ============================================================
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false, // no procesar CSS en tests (Tailwind v4 — irrelevante para asserts)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/vite-env.d.ts',
        'src/main.tsx',
      ],
      // Piso global conservador basado en la cobertura verificada por FE-7.
      thresholds: { lines: 16, functions: 12, branches: 10, statements: 15 },
    },
  },
});
