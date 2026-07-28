import { useState } from 'react';
import { X, Tag, Plus } from 'lucide-react';
import type { NodeInfo } from '../../../../types/api';
import Dialog from '../../../Common/Dialog';
import SiteModalHeader from '../../../Common/SiteModalHeader';

export default function TagModal({ node, currentTags, onSave, onClose }: {
  node: NodeInfo;
  currentTags: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [input, setInput] = useState('');
  const addTag = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setInput('');
  };

  return (
    <Dialog
      title={`Organizar sitio ${node.nombre_nodo}`}
      onClose={onClose}
      panelClassName="modal-panel modal-panel-sm"
    >
        <SiteModalHeader
          icon={Tag}
          title="Organizar sitio"
          siteName={node.nombre_nodo}
          description="Agrega etiquetas para encontrarlo más rápido"
          onClose={onClose}
        />
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="Escribe una etiqueta"
              className="input-field min-h-11 flex-1 px-3 py-2" />
            <button onClick={addTag} disabled={!input.trim()}
              className="btn-primary btn-icon min-h-11 min-w-11" aria-label="Agregar etiqueta">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[40px]">
            {tags.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Este sitio todavía no tiene etiquetas.</p>}
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                {t}
                <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="rounded-full hover:opacity-70" aria-label={`Quitar etiqueta ${t}`}>
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button onClick={onClose} className="btn-outline btn-md flex-1">
              Cancelar
            </button>
            <button onClick={() => { onSave(tags); onClose(); }}
              className="btn-primary btn-md flex-1">
              Guardar cambios
            </button>
          </div>
        </div>
    </Dialog>
  );
}
