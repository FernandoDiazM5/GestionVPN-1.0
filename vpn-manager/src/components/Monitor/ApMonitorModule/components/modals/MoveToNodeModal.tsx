import { useState } from 'react';
import { X, ArrowRightLeft } from 'lucide-react';
import type { SavedDevice } from '../../../../../types/devices';
import type { NodeInfo } from '../../../../../types/api';

function MoveToNodeModal({ device, nodes, knownNames, onConfirm, onClose }: {
  device: SavedDevice;
  nodes: NodeInfo[];
  knownNames: string[];
  onConfirm: (nodeId: string, nodeName: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const options: { id: string; name: string }[] = [
    ...nodes.map(n => ({ id: n.id, name: n.nombre_nodo })),
    ...knownNames
      .filter(name => !nodes.some(n => n.nombre_nodo === name))
      .map(name => ({ id: name, name })),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-200 dark:bg-slate-900 dark:border dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
              Mover a nodo
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">{device.name || device.ip} · actual: <span className="font-medium">{device.nodeName}</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {options.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">
              Sin nodos disponibles.<br />Conéctate al MikroTik para cargar los nodos.
            </p>
          )}
          {options.map(opt => (
            <button key={opt.id} onClick={() => setSelected(opt)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium border transition-all
                ${selected?.id === opt.id
                  ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500'
                  : opt.name === device.nodeName
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-indigo-500/10 dark:hover:border-indigo-500/40'}`}
              disabled={opt.name === device.nodeName}>
              {opt.name}
              {opt.name === device.nodeName && <span className="ml-2 text-2xs opacity-60">(nodo actual)</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            Cancelar
          </button>
          <button
            onClick={() => selected && selected.name !== device.nodeName && onConfirm(selected.id, selected.name)}
            disabled={!selected || selected.name === device.nodeName}
            className="btn-primary btn-md flex-1">
            Mover
          </button>
        </div>
      </div>
    </div>
  );
}

export default MoveToNodeModal;
