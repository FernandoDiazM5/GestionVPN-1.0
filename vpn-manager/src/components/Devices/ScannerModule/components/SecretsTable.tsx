import SecretsTableToolbar from './SecretsTableToolbar';
import SecretsTableRow from './SecretsTableRow';
import SecretsPagination from './SecretsPagination';
import type { VpnSecret } from '../types';

interface SecretsTableProps {
  secrets: VpnSecret[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  filteredSecrets: VpnSecret[];
  pagedSecrets: VpnSecret[];
  totalPages: number;
  managedVpns: VpnSecret[];
  isManaged: (id: string, name: string) => boolean;
  onToggleManage: (secret: VpnSecret) => void;
}

export default function SecretsTable({
  secrets,
  searchTerm,
  onSearchChange,
  page,
  onPageChange,
  filteredSecrets,
  pagedSecrets,
  totalPages,
  managedVpns,
  isManaged,
  onToggleManage,
}: SecretsTableProps) {
  return (
    <div className="card overflow-hidden">
      <SecretsTableToolbar
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        totalSecrets={secrets.length}
        managedCount={managedVpns.length}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/30">
              <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-12 text-center">
                Estado
              </th>
              <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Nombre
              </th>
              <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Servicio
              </th>
              <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                Perfil
              </th>
              <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagedSecrets.map((secret) => (
              <SecretsTableRow
                key={secret.id}
                secret={secret}
                isManaged={isManaged(secret.id, secret.name)}
                onToggleManage={onToggleManage}
              />
            ))}
            {pagedSecrets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-slate-400 text-sm">
                  {searchTerm
                    ? `Sin resultados para "${searchTerm}"`
                    : 'El router no tiene secretos PPP configurados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <SecretsPagination
          currentPage={page}
          totalPages={totalPages}
          totalSecrets={filteredSecrets.length}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
