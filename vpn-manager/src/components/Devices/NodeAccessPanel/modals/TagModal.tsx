import { useState } from 'react';
import { X, Tag, Plus } from 'lucide-react';
import type { NodeInfo } from '../../../../types/api';

export default function TagModal({ node, currentTags, onSave, onClose }: {
  node: NodeInfo;
  currentTags: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [input, setInput] = useState('');
  const TAG_PALETTE = ['#6366f1', '#10b981', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#64748b'];
  const getColor = (tag: string) => TAG_PALETTE[tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_PALETTE.length];

  const addTag = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-amber-500 rounded-t-2xl px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Tag className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-bold text-white">Etiquetas — {node.nombre_nodo}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-amber-200 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="Nueva etiqueta (Enter para agregar)"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300" />
            <button onClick={addTag} disabled={!input.trim()}
              className="px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-40 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[40px]">
            {tags.length === 0 && <p className="text-xs text-slate-400 italic">Sin etiquetas</p>}
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: getColor(t) }}>
                {t}
                <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="hover:opacity-70">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              Cancelar
            </button>
            <button onClick={() => { onSave(tags); onClose(); }}
              className="flex-1 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors">
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
