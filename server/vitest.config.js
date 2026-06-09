// ============================================================
//  Vitest config — backend (FASE 3 del REFACTOR_PLAN)
//
//  Características:
//   • Entorno Node (default — no jsdom)
//   • test/**/*.test.js + test/**/*.spec.js
//   • Globals (describe/it/expect sin imports) para concisión
//   • Coverage v8 con thresholds bajos al inicio; F4 sube a 60%
//   • setupFiles: silencia logger pino durante tests
// ============================================================
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.{test,spec}.js'],
    setupFiles: ['./test/setup.js'],
    // Aislamiento: cada archivo en su fork (evita estado compartido entre tests
    // como cachés singleton de MySQL pool / RouterOS).
    isolate: true,
    poolOptions: { forks: { singleFork: false } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['lib/**', 'db/repos/**', 'middleware/**', 'routes/**'],
      exclude: ['test/**', '**/*.config.*', 'db/init*.js', 'db/seed*.js', 'db/migrate*.js'],
      // Thresholds tras F4: gating mínimo (coverage actual ≈ 5%). Solo
      // protege contra regresión total. F8/F11 los suben a 60% al cubrir
      // routes/* tras los splits de god-files.
      thresholds: { lines: 5, functions: 5, branches: 45, statements: 5 },
    },
  },
});
