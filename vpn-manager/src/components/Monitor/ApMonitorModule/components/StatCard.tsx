function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 shadow-sm hover:shadow-md transition-shadow dark:bg-slate-800/60 dark:border-slate-700">
      <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-bold truncate font-mono tracking-tight ${color ?? 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-2xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{sub}</p>}
    </div>
  );
}

export default StatCard;
