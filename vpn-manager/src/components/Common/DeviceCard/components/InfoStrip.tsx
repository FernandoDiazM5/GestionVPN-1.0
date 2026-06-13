import type { SavedDevice, AntennaStats } from '../../../../types/devices';

interface InfoStripProps {
  device: SavedDevice;
  antennaStats: AntennaStats | null;
}

export default function InfoStrip({ device, antennaStats }: InfoStripProps) {
  return (
    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-2xs dark:bg-slate-800/60 dark:border-slate-800">
      <span className="font-mono font-semibold text-slate-600">{device.ip}</span>
      {device.mac && <span className="font-mono text-slate-400">{device.mac}</span>}
      <span className="text-indigo-600 font-semibold">{device.nodeName}</span>
      {device.frequency
        ? <span className={`font-bold ${device.frequency >= 5000 ? 'text-sky-600' : 'text-amber-600'}`}>
          {(device.frequency / 1000).toFixed(1)} GHz
        </span>
        : null}
      {(() => {
        const m = antennaStats?.mode || device.cachedStats?.mode || (device.role !== 'unknown' ? device.role : null);
        if (!m) return null;
        const isAp = m === 'ap' || m === 'master';
        const isSta = m === 'sta';
        return (
          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-md
            ${isAp ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400' : isSta ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-300'}`}>
            {isAp ? 'Punto de Acceso' : isSta ? 'Estación' : m.toUpperCase()}
          </span>
        );
      })()}
    </div>
  );
}
