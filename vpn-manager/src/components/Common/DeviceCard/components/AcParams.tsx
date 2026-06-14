import { Thermometer } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import ParamRow from './ParamRow';

interface AcParamsProps {
  antennaStats: AntennaStats;
}

export default function AcParams({ antennaStats }: AcParamsProps) {
  const hasAcParams = antennaStats.temperature != null || antennaStats.cinr != null || antennaStats.txNss != null
    || antennaStats.dcap != null || antennaStats.airtime != null || antennaStats.gpsSync != null
    || antennaStats.antennaGain != null || antennaStats.centerFreq1 != null;

  if (!hasAcParams) return null;

  return (
    <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
        <Thermometer className="w-3 h-3 text-amber-500" /><span>Parámetros AC</span>
      </p>
      <div className="flex flex-col">
        <ParamRow label="Temperatura" value={antennaStats.temperature != null ? `${antennaStats.temperature} °C` : null} />
        <ParamRow label="CINR" value={antennaStats.cinr != null ? `${antennaStats.cinr} dB` : null} />
        <ParamRow label="Flujos TX/RX (NSS)" value={(antennaStats.txNss != null || antennaStats.rxNss != null)
          ? `${antennaStats.txNss ?? '—'} TX / ${antennaStats.rxNss ?? '—'} RX` : null} />
        <ParamRow label="Índice MCS TX/RX" value={(antennaStats.txIdx != null || antennaStats.rxIdx != null)
          ? `${antennaStats.txIdx ?? '—'} / ${antennaStats.rxIdx ?? '—'}` : null} />
        <ParamRow label="Ganancia de antena" value={antennaStats.antennaGain != null ? `${antennaStats.antennaGain} dBi` : null} />
        <ParamRow label="Frecuencia central" value={antennaStats.centerFreq1 != null ? `${antennaStats.centerFreq1} MHz` : null} />
        <ParamRow label="Airtime total" value={antennaStats.airtime != null ? `${antennaStats.airtime}%` : null} />
        <ParamRow label="Airtime TX / RX" value={(antennaStats.txAirtime != null || antennaStats.rxAirtime != null)
          ? `${antennaStats.txAirtime ?? '—'}% / ${antennaStats.rxAirtime ?? '—'}%` : null} />
        <ParamRow label="Capacidad DL / UL" value={(antennaStats.dcap != null || antennaStats.ucap != null)
          ? `${antennaStats.dcap ?? '—'}% / ${antennaStats.ucap ?? '—'}%` : null} />
        <ParamRow label="GPS Sync" value={antennaStats.gpsSync != null ? (antennaStats.gpsSync ? 'Sí' : 'No') : null} />
        <ParamRow label="Tramas fijas" value={antennaStats.fixedFrame != null ? (antennaStats.fixedFrame ? 'Sí' : 'No') : null} />
        {antennaStats.chainNames && antennaStats.chainNames.length > 0 && (
          <ParamRow label="Cadenas" value={antennaStats.chainNames.join(', ')} />
        )}
      </div>
    </div>
  );
}
