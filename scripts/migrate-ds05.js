#!/usr/bin/env node
// ============================================================
//  migrate-ds05.js — Fase 4 helper §53
//
//  Migra `text-slate-{300,400}` usado como clase base a slate-500,
//  el mínimo de contraste para texto normal sobre fondo claro.
//
//  PRESERVA:
//    - dark:text-slate-{300,400} (ya intencional)
//    - hover:text-slate-{...} / focus:text-slate-{...}
//    - placeholder:text-slate-{...} / placeholder:font-...
//    - Clases que ya están bajo la variante `dark:`.
//    - text-slate-{300,400} sobre superficie oscura permanente
//      (heurística: contexto con bg-slate-{700-950}, bg-{tone}-{500-800},
//      modal-header-{tone}, text-white).
//
//  USO:
//    node scripts/migrate-ds05.js          # aplica cambios
//    node scripts/migrate-ds05.js --dry    # solo reporte, no escribe
// ============================================================

const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', 'vpn-manager', 'src');
const dry = process.argv.includes('--dry');

const DARK_SURFACE_RE = /(?:bg-slate-(?:700|800|900|950)|bg-(?:indigo|rose|violet|emerald|sky|amber)-(?:500|600|700|800)|bg-gradient-to-|bg-black|modal-header-(?:decorated|indigo|rose|amber|emerald|sky|violet|slate)|text-white\b|text-white\/)/;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
      walk(full, files);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(SRC_ROOT);
let totalReplaced = 0;
let totalFiles = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const lines = original.split('\n');
  let changed = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Saltar si la línea o las 3 previas indican superficie oscura.
    const prev3 = lines.slice(Math.max(0, i - 3), i).join('\n');
    if (DARK_SURFACE_RE.test(prev3 + '\n' + line)) continue;

    // Sustituir texto base slate-300/400 por slate-500. Si la línea todavía
    // no declara modo oscuro, añadir el par dark:text-slate-400.
    // PERO: el `text-slate-{300,400}` debe estar como clase base (no después
    //   de `hover:`, `focus:`, `active:`, `disabled:`, `group-hover:`,
    //   `placeholder:`, etc.)
    // Regex: la clase debe estar precedida por whitespace o `"` o "`" o "{".
    const VARIANT_PREFIX = '(?:dark|hover|focus|active|disabled|group-hover|group-focus|placeholder|focus-visible|peer|first|last|odd|even|sm|md|lg|xl|2xl):';
    const NO_VARIANT_PREFIX = new RegExp(`(?<![:\\w-])(?<!${VARIANT_PREFIX})text-slate-(300|400)\\b`, 'g');

    const newLine = line.replace(NO_VARIANT_PREFIX, (m, shade) => {
      changed++;
      if (/\bdark:text-slate-/.test(line)) return 'text-slate-500';
      return 'text-slate-500 dark:text-slate-400';
    });

    if (newLine !== line) {
      lines[i] = newLine;
    }
  }

  if (changed > 0) {
    totalReplaced += changed;
    totalFiles++;
    const newContent = lines.join('\n');
    const relPath = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
    console.log(`  ${String(changed).padStart(3)} ${relPath}`);
    if (!dry) fs.writeFileSync(file, newContent, 'utf8');
  }
}

console.log(`\nTotal: ${totalReplaced} reemplazos en ${totalFiles} archivos`);
console.log(dry ? '(dry-run — sin escritura)' : '✓ Cambios aplicados.');
