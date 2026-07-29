import { afterEach, describe, expect, it, vi } from 'vitest';
import { moduleLoaders, preloadModule } from './moduleLoaders';

describe('preloadModule', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('precarga la configuración correspondiente al alcance del usuario', async () => {
    const platform = vi.spyOn(moduleLoaders, 'platformSettings').mockResolvedValue({ default: (() => null) as never });
    const workspace = vi.spyOn(moduleLoaders, 'workspaceSettings').mockResolvedValue({ default: (() => null) as never });

    preloadModule('settings', true);
    preloadModule('settings', false);
    await Promise.resolve();

    expect(platform).toHaveBeenCalledTimes(1);
    expect(workspace).toHaveBeenCalledTimes(1);
  });

  it('absorbe un fallo oportunista sin generar un rechazo sin manejar', async () => {
    const failed = vi.spyOn(moduleLoaders, 'devices').mockRejectedValue(new Error('offline'));
    preloadModule('devices', false);
    await Promise.resolve();

    expect(failed).toHaveBeenCalledTimes(1);
  });
});
