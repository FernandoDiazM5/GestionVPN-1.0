import { Search } from 'lucide-react';

interface SecretsTableToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  totalSecrets: number;
  managedCount: number;
}

export default function SecretsTableToolbar({
  searchTerm,
  onSearchChange,
  totalSecrets,
  managedCount,
}: SecretsTableToolbarProps) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
        <input
          type="text"
          placeholder="Filtrar por nombre..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input-field pl-9 py-2"
        />
      </div>
      <div className="ml-auto flex items-center space-x-3 text-sm text-slate-500">
        <span>
          <span className="font-bold text-indigo-600">{totalSecrets}</span> secretos
        </span>
        <span className="text-slate-400 dark:text-slate-500">|</span>
        <span>
          <span className="font-bold text-emerald-600">{managedCount}</span> gestionados
        </span>
      </div>
    </div>
  );
}
