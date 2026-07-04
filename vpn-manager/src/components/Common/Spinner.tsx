// ============================================================
//  Spinner — indicador de carga SVG canónico del sistema
//
//  Reemplaza los <Loader2 className="animate-spin" /> ad-hoc: un arco
//  SVG con animación de trazo (stroke-dasharray) sobre un anillo tenue,
//  más fluido que la rotación plana y con la MISMA identidad en toda la app.
//
//  Reglas del sistema (CLAUDE.md):
//   • color = intención → el color va por currentColor: pásalo con
//     text-<paleta>-500 en className (default indigo = interactivo).
//     Ej.: <Spinner className="text-violet-500" /> en contexto WireGuard.
//   • movimiento = estado → SOLO para cargas reales, no decorativo.
//   • prefers-reduced-motion → el CSS degrada a rotación lenta sin
//     morphing del arco (ver .spinner-svg en index.css).
//
//  API:
//   <Spinner />                       → 24px indigo inline
//   <Spinner size="lg" />             → 32px
//   <Spinner block />                 → centrado con py-12 (loader de módulo)
//   <Spinner className="text-sky-500" label="Cargando historial…" />
// ============================================================

interface SpinnerProps {
  /** Tamaño del indicador. xs=14px · sm=16px · md=24px (default) · lg=32px */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Color semántico vía text-<paleta>-500 (+ opcional dark:). Default: indigo (interactivo). */
  className?: string;
  /** Texto accesible (role="status"). */
  label?: string;
  /** true → envuelto en contenedor centrado con padding vertical (patrón loader de módulo). */
  block?: boolean;
}

const SIZES: Record<NonNullable<SpinnerProps['size']>, string> = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export default function Spinner({
  size = 'md',
  className = 'text-indigo-500',
  label = 'Cargando…',
  block = false,
}: SpinnerProps) {
  const svg = (
    <svg
      className={`spinner-svg ${SIZES[size]} ${className}`}
      viewBox="0 0 50 50"
      fill="none"
      role="status"
      aria-label={label}
    >
      {/* anillo de fondo tenue (currentColor al 15%) */}
      <circle className="spinner-track" cx="25" cy="25" r="20" strokeWidth="5" />
      {/* arco animado por stroke-dasharray (ver index.css) */}
      <circle className="spinner-arc" cx="25" cy="25" r="20" strokeWidth="5" />
    </svg>
  );

  if (!block) return svg;
  return <div className="flex items-center justify-center py-12">{svg}</div>;
}
