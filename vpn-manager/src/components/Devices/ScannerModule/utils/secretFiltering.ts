import { PAGE_SIZE } from '../constants';
import type { VpnSecret } from '../types';

export function filterSecrets(secrets: VpnSecret[], searchTerm: string): VpnSecret[] {
  return secrets.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
}

export function calculateTotalPages(filteredSecretsLength: number): number {
  return Math.max(1, Math.ceil(filteredSecretsLength / PAGE_SIZE));
}

export function getPaginatedSecrets(
  filteredSecrets: VpnSecret[],
  page: number,
): VpnSecret[] {
  return filteredSecrets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}
