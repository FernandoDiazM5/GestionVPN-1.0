import { Network } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import M5Row from './M5Row';
import M5Section from './M5Section';
import IfaceBlock from './IfaceBlock';
import { rawDataStyles } from '../utils/styles';
import { RAW_DATA_LABELS, SECTION_TITLES } from '../constants';

interface InterfacesSectionProps {
  s: AntennaStats;
}

export default function InterfacesSection({ s }: InterfacesSectionProps) {
  return (
    <M5Section
      title={SECTION_TITLES.INTERFACES}
      icon={<Network className="w-3.5 h-3.5" />}
      colorClass="bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-400"
    >
      {s.ifaceDetails && s.ifaceDetails.length > 0 ? (
        s.ifaceDetails.map(ifc => <IfaceBlock key={ifc.ifname} ifc={ifc} />)
      ) : (
        <>
          <M5Row label="wlan (ath0)" value={s.wlanMac ?? null} />
          <M5Row label="eth0 (lan)" value={s.lanMac ?? null} />
          <M5Row label="lan speed" value={s.lanSpeed != null ? `${s.lanSpeed} Mbps` : null} />
          <M5Row label="lan info" value={s.lanInfo} />
        </>
      )}
      {s.ifaceTraffic && Object.keys(s.ifaceTraffic).length > 0 && (
        <div className="col-span-2 mt-2">
          <p className={`${rawDataStyles.label} text-violet-600`}>{RAW_DATA_LABELS.TRAFFIC}</p>
          <div className="grid grid-cols-1 gap-1">
            {Object.entries(s.ifaceTraffic).map(([iface, tr]) => (
              <div key={iface} className={`${rawDataStyles.pre} border-violet-100 text-violet-700`}>
                <span className="font-bold text-violet-700">{iface}:</span>{' '}
                RX {(tr.rxBytes / 1024 / 1024).toFixed(1)} MB ({tr.rxPackets} pkts){' '}
                | TX {(tr.txBytes / 1024 / 1024).toFixed(1)} MB ({tr.txPackets} pkts)
              </div>
            ))}
          </div>
        </div>
      )}
      {s._rawRoutes && (
        <div className="col-span-2 mt-2">
          <p className={`${rawDataStyles.label} text-violet-600`}>{RAW_DATA_LABELS.ROUTE}</p>
          <pre className={`${rawDataStyles.pre} border-violet-100 max-h-24`}>{s._rawRoutes}</pre>
        </div>
      )}
    </M5Section>
  );
}
