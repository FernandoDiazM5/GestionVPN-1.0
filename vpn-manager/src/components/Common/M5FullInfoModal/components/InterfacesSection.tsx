import { Network } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import M5Row from './M5Row';
import M5Section from './M5Section';
import IfaceBlock from './IfaceBlock';
import { SECTION_TITLES } from '../constants';

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
    </M5Section>
  );
}
