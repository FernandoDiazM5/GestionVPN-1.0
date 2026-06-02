interface StatusBadgeProps {
  isActive: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({
  isActive,
  label = isActive ? 'Conectado' : 'Desconectado',
  size = 'md'
}: StatusBadgeProps) {

  return (
    <div className={`flex items-center gap-2 rounded-lg transition-all duration-300 inline-flex
                    ${size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5'}
                    ${isActive
                      ? 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30'
                      : 'bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>

      {/* Indicador visual */}
      <div className="relative flex items-center justify-center flex-shrink-0">
        {isActive ? (
          <>
            {/* Glow exterior */}
            <div className={`absolute ${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'} bg-emerald-400 rounded-full animate-pulse blur-sm opacity-60`} />

            {/* Punto principal */}
            <div className={`${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'} bg-emerald-500 rounded-full relative z-10`} />

            {/* Anillo de ping exterior */}
            <div className="absolute w-3.5 h-3.5 border-2 border-emerald-400 rounded-full animate-ping opacity-40" />
          </>
        ) : (
          <>
            {/* Punto inactivo */}
            <div className={`${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'} bg-slate-400 rounded-full opacity-50`} />
          </>
        )}
      </div>

      {/* Texto */}
      <span className={`font-bold ${size === 'sm' ? 'text-xs' : 'text-sm'} ${
        isActive
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-slate-500 dark:text-slate-400'
      } transition-colors duration-300 whitespace-nowrap`}>
        {label}
      </span>

      {/* Mini barra de señal para activos */}
      {isActive && size === 'md' && (
        <div className="flex items-center gap-0.5 ml-1">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="w-0.5 bg-emerald-400 rounded-full origin-bottom"
              style={{
                height: `${4 + i * 2}px`,
                animation: `scaleYBar ${0.6 + i * 0.15}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
