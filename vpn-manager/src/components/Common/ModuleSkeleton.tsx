// ============================================================
//  ModuleSkeleton — fallback compartido para React.Suspense (FASE 10)
//
//  Se muestra mientras se descarga el chunk lazy del módulo activo.
//  Reusa la clase .skeleton del index.css (gradient shimmer), por lo
//  que respeta automáticamente prefers-reduced-motion y dark mode.
//
//  Layout pensado para coincidir aproximadamente con la silueta de los
//  módulos: una franja de header + grid de cards/filas. Evita el clásico
//  layout shift cuando llega el chunk real.
// ============================================================
import { memo } from 'react';

interface ModuleSkeletonProps {
  /** Cuántas filas/cards mostrar (default 4). */
  rows?: number;
  /** Mostrar encabezado de barra superior (default true). */
  withHeader?: boolean;
  /** Mensaje opcional bajo el último bloque (default: vacío). */
  label?: string;
}

function ModuleSkeletonImpl({ rows = 4, withHeader = true, label }: ModuleSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Cargando módulo'}
      className="space-y-5"
    >
      {withHeader && (
        <div className="space-y-3">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-72" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="skeleton h-5 w-1/3" />
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-4 w-1/2" />
          </div>
        ))}
      </div>
      {label && (
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          {label}
        </p>
      )}
    </div>
  );
}

export const ModuleSkeleton = memo(ModuleSkeletonImpl);
export default ModuleSkeleton;
