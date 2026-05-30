import { Zap } from 'lucide-react';
import type { AntennaStats } from '../../../types/devices';
import ParamRow from './ParamRow';

interface AdvancedParamsProps {
  antennaStats: AntennaStats;
}

export default function AdvancedParams({ antennaStats }: AdvancedParamsProps) {
  const hasAdvanced = antennaStats.txRetries != null || antennaStats.chainRssi != null || antennaStats.opmode != null
    || antennaStats.atpcStatus != null || antennaStats.airsyncMode != null || antennaStats.countryCode != null;

  if (!hasAdvanced) return null;

  return (
    <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
        <Zap className="w-3 h-3 text-amber-500" /><span>Avanzado</span>
      </p>
      <div className="flex flex-col">
        <ParamRow label="Modo HT/WiFi" value={antennaStats.opmode} />
        <ParamRow label="Reintentos TX" value={antennaStats.txRetries != null ? String(antennaStats.txRetries) : null} />
        <ParamRow label="Balizas perdidas" value={antennaStats.missedBeacons != null ? String(antennaStats.missedBeacons) : null} />
        <ParamRow label="Errores RX (cripto)" value={antennaStats.rxCrypts != null ? String(antennaStats.rxCrypts) : null} />
        <ParamRow label="ATPC" value={antennaStats.atpcStatus} />
        <ParamRow label="Airsync" value={antennaStats.airsyncMode} />
        <ParamRow label="País/Región" value={antennaStats.countryCode} />
        <ParamRow label="Familia FW" value={antennaStats.fwPrefix} />
        {antennaStats.chainRssi && antennaStats.chainRssi.length > 0 && (
          <ParamRow label="RSSI por cadena" value={antennaStats.chainRssi.map(v => `${v} dBm`).join(' / ')} />
        )}
      </div>
    </div>
  );
}
