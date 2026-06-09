// ============================================================
//  Playwright config — E2E (FASE 3 del REFACTOR_PLAN)
//
//   • Solo chromium para mantener install rápido (~150MB).
//   • baseURL: el dev server de Vite (asume frontend corriendo en :5173).
//   • CI: 1 retry, sin watch.
//   • Local: traces solo en fallo, video off (ahorra disco).
//
//  IMPORTANTE: este config no levanta backend ni MySQL. Los specs deben
//  mockear o ejercer solo flujos que no requieren BD (la pantalla de
//  login es suficiente para el smoke).
// ============================================================
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173/GestionVPN-1.0/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Levanta el dev server de Vite si no está corriendo ya
  webServer: {
    command: 'npm run dev --prefix vpn-manager',
    url: 'http://localhost:5173/GestionVPN-1.0/',
    reuseExistingServer: !isCI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
