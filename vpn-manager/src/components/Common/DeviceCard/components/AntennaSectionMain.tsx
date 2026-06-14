import { ArrowUp, ArrowDown, Cpu } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import Bar from './Bar';
import GaugeChart from './GaugeChart';
import { signalMeta, ccqColor } from '../utils/colors';

interface AntennaSectionMainProps {
  antennaStats: AntennaStats;
}

export default function AntennaSectionMain({ antennaStats }: AntennaSectionMainProps) {
  const sig = signalMeta(antennaStats.signal);

  return (
    <div className="px-4 pb-5 space-y-4">
      {antennaStats.signal != null && (
        <div className={`bg-gradient-to-br ${sig.grad} rounded-2xl p-4 border border-white/5 shadow-lg`}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-2xs font-bold text-white/50 uppercase tracking-widest mb-0.5">Nivel de Señal</p>
              <div className="flex items-end space-x-1.5">
                <span className="text-5xl font-black text-white leading-none tracking-tighter">{antennaStats.signal}</span>
                <span className="text-base text-white/60 font-mono mb-1">dBm</span>
              </div>
            </div>
            <span className={`text-2xs font-black uppercase tracking-wider px-3 py-1.5 rounded-lg ${sig.color} text-slate-900 shadow-sm`}>
              {sig.label}
            </span>
          </div>
          {/* Barra blanca sobre fondo oscuro de la card — no se invierte en dark. */}
          <Bar pct={sig.pct} color="bg-white dark:bg-white" />
          {antennaStats.noiseFloor != null && (
            <p className="text-2xs text-white/50 mt-2 font-mono flex justify-between">
              <span>Ruido: <strong className="text-white/80">{antennaStats.noiseFloor}</strong></span>
              <span>SNR: <strong className="text-white">{Math.abs(antennaStats.signal - antennaStats.noiseFloor).toFixed(0)} dB</strong></span>
            </p>
          )}
        </div>
      )}

      {antennaStats.ccq != null && (
        <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Calidad CCQ</span>
            <span className="font-mono text-lg font-black text-slate-800 dark:text-white">{antennaStats.ccq}%</span>
          </div>
          <Bar pct={antennaStats.ccq} color={ccqColor(antennaStats.ccq)} />
        </div>
      )}

      {(antennaStats.txRate != null || antennaStats.rxRate != null) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 flex flex-col items-center text-center shadow-sm">
            <div className="flex items-center space-x-1.5 mb-1">
              <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-2xs sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">TX Rate</span>
            </div>
            <p className="font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400 dark:drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
              {antennaStats.txRate ?? '—'}<span className="text-xs text-slate-500 ml-1">Mbps</span>
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 flex flex-col items-center text-center shadow-sm">
            <div className="flex items-center space-x-1.5 mb-1">
              <ArrowDown className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-2xs sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">RX Rate</span>
            </div>
            <p className="font-mono text-2xl font-black text-sky-600 dark:text-sky-400 dark:drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]">
              {antennaStats.rxRate ?? '—'}<span className="text-xs text-slate-500 ml-1">Mbps</span>
            </p>
          </div>
        </div>
      )}

      {antennaStats.airmaxEnabled != null && (
        <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Protocolo airMAX</span>
            <div className="flex items-center space-x-2">
              <span className={`text-2xs font-bold px-2 py-1 rounded-md uppercase tracking-wider
                  ${antennaStats.airmaxEnabled ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                {antennaStats.airmaxEnabled ? 'Activado' : 'Desactivado'}
              </span>
              {antennaStats.airmaxPriority && (
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md capitalize border border-slate-200 dark:border-slate-700">{antennaStats.airmaxPriority}</span>
              )}
            </div>
          </div>
          {antennaStats.airmaxEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Calidad AMC</p>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">{antennaStats.airmaxQuality ?? '—'}%</span>
                  {antennaStats.airmaxQuality != null && (
                    <div className="flex-1 h-2 bg-slate-200 dark:bg-black/30 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full shadow-[0_0_6px_#8b5cf6]"
                        style={{ width: `${antennaStats.airmaxQuality}%`, transition: 'width 1s ease' }} />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Capacidad AMQ</p>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">{antennaStats.airmaxCapacity ?? '—'}%</span>
                  {antennaStats.airmaxCapacity != null && (
                    <div className="flex-1 h-2 bg-slate-200 dark:bg-black/30 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full shadow-[0_0_6px_#8b5cf6]"
                        style={{ width: `${antennaStats.airmaxCapacity}%`, transition: 'width 1s ease' }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(antennaStats.cpuLoad != null || antennaStats.memoryPercent != null) && (
        <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center space-x-2">
            <Cpu className="w-3 h-3" /><span>Recursos del sistema</span>
          </p>
          <div className="flex justify-evenly">
            <GaugeChart value={antennaStats.cpuLoad} label="CPU Load" color="#818cf8" />
            <GaugeChart value={antennaStats.memoryPercent} label="Memoria" color="#0ea5e9" />
          </div>
        </div>
      )}
    </div>
  );
}
