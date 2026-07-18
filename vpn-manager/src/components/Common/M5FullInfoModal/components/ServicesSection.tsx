import { Shield } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import M5Row from './M5Row';
import M5Section from './M5Section';
import { SECTION_TITLES } from '../constants';
import { formatBool } from '../utils/formatters';

interface ServicesSectionProps {
  s: AntennaStats;
}

export default function ServicesSection({ s }: ServicesSectionProps) {
  return (
    <M5Section
      title={SECTION_TITLES.SERVICES}
      icon={<Shield className="w-3.5 h-3.5" />}
      colorClass="bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400"
    >
      <M5Row label="airMAX" value={s.airmaxEnabled != null ? formatBool(s.airmaxEnabled, 'Activado', 'Desactivado') : null} />
      <M5Row label="airMAX priority" value={s.airmaxPriority} />
    </M5Section>
  );
}
