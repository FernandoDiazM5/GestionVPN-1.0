import { X } from 'lucide-react';
import type { DeviceCardModalProps } from '../types';
import DeviceCard from '../../../Common/DeviceCard';

export function DeviceCardModal({ device, onClose, onRemove, onUpdate, isPreview }: DeviceCardModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-4 py-2.5">
          <span className="text-xs font-bold text-slate-300">
            {isPreview ? 'Vista previa del dispositivo' : 'Detalle del dispositivo'}
          </span>
          <button onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <DeviceCard
          device={device}
          onRemove={onRemove ? () => { onRemove(); onClose(); } : undefined}
          onUpdate={onUpdate}
          isPreview={isPreview}
        />
      </div>
    </div>
  );
}
