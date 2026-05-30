import type { VpnSecret } from '../types';

interface UseSecretManagementReturn {
  isManaged: (id: string, name: string) => boolean;
  handleToggleManage: (secret: VpnSecret) => void;
}

export function useSecretManagement(
  managedVpns: VpnSecret[],
  setManagedVpns: (vpns: VpnSecret[] | ((prev: VpnSecret[]) => VpnSecret[])) => void,
): UseSecretManagementReturn {
  const isManaged = (id: string, name: string) =>
    managedVpns.some((v) => (id && v.id && v.id === id) || v.name === name);

  const handleToggleManage = (secret: VpnSecret) => {
    if (isManaged(secret.id, secret.name)) {
      setManagedVpns((prev) => prev.filter((v) => v.id !== secret.id && v.name !== secret.name));
    } else {
      setManagedVpns((prev) => [...prev, { ...secret, running: false }]);
    }
  };

  return { isManaged, handleToggleManage };
}
