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
        <div className="modal-header-decorated modal-header-slate px-4 py-2.5">
          <span className="text-xs font-bold text-slate-300">Detalle del dispositivo</span>
          <button onClick={onClose} className="modal-header-close">
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
