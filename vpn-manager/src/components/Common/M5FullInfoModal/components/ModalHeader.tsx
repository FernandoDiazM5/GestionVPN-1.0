import { Check, Copy, RadioTower, Sparkles, X } from 'lucide-react';
import type { ScannedDevice, SavedDevice } from '../../../../types/devices';
import { detectFamily } from '../utils/deviceFamily';
import { headerStyles } from '../utils/styles';

interface ModalHeaderProps {
  dev: ScannedDevice | SavedDevice;
  copiedIp: boolean;
  copyIp: () => void;
  onClose: () => void;
  onAnalyzeWithAi?: () => void;
}

export default function ModalHeader({ dev, copiedIp, copyIp, onClose, onAnalyzeWithAi }: ModalHeaderProps) {
  const s = dev.cachedStats;
  const family = detectFamily(dev);

  const familyBadge =
    family === 'ac' ? (
      <span className="px-1.5 py-0.5 rounded text-3xs font-bold bg-sky-500/30 text-sky-200 uppercase tracking-wide">AC</span>
    ) : family === 'm5' ? (
      <span className="px-1.5 py-0.5 rounded text-3xs font-bold bg-amber-500/30 text-amber-200 uppercase tracking-wide">M5</span>
    ) : null;

  return (
    <div className={headerStyles.container}>
      <div className={headerStyles.titleSection}>
        <div className={headerStyles.iconWrapper}>
          <RadioTower className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className={headerStyles.titleContainer}>
            <p className="text-sm font-bold text-white">{s?.deviceName ?? dev.name}</p>
            {familyBadge}
          </div>
          <div className={headerStyles.subtitle}>
            <p className="text-2xs text-slate-500 dark:text-slate-500 font-mono">{dev.ip}</p>
            <button onClick={copyIp} aria-label="Copiar IP" className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              {copiedIp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
            <span className="text-2xs text-slate-400">·</span>
            <p className="text-2xs text-slate-500 dark:text-slate-500 font-mono truncate max-w-[200px]">{s?.deviceModel ?? dev.model ?? '—'}</p>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onAnalyzeWithAi && s && (
          <button
            onClick={onAnalyzeWithAi}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 text-xs font-bold text-violet-100 hover:bg-violet-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            <Sparkles className="h-4 w-4" />
            Analizar con Gemini
          </button>
        )}
        <button onClick={onClose} aria-label="Cerrar informe AirOS" className={headerStyles.closeButton}>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
