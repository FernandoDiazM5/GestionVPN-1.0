function fmtSecurity(s?: string | null) {
  if (!s) return null;
  const map: Record<string, string> = {
    wpa2aes: 'WPA2-AES', wpa2: 'WPA2', wpa: 'WPA', none: 'Abierta', open: 'Abierta',
  };
  return map[s.toLowerCase()] ?? s.toUpperCase();
}

function fmtMode(m?: string | null) {
  if (!m) return null;
  return m === 'sta' ? 'Estación' : m === 'ap' || m === 'master' ? 'Punto de Acceso' : m;
}

function fmtNetRole(r?: string | null) {
  if (!r) return null;
  return r === 'router' ? 'Enrutador' : r === 'bridge' ? 'Puente' : r;
}

/** Extrae solo el nombre legible si el campo tiene datos key=value embebidos */
function cleanDeviceName(name?: string | null): string | null {
  if (!name) return null;
  const idx = name.search(/,[a-zA-Z]+=\S/);
  return idx > 0 ? name.slice(0, idx).trim() : name;
}

export { fmtSecurity, fmtMode, fmtNetRole, cleanDeviceName };
