import { PlusCircle, ChevronUp, ChevronDown } from 'lucide-react';

interface ProvisionFormHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function ProvisionFormHeader({ isOpen, onToggle }: ProvisionFormHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full px-5 py-4 flex items-center justify-between bg-gradient-to-r from-violet-50 to-indigo-50 hover:from-violet-100 hover:to-indigo-100 transition-colors"
    >
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/25">
          <PlusCircle className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-slate-800 text-sm">Provisionar Nuevo Nodo</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Crear VPN + VRF + Rutas automáticamente</p>
        </div>
      </div>
      {isOpen ? (
        <ChevronUp className="w-4 h-4 text-slate-400" />
      ) : (
        <ChevronDown className="w-4 h-4 text-slate-400" />
      )}
    </button>
  );
}
