import { Info } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import ParamRow from './ParamRow';
import { cleanDeviceName, fmtNetRole } from '../utils/formatters';

interface DeviceParamsProps {
  antennaStats: AntennaStats;
}

export default function DeviceParams({ antennaStats }: DeviceParamsProps) {
  return (
    <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
        <Info className="w-3 h-3" /><span>Dispositivo</span>
      </p>
      <div className="flex flex-col">
        <ParamRow label="Modelo" value={antennaStats.deviceModel} />
        <ParamRow label="Nombre" value={cleanDeviceName(antennaStats.deviceName)} />
        <ParamRow label="Modo de red" value={fmtNetRole(antennaStats.networkMode)} />
        <ParamRow label="Versión" value={antennaStats.firmwareVersion} />
        <ParamRow label="Tiempo activo" value={antennaStats.uptimeStr} />
        <ParamRow label="Fecha" value={antennaStats.deviceDate} />
        <ParamRow label="WLAN MAC" value={antennaStats.wlanMac} />
        <ParamRow label="LAN MAC" value={antennaStats.lanMac} />
        <ParamRow label="LAN" value={antennaStats.lanInfo} />
      </div>
    </div>
  );
}
