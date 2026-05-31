import { Cpu } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import M5Row from './M5Row';
import M5Section from './M5Section';
import { formatMemoryMB, formatPercent, formatDegrees, formatMeter } from '../utils/formatters';
import { SECTION_TITLES } from '../constants';

interface SystemSectionProps {
  s: AntennaStats;
  family?: 'ac' | 'm5' | 'unknown';
}

export default function SystemSection({ s, family }: SystemSectionProps) {
  return (
    <M5Section
      title={SECTION_TITLES.SYSTEM}
      icon={<Cpu className="w-3.5 h-3.5" />}
      colorClass="bg-blue-50 border-blue-200 text-blue-700"
    >
      <M5Row label="hostname" value={s.deviceName} />
      <M5Row label="devmodel" value={s.deviceModel} />
      <M5Row label="fwversion" value={s.firmwareVersion} />
      <M5Row label="fwprefix" value={s.fwPrefix} />
      <M5Row label="uptime" value={s.uptimeStr} />
      <M5Row label="time" value={s.deviceDate} />
      <M5Row label="cpuload" value={s.cpuLoad != null ? formatPercent(s.cpuLoad) : null} />
      <M5Row label="loadavg" value={s.loadAvg} />
      <M5Row label="netrole" value={s.networkMode} />
      <M5Row label="memory total" value={formatMemoryMB(s.memTotalKb)} />
      <M5Row label="memory free" value={formatMemoryMB(s.memFreeKb)} />
      <M5Row label="memory buffers" value={formatMemoryMB(s.memBuffersKb)} />
      <M5Row label="memory cached" value={formatMemoryMB(s.memCachedKb)} />
      <M5Row label="memory uso %" value={s.memoryPercent != null ? formatPercent(s.memoryPercent) : null} />
      {family === 'ac' && <M5Row label="temperature" value={s.temperature != null ? formatDegrees(s.temperature) : null} />}
      {family === 'ac' && <M5Row label="height" value={s.deviceHeight != null ? formatMeter(s.deviceHeight) : null} />}
    </M5Section>
  );
}
