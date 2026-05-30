export function parseRouterUptime(uptime: string): number {
  let total = 0;
  const d = uptime.match(/(\d+)d/);
  const h = uptime.match(/(\d+)h/);
  const m = uptime.match(/(\d+)m/);
  const s = uptime.match(/(\d+)s/);
  if (d) total += parseInt(d[1]) * 86400;
  if (h) total += parseInt(h[1]) * 3600;
  if (m) total += parseInt(m[1]) * 60;
  if (s) total += parseInt(s[1]);
  return total;
}

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
