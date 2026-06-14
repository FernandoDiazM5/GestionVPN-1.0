// Escala semántica de calidad: bueno → emerald, advertencia → amber, crítico → rose.
// (No se usa `sky`: está reservado a "informativo neutro", no a un nivel de calidad.)
const sigColor = (v?: number | null) =>
  v == null ? 'text-slate-400 dark:text-slate-500'
    : v >= -65 ? 'text-emerald-600 dark:text-emerald-400'
      : v >= -78 ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400';

const ccqColor = (v?: number | null) =>
  v == null ? ''
    : v >= 80 ? 'text-emerald-600 dark:text-emerald-400'
      : v >= 60 ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400';

export { sigColor, ccqColor };
