import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useWorkspaceSession } from '../context/WorkspaceSession';
import { deviceDb } from '../store/deviceDb';
import type { SessionUser } from '../types/account';
import type { SavedDevice } from '../types/devices';

export function deviceInventoryKey(session: SessionUser | null) {
  return [
    'device-inventory',
    session?.workspace_id ?? 'no-workspace',
    session?.id ?? 'no-user',
    session?.role ?? 'no-role',
    session?.platform_admin ? 'platform' : 'workspace',
  ] as const;
}

function withoutSshSecret(device: SavedDevice): SavedDevice {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sshPass: _secret, ...safeDevice } = device;
  return safeDevice;
}

export function useDeviceInventory() {
  const { session } = useWorkspaceSession();
  return useQuery({
    queryKey: deviceInventoryKey(session),
    queryFn: () => deviceDb.loadInventory(),
    enabled: !!session?.workspace_id && !!session?.id,
  });
}

export function useDeviceInventoryCache() {
  const { session } = useWorkspaceSession();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => deviceInventoryKey(session),
    [session],
  );

  const replace = useCallback((devices: SavedDevice[]) => {
    queryClient.setQueryData<SavedDevice[]>(
      queryKey,
      devices.map(withoutSshSecret),
    );
  }, [queryClient, queryKey]);

  const upsert = useCallback((device: SavedDevice) => {
    const safeDevice = withoutSshSecret(device);
    queryClient.setQueryData<SavedDevice[]>(queryKey, current => {
      const devices = current ?? [];
      return devices.some(item => item.id === safeDevice.id)
        ? devices.map(item => item.id === safeDevice.id ? safeDevice : item)
        : [...devices, safeDevice];
    });
  }, [queryClient, queryKey]);

  const remove = useCallback((id: string) => {
    queryClient.setQueryData<SavedDevice[]>(
      queryKey,
      current => (current ?? []).filter(device => device.id !== id),
    );
  }, [queryClient, queryKey]);

  return useMemo(
    () => ({ replace, upsert, remove }),
    [remove, replace, upsert],
  );
}
