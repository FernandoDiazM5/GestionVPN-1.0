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
      {/* Acción WG del flujo → .btn-accent (violet sólido; sin gradiente cross-hue, §4.7) */}
      <button
        disabled={!canProvision}
        onClick={onProvision}
        className="btn-accent btn-md inline-flex items-center"
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
          className="btn-success btn-md inline-flex items-center whitespace-nowrap"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
          <span>Generar Script Nodo</span>
        </button>
      </div>
    </div>
  );
}
