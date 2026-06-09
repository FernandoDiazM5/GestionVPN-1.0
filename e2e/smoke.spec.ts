// ============================================================
//  e2e/smoke.spec.ts — verifica que la app responde y renderiza el
//  login. No requiere backend para pasar, porque la pantalla de login
//  se carga aunque MySQL no esté arriba.
// ============================================================
import { test, expect } from '@playwright/test';

test('app carga y muestra pantalla de acceso', async ({ page }) => {
  await page.goto('/');
  // El título de la app aparece en cualquier vista pública
  await expect(page).toHaveTitle(/MikroTik|VPN|GestionVPN/i, { timeout: 15_000 });
  // Y el body NO está vacío
  const html = await page.locator('body').innerHTML();
  expect(html.length).toBeGreaterThan(100);
});
