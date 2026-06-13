import { Activity } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';

interface StationsListProps {
  antennaStats: AntennaStats;
}

export default function StationsList({ antennaStats }: StationsListProps) {
  if (!antennaStats.stations || antennaStats.stations.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
        <Activity className="w-3 h-3" /><span>Estaciones ({antennaStats.stations.length})</span>
      </p>
      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
        {antennaStats.stations.map((sta, i) => (
          <div key={i}
            className={`px-3 py-2.5 text-xs border-b border-slate-100 dark:border-slate-700 last:border-0
                ${i % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/80' : 'bg-white dark:bg-slate-800/40'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-emerald-600 dark:text-emerald-400 text-2xs">{sta.mac}</span>
              {sta.hostname && <span className="text-2xs text-slate-500 truncate max-w-[50%]">{sta.hostname}</span>}
              {sta.remoteModel && <span className="text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded">{sta.remoteModel}</span>}
            </div>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300 font-mono text-2xs">
              {sta.signal != null && <span className={sta.signal >= -65 ? 'text-emerald-600 dark:text-emerald-400' : sta.signal >= -75 ? 'text-sky-600' : 'text-amber-500'}>{sta.signal} dBm</span>}
              {sta.noiseFloor != null && <span className="text-slate-400">/ {sta.noiseFloor} dBm</span>}
              {sta.ccq != null && <span className={sta.ccq >= 80 ? 'text-emerald-600 dark:text-emerald-400' : sta.ccq >= 60 ? 'text-sky-600' : 'text-amber-500'}>{sta.ccq}%</span>}
              {sta.txRate != null && <span className="text-emerald-600 dark:text-emerald-400">{sta.txRate}↑</span>}
              {sta.rxRate != null && <span className="text-sky-600 dark:text-sky-400">{sta.rxRate}↓ Mbps</span>}
              {sta.distance != null && <span className="text-slate-400">{sta.distance}m</span>}
              {sta.txLatency != null && <span className="text-violet-500">{sta.txLatency}ms</span>}
              {sta.airmaxQuality != null && <span className="text-indigo-500">AM:{sta.airmaxQuality}%</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
