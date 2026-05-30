import { X } from 'lucide-react';

interface TagModalProps {
  node: { nombre_nodo: string };
  currentTags: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
}

export default function TagModal({ node, currentTags, onSave, onClose }: TagModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-violet-600 rounded-t-2xl px-5 py-4 shrink-0">
          <p className="text-sm font-bold text-white">Etiquetas — {node.nombre_nodo}</p>
          <button onClick={onClose} className="p-1.5 text-violet-300 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-xs text-slate-400">Gestión de etiquetas para este nodo</p>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button onClick={() => { onSave(currentTags); onClose(); }} className="flex-1 px-4 py-2 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
