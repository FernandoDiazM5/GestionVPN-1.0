const RELOAD_KEY = 'vpn_module_reload_at';
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\d]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
];

export function isStaleChunkError(error: Error): boolean {
  const detail = `${error.name} ${error.message}`;
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(detail));
}

export function reloadOnceForStaleChunk(
  error: Error,
  now = Date.now(),
  reload: () => void = () => window.location.reload(),
): boolean {
  if (!isStaleChunkError(error) || typeof window === 'undefined') return false;

  try {
    const lastReload = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (now - lastReload < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // sessionStorage puede estar deshabilitado; aun asi una recarga es recuperable.
  }

  reload();
  return true;
}
