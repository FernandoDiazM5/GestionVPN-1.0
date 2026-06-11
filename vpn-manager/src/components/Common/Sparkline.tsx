// ============================================================
//  Sparkline — gráfico de línea minimalista en SVG inline (Q2)
//
//  Sin librerías: 0 KB de dependencias adicionales en el bundle.
//  Recibe number[] y dibuja la línea + área bajo curva normalizadas
//  al alto/ancho dados. Maneja: arrays vacíos, arrays con 1 punto,
//  series planas (min === max), valores negativos.
//
//  Para multiline / leyendas más complejas, hay que migrar a Recharts;
//  pero para sparklines de panel admin esto es suficiente.
// ============================================================
import { memo, useId } from 'react';

interface SparklineProps {
  data: number[];
  /** Ancho en px del SVG. */
  width?: number;
  /** Alto en px del SVG. */
  height?: number;
  /** Color del trazo (Tailwind currentColor friendly: el componente usa stroke="currentColor"). */
  className?: string;
  /** Si true, dibuja el área bajo la curva como fill semitransparente. */
  area?: boolean;
  /** Etiqueta a11y. */
  ariaLabel?: string;
}

function SparklineImpl({
  data,
  width = 120,
  height = 32,
  className = 'text-indigo-500',
  area = true,
  ariaLabel,
}: SparklineProps) {
  const gradientId = useId();

  if (!data || data.length === 0) {
    return (
      <svg width={width} height={height} role="img" aria-label={ariaLabel ?? 'Sparkline sin datos'} className={className}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 2" />
      </svg>
    );
  }

  if (data.length === 1) {
    return (
      <svg width={width} height={height} role="img" aria-label={ariaLabel ?? `Sparkline valor único ${data[0]}`} className={className}>
        <circle cx={width / 2} cy={height / 2} r="2" fill="currentColor" />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;        // evita /0 en series planas
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  // padding vertical de 2px para que el trazo no se corte en los bordes
  const pad = 2;
  const usableH = height - pad * 2;

  const points = data.map((v, i) => {
    const x = i * stepX;
    const norm = (v - min) / range;     // 0..1
    const y = height - pad - norm * usableH;
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel ?? `Sparkline ${data.length} muestras`} className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={areaPath} fill={`url(#${gradientId})`} />}
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Último punto destacado */}
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2" fill="currentColor" />
    </svg>
  );
}

export const Sparkline = memo(SparklineImpl);
export default Sparkline;
