import { Shield } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import M5Row from './M5Row';
import M5Section from './M5Section';
import { rawDataStyles } from '../utils/styles';
import { RAW_DATA_LABELS, SECTION_TITLES } from '../constants';
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
      {s._rawMcaCli && (
        <div className="col-span-2 mt-2">
          <p className={`${rawDataStyles.label} text-emerald-600`}>{RAW_DATA_LABELS.MCA_CLI}</p>
          <pre className={`${rawDataStyles.pre} border-emerald-100 max-h-28`}>{s._rawMcaCli}</pre>
        </div>
      )}
      {s._rawUname && (
        <div className="col-span-2 mt-2">
          <p className={`${rawDataStyles.label} text-emerald-600`}>{RAW_DATA_LABELS.UNAME}</p>
          <pre className={`${rawDataStyles.pre} border-emerald-100 max-h-16`}>{s._rawUname}</pre>
        </div>
      )}
      {s._rawIwconfig && (
        <div className="col-span-2 mt-2">
          <p className={`${rawDataStyles.label} text-emerald-600`}>{RAW_DATA_LABELS.IWCONFIG}</p>
          <pre className={`${rawDataStyles.pre} border-emerald-100 max-h-28`}>{s._rawIwconfig}</pre>
        </div>
      )}
      {s._rawWstalist && (
        <div className="col-span-2 mt-2">
          <p className={`${rawDataStyles.label} text-emerald-600`}>{RAW_DATA_LABELS.WSTALIST}</p>
          <pre className={`${rawDataStyles.pre} border-emerald-100 max-h-28`}>{s._rawWstalist}</pre>
        </div>
      )}
      {s._rawMeminfo && (
        <div className="col-span-2 mt-2">
          <p className={`${rawDataStyles.label} text-emerald-600`}>{RAW_DATA_LABELS.MEMINFO}</p>
          <pre className={`${rawDataStyles.pre} border-emerald-100 max-h-28`}>{s._rawMeminfo}</pre>
        </div>
      )}
    </M5Section>
  );
}
