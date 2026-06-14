import { buildSparkline } from '../utils/sparkline';

// Sparkline SVG sin dependencias. Hereda el color vía `currentColor`
// (el contenedor decide el text-color según el estado/salud).
export default function Sparkline({
  values, width = 200, height = 36, className = '',
}: {
  values: Array<number | null | undefined>;
  width?: number;
  height?: number;
  className?: string;
}) {
  const data = buildSparkline(values, width, height);
  if (!data) return null;

  // posición del último punto para dibujar el marcador
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v));
  const range = data.max - data.min || 1;
  const lastX = width - 2;
  const lastY = 2 + (1 - (nums[nums.length - 1] - data.min) / range) * (height - 4);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className={className} role="img" aria-label="Tendencia de señal" preserveAspectRatio="none">
      <path d={data.path} fill="none" stroke="currentColor" strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2} fill="currentColor" />
    </svg>
  );
}
