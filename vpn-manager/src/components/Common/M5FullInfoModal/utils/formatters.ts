export function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatMemoryMB(kb: number | null | undefined): string | null {
  return kb != null ? `${Math.round(kb / 1024)} MB` : null;
}

export function formatDBm(value: number): string {
  return `${value} dBm`;
}

export function formatMHz(value: number): string {
  return `${value} MHz`;
}

export function formatPercent(value: number): string {
  return `${value}%`;
}

export function formatMbps(value: number): string {
  return `${value} Mbps`;
}

export function formatBool(value: boolean, trueText: string, falseText: string): string {
  return value ? trueText : falseText;
}

export function formatMs(value: number): string {
  return `${value} ms`;
}

export function formatMeter(value: number): string {
  return `${value} m`;
}

export function formatDegrees(value: number): string {
  return `${value} °C`;
}
