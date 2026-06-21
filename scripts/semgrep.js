#!/usr/bin/env node
// ============================================================
//  scripts/semgrep.js — Ejecuta Semgrep vía Docker (sin Python).
//
//  Semgrep no tiene binario nativo de Windows; la vía soportada y
//  reproducible (local + CI) es la imagen oficial semgrep/semgrep.
//  Este wrapper resuelve el montaje de volúmenes en Windows y Linux
//  sin que el shell mutile los paths (problema de Git Bash/MSYS).
//
//  Uso:
//    npm run audit:semgrep              → escaneo de seguridad del repo
//    npm run audit:semgrep -- server    → solo una ruta
//    npm run audit:semgrep:json         → salida JSON (para CI)
//
//  Requiere Docker. Versión de la imagen FIJADA para reproducibilidad.
// ============================================================
const { spawnSync } = require('child_process');
const path = require('path');

const IMAGE = 'semgrep/semgrep:1.166.0';

// Rulesets curados: JS/TS + React + secretos + auditoría de seguridad.
// El registro de Semgrep los descarga sin necesidad de login.
const CONFIGS = [
  'p/javascript',
  'p/typescript',
  'p/react',
  'p/secrets',
  'p/security-audit',
];

const root = path.resolve(__dirname, '..');
// Docker (Windows + Linux) acepta el path con forward slashes.
const mount = root.replace(/\\/g, '/');

const passthrough = process.argv.slice(2); // ej. "server" o "--json"
const wantsJson = passthrough.includes('--json');
const targets = passthrough.filter((a) => a !== '--json');

const semgrepArgs = [
  'scan',
  ...CONFIGS.flatMap((c) => ['--config', c]),
  '--metrics=off',
  '--error',                 // exit !=0 si hay findings (gate de CI)
  ...(wantsJson ? ['--json'] : []),
  ...(targets.length ? targets : ['.']),
];

const dockerArgs = [
  'run', '--rm',
  '-v', `${mount}:/src`,
  '-w', '/src',
  IMAGE,
  'semgrep', ...semgrepArgs,
];

console.error(`[audit:semgrep] ${IMAGE} · configs: ${CONFIGS.join(', ')}`);
const res = spawnSync('docker', dockerArgs, { stdio: 'inherit' });

if (res.error) {
  console.error('[audit:semgrep] No se pudo ejecutar Docker:', res.error.message);
  console.error('[audit:semgrep] ¿Docker Desktop está corriendo?');
  process.exit(127);
}
process.exit(res.status == null ? 1 : res.status);
