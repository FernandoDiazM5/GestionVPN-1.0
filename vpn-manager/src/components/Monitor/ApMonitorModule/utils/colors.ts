const sigColor = (v?: number | null) =>
  v == null ? 'text-slate-400 dark:text-slate-500' : v >= -65 ? 'text-emerald-600' : v >= -75 ? 'text-sky-600' : 'text-amber-500';
const ccqColor = (v?: number | null) =>
  v == null ? '' : v >= 80 ? 'text-emerald-600' : v >= 60 ? 'text-sky-600' : 'text-amber-500';

export { sigColor, ccqColor };
