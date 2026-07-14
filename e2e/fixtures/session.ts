import { test as base } from '@playwright/test';

type WorkspaceRole = 'OWNER' | 'MEMBER';

interface SessionFixtures {
  loginAs: (role: WorkspaceRole) => Promise<void>;
}

export const test = base.extend<SessionFixtures>({
  loginAs: async ({ page }, use) => {
    await use(async role => {
      await page.route('**/api/**', async route => {
        const pathname = new URL(route.request().url()).pathname;

        if (pathname.endsWith('/api/account/me')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              user: {
                id: `${role.toLowerCase()}-e2e`,
                email: `${role.toLowerCase()}@example.test`,
                name: role === 'OWNER' ? 'Owner E2E' : 'Member E2E',
                role,
                workspace_id: 'workspace-e2e',
                workspace_name: 'Workspace E2E',
                platform_admin: false,
              },
            }),
          });
          return;
        }

        if (pathname.endsWith('/api/tunnel/events')) {
          await route.abort();
          return;
        }

        if (pathname.endsWith('/api/tunnel/status')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, active: false, node: null, expiresAt: null }),
          });
          return;
        }

        const body = pathname.endsWith('/api/nodes')
          ? []
          : pathname.endsWith('/api/wireguard/peers')
            ? { success: true, peers: [] }
            : pathname.endsWith('/api/wireguard/peer/colors')
              ? { success: true, colors: {} }
              : pathname.endsWith('/api/settings/get')
                ? { success: true, settings: {} }
                : { success: true };

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      });
    });
  },
});

export { expect } from '@playwright/test';
