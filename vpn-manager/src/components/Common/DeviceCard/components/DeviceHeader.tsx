import { Radio, Signal, Trash2 } from 'lucide-react';
import type { SavedDevice, AntennaStats } from '../../../types/devices';
import { cleanDeviceName } from '../utils/formatters';

interface DeviceHeaderProps {
  device: SavedDevice;
  antennaStats: AntennaStats | null;
  onRemove?: () => void;
  isPreview?: boolean;
}

export default function DeviceHeader({ device, antennaStats, onRemove, isPreview }: DeviceHeaderProps) {
  const roleLabel = device.role === 'ap' ? 'AP' : device.role === 'sta' ? 'CPE' : '?';
  const roleGrad = device.role === 'ap' ? 'from-indigo-500 to-indigo-600' : 'from-violet-500 to-violet-600';
  const displayName = cleanDeviceName(device.deviceName) || device.name;

  return (
    <div className={`bg-gradient-to-r ${roleGrad} px-4 py-3 flex items-center justify-between`}>
      <div className="flex items-center space-x-3 min-w-0">
        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
          {device.role === 'ap' ? <Radio className="w-4.5 h-4.5 text-white" /> : <Signal className="w-4.5 h-4.5 text-white" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center space-x-2">
            <h3 className="font-bold text-white text-sm truncate">{displayName}</h3>
            <span className="text-[9px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded-md shrink-0">{roleLabel}</span>
          </div>
          <p className="text-[10px] text-white/70 font-mono truncate">{antennaStats?.deviceModel || device.model} · {antennaStats?.firmwareVersion || device.firmware}</p>
        </div>
      </div>
      {!isPreview && onRemove && (
        <button onClick={onRemove} className="p-1.5 text-white/50 hover:text-white hover:bg-white/20 rounded-lg transition-colors shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
