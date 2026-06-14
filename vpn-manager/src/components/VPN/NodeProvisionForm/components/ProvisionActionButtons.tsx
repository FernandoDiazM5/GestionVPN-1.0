import { Cpu, Terminal, Loader2 } from 'lucide-react';

interface ProvisionActionButtonsProps {
  canProvision: boolean;
  isProvisioning: boolean;
  isGenerating: boolean;
  serverPublicIP: string;
  onServerPublicIPChange: (value: string) => void;
  onProvision: () => void;
  onGenerateScript: () => void;
}

export function ProvisionActionButtons({
  canProvision,
  isProvisioning,
  isGenerating,
  serverPublicIP,
  onServerPublicIPChange,
  onProvision,
  onGenerateScript,
}: ProvisionActionButtonsProps) {
  const canGenerateScript = serverPublicIP && !isGenerating;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        disabled={!canProvision}
        onClick={onProvision}
        className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all
          ${canProvision
            ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/25 hover:shadow-lg active:scale-[0.98]'
            : 'bg-slate-100 text-slate-300 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'}`}
      >
        {isProvisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
        <span>{isProvisioning ? 'Creando...' : 'Crear Nodo en Servidor'}</span>
      </button>

      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={serverPublicIP}
          onChange={e => onServerPublicIPChange(e.target.value)}
          placeholder="IP pública servidor (ej: 213.173.36.232)"
          className="input-field w-64 text-xs"
        />
        <button
          disabled={!canGenerateScript}
          onClick={onGenerateScript}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap
            ${canGenerateScript
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-500/25 hover:shadow-lg active:scale-[0.98]'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'}`}
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
          <span>Generar Script Nodo</span>
        </button>
      </div>
    </div>
  );
}
