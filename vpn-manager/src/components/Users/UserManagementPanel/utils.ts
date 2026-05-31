/** Formatea segundos desde el último handshake WireGuard a texto relativo. */
export function formatLastHandshake(secs: number | null): string {
  if (secs == null) return 'Nunca';
  if (secs < 60) return 'Ahora';
  if (secs < 3600) return `Hace ${Math.floor(secs / 60)} min`;
  if (secs < 86400) return `Hace ${Math.floor(secs / 3600)} h`;
  const days = Math.floor(secs / 86400);
  if (days < 7) return `Hace ${days} d`;
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem`;
  return `Hace ${Math.floor(days / 30)} mes`;
}
