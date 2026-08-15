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
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IMAGE = 'semgrep/semgrep:1.166.0';

// Rulesets curados: JS/TS + React + secretos + auditoría de seguridad.
// El registro de Semgrep los descarga sin necesidad de login.
const PROFILES = {
  javascript: ['p/javascript'],
  typescript: ['p/typescript'],
  react: ['p/react'],
  secrets: ['p/secrets'],
  security: ['p/security-audit'],
  local: [
    'semgrep-rules/sql-dynamic-query/sql-dynamic-query.yml',
    'semgrep-rules/direct-request-to-command/direct-request-to-command.yml',
  ],
};

const root = path.resolve(__dirname, '..');

const passthrough = process.argv.slice(2); // ej. "--profile=local server"
const wantsJson = passthrough.includes('--json');
const profileArg = passthrough.find((a) => a.startsWith('--profile='));
const profile = profileArg ? profileArg.slice('--profile='.length) : 'local';
const configs = PROFILES[profile];
if (!configs) {
  console.error(`[audit:semgrep] Perfil desconocido: ${profile}. Usa: ${Object.keys(PROFILES).join(', ')}`);
  process.exit(2);
}
const targets = passthrough.filter((a) => a !== '--json' && !a.startsWith('--profile='));
const defaultTargets = profile === 'local'
  ? ['server', 'vpn-manager/src', 'packages/contracts/src']
  : ['.'];

function stageWindowsSources() {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'gestionvpn-semgrep-'));
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean);
  const sourceRoots = ['control-plane/', 'server/', 'vpn-manager/src/', 'packages/contracts/src/', 'semgrep-rules/'];
  const ignored = /(^|\/)(node_modules|dist|build|coverage|test|tests)(\/|$)|\.(test|spec)\.(js|jsx|ts|tsx)$/;
  const sourceExtension = /\.(js|jsx|ts|tsx|json|ya?ml)$/;
  for (const relative of listed) {
    const normalized = relative.replace(/\\/g, '/');
    if (!sourceRoots.some((prefix) => normalized.startsWith(prefix))) continue;
    if (ignored.test(normalized) || !sourceExtension.test(normalized)) continue;
    const source = path.join(root, relative);
    if (!fs.statSync(source).isFile()) continue;
    const destination = path.join(stage, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return stage;
}

// Los bind mounts de carpetas grandes desde Windows pueden atascar el
// descubrimiento de Semgrep. Se monta una copia efimera solo con fuentes.
const scanRoot = process.platform === 'win32' ? stageWindowsSources() : root;
const mount = scanRoot.replace(/\\/g, '/');

const semgrepArgs = [
  'scan',
  ...configs.flatMap((c) => ['--config', c]),
  '--metrics=off',
  '--jobs=1',
  '--error',                 // exit !=0 si hay findings (gate de CI)
  ...(wantsJson ? ['--json'] : []),
  ...(targets.length ? targets : defaultTargets),
];

const dockerArgs = [
  'run', '--rm',
  '-v', `${mount}:/src`,
  '-w', '/src',
  IMAGE,
  'semgrep', ...semgrepArgs,
];

console.error(`[audit:semgrep] ${IMAGE} · perfil: ${profile} · configs: ${configs.join(', ')}`);
let res;
try {
  res = spawnSync('docker', dockerArgs, { stdio: 'inherit' });
} finally {
  if (scanRoot !== root) fs.rmSync(scanRoot, { recursive: true, force: true });
}

if (res.error) {
  console.error('[audit:semgrep] No se pudo ejecutar Docker:', res.error.message);
  console.error('[audit:semgrep] ¿Docker Desktop está corriendo?');
  process.exit(127);
}
process.exit(res.status == null ? 1 : res.status);
