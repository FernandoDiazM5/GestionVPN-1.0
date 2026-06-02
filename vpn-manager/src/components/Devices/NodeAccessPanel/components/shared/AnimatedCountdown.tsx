import { useEffect, useState } from 'react';
import { TUNNEL_TIMEOUT_MS } from '../../../../../context';

interface AnimatedCountdownProps {
  expiry: number; // timestamp en ms
}

const SIZE = 56;
const R = 23;                    // radio del anillo
const CIRC = 2 * Math.PI * R;    // circunferencia
const CX = SIZE / 2;

export default function AnimatedCountdown({ expiry }: AnimatedCountdownProps) {
  const [timeLeft, setTimeLeft] = useState('--:--');
  const [pct, setPct] = useState(100);

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, expiry - Date.now());
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
      setPct(Math.min(100, (diff / TUNNEL_TIMEOUT_MS) * 100));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  // Semántica de color: éxito → advertencia → peligro
  const ring = pct > 50 ? 'text-emerald-500' : pct > 25 ? 'text-amber-500' : 'text-rose-500';
  const txt = pct > 50 ? 'text-emerald-700' : pct > 25 ? 'text-amber-600' : 'text-rose-600';
  const critical = pct <= 25;

  // 12 marcas de hora (estética de reloj)
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);

  // Manecilla: apunta al extremo del arco restante (barre al consumirse el tiempo)
  const handRad = ((pct / 100) * 360 - 90) * (Math.PI / 180);
  const handX = CX + (R - 5) * Math.cos(handRad);
  const handY = CX + (R - 5) * Math.sin(handRad);

  return (
    <div className="flex items-center gap-3 px-3.5 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      {/* Reloj SVG: marcas + anillo de progreso + tiempo al centro */}
      <div className={`relative flex-shrink-0 ${critical ? 'animate-pulse' : ''}`} style={{ width: SIZE, height: SIZE }}>
        <svg className="w-full h-full" viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Marcas de hora (dark-aware) */}
          {ticks.map(angle => {
            const isQuarter = angle % 90 === 0;
            const rad = (angle - 90) * (Math.PI / 180);
            const outer = R + 4;
            const inner = R + (isQuarter ? 0.5 : 2);
            return (
              <line
                key={angle}
                x1={CX + outer * Math.cos(rad)} y1={CX + outer * Math.sin(rad)}
                x2={CX + inner * Math.cos(rad)} y2={CX + inner * Math.sin(rad)}
                className={isQuarter ? 'stroke-slate-400 dark:stroke-slate-500' : 'stroke-slate-300 dark:stroke-slate-600'}
                strokeWidth={isQuarter ? 1.5 : 1}
                strokeLinecap="round"
              />
            );
          })}

          {/* Track de fondo */}
          <circle cx={CX} cy={CX} r={R} fill="none" strokeWidth="3.5"
            className="stroke-slate-100 dark:stroke-slate-700" />

          {/* Anillo de progreso (se vacía con el tiempo) + glow del color de estado */}
          <circle
            cx={CX} cy={CX} r={R} fill="none"
            stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC - (pct / 100) * CIRC}
            className={`${ring} transition-all duration-1000 ease-linear`}
            style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}
            transform={`rotate(-90 ${CX} ${CX})`}
          />

          {/* Marcador que barre la posición del tiempo restante (sin tapar el centro) */}
          <circle
            cx={handX} cy={handY} r="3"
            className={`fill-current ${ring} transition-all duration-1000 ease-linear`}
            style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}
          />
        </svg>

        {/* Tiempo dentro del reloj */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs font-bold font-mono tabular-nums ${txt} transition-colors`}>
            {timeLeft}
          </span>
        </div>
      </div>

      {/* Etiqueta */}
      <div className="flex flex-col leading-none">
        <span className="text-2xs font-bold uppercase tracking-wide text-slate-500">
          Acceso abierto
        </span>
        <span className="text-2xs text-slate-400 mt-0.5">
          {critical ? 'Expira pronto' : 'Tiempo restante'}
        </span>
      </div>
    </div>
  );
}
