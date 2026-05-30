export function formatSignalStrength(signal: number | null | undefined): string {
  if (signal == null) return '—';
  return `${signal} dBm`;
}

export function getSignalColor(signal: number | null | undefined): string {
  if (signal == null) return 'text-slate-400';
  if (signal >= -65) return 'text-emerald-600';
  if (signal >= -75) return 'text-sky-600';
  return 'text-amber-500';
}

export function formatPercentage(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Math.round(value)}%`;
}

export function getHealthColor(value: number | null | undefined, thresholds: { good: number; ok: number }): string {
  if (value == null) return 'text-slate-400';
  if (value >= thresholds.good) return 'text-emerald-600';
  if (value >= thresholds.ok) return 'text-amber-500';
  return 'text-rose-500';
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatFrequency(freq: number | null | undefined): string {
  if (freq == null) return '—';
  return `${freq} MHz`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return '—';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}
