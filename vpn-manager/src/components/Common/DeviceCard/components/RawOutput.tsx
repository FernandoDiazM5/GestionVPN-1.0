import type { AntennaStats } from '../../../../types/devices';

interface RawOutputProps {
  antennaStats: AntennaStats | null;
}

export default function RawOutput({ antennaStats }: RawOutputProps) {
  if (!antennaStats?.raw) return null;

  return (
    <div className="mx-4 mb-4">
      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Output SSH</p>
      <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
        {antennaStats.raw.split('\n').filter(Boolean).map((line, i) => {
          const eq = line.indexOf('=');
          const k = eq > 0 ? line.slice(0, eq).trim() : line;
          const v = eq > 0 ? line.slice(eq + 1).trim() : '';
          return (
            <div key={i} className={`flex items-center justify-between px-3 py-1.5 text-[11px]
                ${i % 2 === 0 ? 'bg-slate-800/80' : 'bg-slate-800/40'}`}>
              <span className="font-mono text-slate-400">{k}</span>
              <span className="font-mono text-emerald-400 font-semibold">{v}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
