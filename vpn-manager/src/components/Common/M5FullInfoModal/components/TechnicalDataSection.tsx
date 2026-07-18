import { TerminalSquare } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import { RAW_DATA_LABELS } from '../constants';

interface RawBlockProps {
  label: string;
  value?: string | null;
}

function RawBlock({ label, value }: RawBlockProps) {
  if (!value) return null;
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
      <h3 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">{label}</h3>
      <pre className="max-h-64 overflow-auto whitespace-pre rounded-lg bg-slate-950 p-3 font-mono text-xs leading-5 text-emerald-300 [scrollbar-gutter:stable]">{value}</pre>
    </article>
  );
}

export default function TechnicalDataSection({ stats }: { stats: AntennaStats }) {
  const traffic = stats.ifaceTraffic && Object.keys(stats.ifaceTraffic).length > 0
    ? Object.entries(stats.ifaceTraffic).map(([iface, value]) =>
        `${iface}: RX ${(value.rxBytes / 1024 / 1024).toFixed(1)} MB (${value.rxPackets} paquetes) | TX ${(value.txBytes / 1024 / 1024).toFixed(1)} MB (${value.txPackets} paquetes)`,
      ).join('\n')
    : null;
  const hasRawData = traffic || stats._rawRoutes || stats._rawMcaCli || stats._rawUname
    || stats._rawIwconfig || stats._rawWstalist || stats._rawMeminfo;

  if (!hasRawData) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Este equipo no entregó bloques técnicos crudos.</p>;
  }

  return (
    <section className="space-y-3" aria-label="Datos técnicos crudos">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
        <TerminalSquare className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 dark:text-slate-300" />
        <div><h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Datos técnicos originales</h2><p className="mt-1 text-xs leading-5 text-slate-500">Salida sin transformar para verificación avanzada. Las métricas ordenadas se encuentran en la pestaña Datos.</p></div>
      </div>
      <RawBlock label="Tráfico por interfaz" value={traffic} />
      <RawBlock label="Tabla de rutas" value={stats._rawRoutes} />
      <RawBlock label={`Información del radio (${RAW_DATA_LABELS.MCA_CLI})`} value={stats._rawMcaCli} />
      <RawBlock label={`Sistema y tiempo activo (${RAW_DATA_LABELS.UNAME})`} value={stats._rawUname} />
      <RawBlock label={`Configuración inalámbrica (${RAW_DATA_LABELS.IWCONFIG})`} value={stats._rawIwconfig} />
      <RawBlock label={`Estaciones conectadas (${RAW_DATA_LABELS.WSTALIST})`} value={stats._rawWstalist} />
      <RawBlock label={`Memoria del sistema (${RAW_DATA_LABELS.MEMINFO})`} value={stats._rawMeminfo} />
    </section>
  );
}
