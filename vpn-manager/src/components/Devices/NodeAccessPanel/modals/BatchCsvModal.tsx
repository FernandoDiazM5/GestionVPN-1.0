import { X, Upload } from 'lucide-react';
import type { NodeInfo } from '../../../../types/api';

interface BatchCsvModalProps {
  onClose: () => void;
  onSuccess: () => void;
  nodes: NodeInfo[];
}

export default function BatchCsvModal({ onClose, onSuccess, nodes }: BatchCsvModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-emerald-600 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-white" />
            <p className="text-sm font-bold text-white">Importar desde CSV</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-emerald-300 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-xs text-emerald-700 font-medium">Carga un archivo CSV con columnas: nombre, usuario_ppp, contraseña, lans</p>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
            <p className="text-sm text-slate-500">Arrastra un archivo CSV aquí o haz clic para seleccionar</p>
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
              Cancelar
            </button>
            <button onClick={() => { onSuccess(); onClose(); }} className="flex-1 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              Procesar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
