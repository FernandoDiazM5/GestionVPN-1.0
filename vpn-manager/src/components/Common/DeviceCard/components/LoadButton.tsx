import { RefreshCw, Clock } from 'lucide-react';
import type { SavedDevice, AntennaStats } from '../../../types/devices';

interface LoadButtonProps {
  isLoading: boolean;
  antennaStats: AntennaStats | null;
  device: SavedDevice;
  isPreview?: boolean;
  onLoad: () => void;
}

export default function LoadButton({ isLoading, antennaStats, device, isPreview, onLoad }: LoadButtonProps) {
  return (
    <div className="p-4 pb-3 space-y-2">
      {device.cachedStats && device.lastSeen && (
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center font-mono font-medium tracking-wide">
          <Clock className="w-3 h-3 inline mr-1 opacity-60" />
          {new Date(device.lastSeen).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      )}
      <button
        onClick={onLoad}
        disabled={isLoading || isPreview}
        title={isPreview ? "Modo vista previa" : ""}
        className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl text-xs font-bold uppercase tracking-wider
            bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-600 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 text-indigo-700 dark:text-white transition-all active:scale-[0.98]"
      >
        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin opacity-50' : ''}`} />
        <span>{(antennaStats || device.cachedStats) ? 'Actualizar Datos' : 'Obtener Telemetría'}</span>
      </button>
    </div>
  );
}
