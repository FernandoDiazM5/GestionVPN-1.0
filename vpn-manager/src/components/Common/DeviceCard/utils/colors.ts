interface SignalMeta {
  label: string;
  color: string;
  grad: string;
  pct: number;
}

function signalMeta(dbm: number | null | undefined): SignalMeta {
  if (dbm == null) return { label: '—', color: 'bg-slate-500', grad: 'from-slate-800 to-slate-900', pct: 0 };
  const pct = Math.max(0, Math.min(100, ((dbm - (-95)) / ((-40) - (-95))) * 100));
  if (dbm >= -65) return { label: 'Excelente', color: 'bg-emerald-400', grad: 'from-emerald-950 to-emerald-900', pct };
  if (dbm >= -75) return { label: 'Buena', color: 'bg-sky-400', grad: 'from-sky-950 to-sky-900', pct };
  if (dbm >= -85) return { label: 'Regular', color: 'bg-amber-400', grad: 'from-amber-950 to-amber-900', pct };
  return { label: 'Mala', color: 'bg-rose-400', grad: 'from-rose-950 to-rose-900', pct };
}

function ccqColor(v?: number | null): string {
  if (!v) return 'bg-slate-500';
  return v >= 80 ? 'bg-emerald-400' : v >= 50 ? 'bg-amber-400' : 'bg-rose-400';
}

export { signalMeta, ccqColor };
export type { SignalMeta };
