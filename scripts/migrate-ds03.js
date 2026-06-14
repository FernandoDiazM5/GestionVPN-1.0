#!/usr/bin/env node
// ============================================================
//  migrate-ds03.js — Fase 5b helper §55
//
//  Migra `text-[Npx]` literales (con N entre 7 y 11) a las clases
//  centralizadas del sistema:
//    text-[11px] → text-2xs  (ya existía)
//    text-[10px] → text-2xs  (sube 1px, cerca del límite)
//    text-[9px]  → text-3xs  (nueva clase para micro-badges)
//    text-[8px]  → text-3xs  (sube 1px, demasiado pequeño en isolation)
//    text-[7px]  → text-3xs  (sube 2px, mínimo legible)
//
//  USO:
//    node scripts/migrate-ds03.js          # aplica cambios
//    node scripts/migrate-ds03.js --dry    # solo reporte
// ============================================================

const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', 'vpn-manager', 'src');
const dry = process.argv.includes('--dry');

const MAP = {
  '7': 'text-3xs',
  '8': 'text-3xs',
  '9': 'text-3xs',
  '10': 'text-2xs',
  '11': 'text-2xs',
};

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
  let changed = 0;

  // Reemplaza `text-[Npx]` por su clase semántica. Preserva el resto de
  // utilities y comentarios.
  const newContent = original.replace(/\btext-\[(\d+)px\]/g, (match, sz) => {
    const target = MAP[sz];
    if (!target) return match;  // tamaños fuera de 7-11 no se tocan
    changed++;
    return target;
  });

  if (changed > 0) {
    totalReplaced += changed;
    totalFiles++;
    const relPath = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
    console.log(`  ${String(changed).padStart(3)} ${relPath}`);
    if (!dry) fs.writeFileSync(file, newContent, 'utf8');
  }
}

console.log(`\nTotal: ${totalReplaced} reemplazos en ${totalFiles} archivos`);
console.log(dry ? '(dry-run — sin escritura)' : '✓ Cambios aplicados.');
