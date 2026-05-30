function GaugeChart({ value, label, color }: { value: number | null | undefined; label: string; color: string }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const r = 26;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const strokeColor = pct > 85 ? '#ef4444' : pct > 65 ? '#f59e0b' : color;
  const dropShadow = `drop-shadow(0px 0px 4px ${strokeColor}80)`;

  return (
    <div className="flex flex-col items-center space-y-1">
      <svg width="76" height="76" viewBox="0 0 76 76" className="overflow-visible">
        <circle cx="38" cy="38" r={r} fill="none" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="6" />
        <circle
          cx="38" cy="38" r={r} fill="none"
          stroke={value != null ? strokeColor : 'transparent'}
          strokeWidth="6"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 38 38)"
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)', filter: value != null ? dropShadow : 'none' }}
        />
        <text x="38" y="43" textAnchor="middle"
          className="fill-slate-800 dark:fill-slate-100 text-[14px] font-bold font-mono tracking-tight">
          {value != null ? `${pct}%` : '—'}
        </text>
      </svg>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">{label}</p>
    </div>
  );
}

export default GaugeChart;
