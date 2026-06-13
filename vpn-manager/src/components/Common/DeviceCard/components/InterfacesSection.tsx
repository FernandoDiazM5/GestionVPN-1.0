import { Database } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import ParamRow from './ParamRow';

interface InterfacesSectionProps {
  antennaStats: AntennaStats;
}

export default function InterfacesSection({ antennaStats }: InterfacesSectionProps) {
  if (!antennaStats.ifaceDetails || antennaStats.ifaceDetails.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
        <Database className="w-3 h-3" /><span>Interfaces</span>
      </p>
      {antennaStats.ifaceDetails.map((ifc, i) => (
        <div key={i} className="mb-2 last:mb-0">
          <p className="text-2xs font-bold text-slate-400 uppercase mb-1">{ifc.ifname} {ifc.hwaddr && <span className="font-mono font-normal">{ifc.hwaddr}</span>}</p>
          <div className="pl-2 flex flex-col">
            {ifc.ipaddr && <ParamRow label="IP" value={ifc.ipaddr} />}
            {ifc.speed != null && <ParamRow label="Velocidad" value={`${ifc.speed} Mbps${ifc.duplex != null ? (ifc.duplex ? ' Full-Duplex' : ' Half-Duplex') : ''}`} />}
            {ifc.snr != null && <ParamRow label="SNR" value={`${ifc.snr} dB`} />}
          </div>
        </div>
      ))}
    </div>
  );
}
