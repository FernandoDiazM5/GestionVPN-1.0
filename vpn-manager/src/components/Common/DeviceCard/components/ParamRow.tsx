function ParamRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-2 py-2.5 px-2 border-b border-slate-200 dark:border-slate-700/30 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors rounded-sm">
      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium shrink-0">{label}</span>
      <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 text-right break-all">{value}</span>
    </div>
  );
}

export default ParamRow;
