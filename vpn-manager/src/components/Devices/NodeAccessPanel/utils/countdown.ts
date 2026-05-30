// ── Formateo de countdown
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s';
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1_000);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
