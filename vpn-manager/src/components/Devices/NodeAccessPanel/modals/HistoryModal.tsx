import { X, History } from 'lucide-react';
import type { NodeInfo } from '../../../../types/api';

interface HistoryModalProps {
  node: NodeInfo;
  onClose: () => void;
}

export default function HistoryModal({ node, onClose }: HistoryModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-slate-700 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-white" />
            <p className="text-sm font-bold text-white">Historial — {node.nombre_nodo}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          <p className="text-xs text-slate-400">Historial de eventos y cambios</p>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="w-full px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
