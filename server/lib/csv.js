// ============================================================
//  lib/csv.js — serializer CSV minimal (RFC 4180-ish)
//
//  Sin libs externas para no agregar deps. Reglas:
//   • Cada fila es un array de valores (string|number|null|undefined).
//   • Valores que contienen "," o newline o " o \r se entrecomillan.
//   • " interna se duplica ("" según RFC 4180).
//   • null/undefined → string vacío.
//   • Newline entre filas = \r\n (mejor compat Excel/Windows).
// ============================================================

function escapeField(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.length === 0) return '';
  const needsQuote = /[",\r\n]/.test(s);
  if (!needsQuote) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Una fila. Devuelve string sin newline final. */
function rowToCsv(values) {
  return values.map(escapeField).join(',');
}

/**
 * Stream-friendly: construye CSV en chunks. Si `header` se da, va en la primera línea.
 * Devuelve un Generator<string> con líneas (incluyendo el terminador \r\n).
 */
function* toCsv(rows, header) {
  if (header) yield rowToCsv(header) + '\r\n';
  for (const r of rows) yield rowToCsv(r) + '\r\n';
}

module.exports = { escapeField, rowToCsv, toCsv };
