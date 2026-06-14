import { Activity, Check, Copy, X } from 'lucide-react';
import type { ScannedDevice, SavedDevice } from '../../../../types/devices';
import { detectFamily } from '../utils/deviceFamily';
import { headerStyles } from '../utils/styles';

interface ModalHeaderProps {
  dev: ScannedDevice | SavedDevice;
  copiedIp: boolean;
  copyIp: () => void;
  onClose: () => void;
}

export default function ModalHeader({ dev, copiedIp, copyIp, onClose }: ModalHeaderProps) {
  const s = dev.cachedStats;
  const family = detectFamily(dev);

  const familyBadge =
    family === 'ac' ? (
      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/30 text-sky-200 uppercase tracking-wide">AC</span>
    ) : family === 'm5' ? (
      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/30 text-amber-200 uppercase tracking-wide">M5</span>
    ) : null;

  return (
    <div className={headerStyles.container}>
      <div className={headerStyles.titleSection}>
        <div className={headerStyles.iconWrapper}>
          <Activity className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className={headerStyles.titleContainer}>
            <p className="text-sm font-bold text-white">{s?.deviceName ?? dev.name}</p>
            {familyBadge}
          </div>
          <div className={headerStyles.subtitle}>
            <p className="text-2xs text-slate-400 dark:text-slate-500 font-mono">{dev.ip}</p>
            <button onClick={copyIp} className="text-slate-400 hover:text-white transition-colors">
              {copiedIp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
            <span className="text-2xs text-slate-400">·</span>
            <p className="text-2xs text-slate-400 dark:text-slate-500 font-mono truncate max-w-[200px]">{s?.deviceModel ?? dev.model ?? '—'}</p>
          </div>
        </div>
      </div>
      <button onClick={onClose} className={headerStyles.closeButton}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
