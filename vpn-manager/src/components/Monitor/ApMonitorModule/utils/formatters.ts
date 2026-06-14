const fmtDbm = (v?: number | null) => v != null ? `${v} dBm` : '—';
const fmtPct = (v?: number | null) => v != null ? `${v}%` : '—';
const fmtKbps = (v?: number | null) => {
  if (v == null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(1)} Mbps` : `${v} kbps`;
};
const fmtMbps = (v?: number | null) => {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)} Mbps`;
};
const _fmtRate = fmtMbps; void _fmtRate;
const fmtFw = (fw?: string) => {
  if (!fw) return null;
  const m = fw.match(/^([A-Z]+)\.?(v[\d.]+)/);
  return m ? `${m[2]} (${m[1]})` : fw;
};
const fmtUptime = (s?: string | null) => s || '—';
const fmtCpu = (v?: number | null) =>
  v == null ? '—' : `${v}%`;
const fmtMem = (totalKb?: number | null, freeKb?: number | null, pct?: number | null) => {
  if (pct != null) return `${pct}%`;
  if (totalKb && freeKb != null) {
    const used = ((totalKb - freeKb) / totalKb * 100).toFixed(0);
    return `${used}%`;
  }
  return '—';
};

// E7: tiempo relativo compacto ("hace 5s/3m/2h"). now inyectable para tests.
const fmtAgo = (ts?: number | null, now: number = Date.now()) => {
  if (!ts || ts <= 0) return 'nunca';
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
};

export { fmtDbm, fmtPct, fmtKbps, fmtMbps, fmtFw, fmtUptime, fmtCpu, fmtMem, fmtAgo };
