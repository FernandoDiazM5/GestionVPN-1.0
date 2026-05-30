import { Wifi } from 'lucide-react';
import type { AntennaStats } from '../../../types/devices';
import ParamRow from './ParamRow';
import { fmtMode, fmtSecurity } from '../utils/formatters';

interface WirelessParamsProps {
  antennaStats: AntennaStats;
}

export default function WirelessParams({ antennaStats }: WirelessParamsProps) {
  return (
    <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
        <Wifi className="w-3 h-3" /><span>Inalámbrico</span>
      </p>
      <div className="flex flex-col">
        <ParamRow label="Modo inalámbrico" value={fmtMode(antennaStats.mode)} />
        <ParamRow label="SSID" value={antennaStats.essid} />
        <ParamRow label="Seguridad" value={fmtSecurity(antennaStats.security)} />
        <ParamRow label="Canal / Frec." value={
          antennaStats.channelNumber && antennaStats.frequency
            ? `${antennaStats.channelNumber} / ${antennaStats.frequency} MHz`
            : antennaStats.frequency ? `${antennaStats.frequency} MHz` : null
        } />
        <ParamRow label="Ancho de canal" value={
          antennaStats.channelWidth
            ? `${antennaStats.channelWidth} MHz${antennaStats.channelWidthExt ? ` (${antennaStats.channelWidthExt})` : ''}`
            : null
        } />
        <ParamRow label="Banda de frecuencia" value={antennaStats.freqRange} />
        <ParamRow label="Cadenas TX/RX" value={antennaStats.chains} />
        <ParamRow label="Potencia de TX" value={antennaStats.txPower != null ? `${antennaStats.txPower} dBm` : null} />
        <ParamRow label="Antena" value={antennaStats.antenna} />
        <ParamRow label="AP MAC" value={antennaStats.apMac} />
        <ParamRow label="Distancia" value={
          antennaStats.distance != null
            ? `${(antennaStats.distance * 0.000621371).toFixed(1)} millas (${(antennaStats.distance / 1000).toFixed(2)} km)`
            : null
        } />
      </div>
    </div>
  );
}
