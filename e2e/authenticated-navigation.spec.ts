import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures/session';

async function visibleNavigation(page: Page): Promise<Locator> {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    return page.getByRole('dialog', { name: 'Navegación principal' }).getByRole('navigation');
  }
  return page.locator('aside').getByRole('navigation');
}

test('OWNER respeta RBAC y conserva historial entre rutas', async ({ page, loginAs }) => {
  await loginAs('OWNER');
  await page.goto('./dashboard');

  await expect(page).toHaveURL(/\/nodes$/);
  const navigation = await visibleNavigation(page);
  await expect(navigation.getByRole('button', { name: 'Nodos' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Escanear' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Workspace' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Monitor AP' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Ajustes' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);

  await navigation.getByRole('button', { name: 'Workspace' }).click();
  await expect(page).toHaveURL(/\/team$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/nodes$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/team$/);
});

test('MEMBER no monta modulos fuera de su rol', async ({ page, loginAs }) => {
  await loginAs('MEMBER');
  await page.goto('./monitor');

  await expect(page).toHaveURL(/\/nodes$/);
  const navigation = await visibleNavigation(page);
  await expect(navigation.getByRole('button', { name: 'Nodos' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Workspace' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Ajustes' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Escanear' })).toHaveCount(0);
  await expect(navigation.getByRole('button', { name: 'Monitor AP' })).toHaveCount(0);
  await expect(navigation.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);
});
