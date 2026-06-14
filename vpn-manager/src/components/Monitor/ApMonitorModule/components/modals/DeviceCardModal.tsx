import { X } from 'lucide-react';
import DeviceCard from '../../../../Common/DeviceCard';
import type { SavedDevice } from '../../../../../types/devices';

function DeviceCardModal({ device, onClose, onRemove, onUpdate }: {
  device: SavedDevice; onClose: () => void;
  onRemove?: () => void; onUpdate?: (updated: SavedDevice) => void;
}) {
  return (
    <div className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel modal-panel-md overflow-y-auto">
        <div className="flex items-center justify-between bg-slate-800 rounded-t-2xl px-4 py-2.5">
          <span className="text-xs font-bold text-slate-300">Detalle del dispositivo</span>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <DeviceCard
          device={device}
          onRemove={onRemove ? () => { onRemove(); onClose(); } : undefined}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}

export default DeviceCardModal;
