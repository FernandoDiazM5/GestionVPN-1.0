#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const IMAGE = 'semgrep/semgrep:1.166.0';
const root = path.resolve(__dirname, '..');
const mount = root.replace(/\\/g, '/');
const cases = [
  'sql-dynamic-query',
  'direct-request-to-command',
];

for (const name of cases) {
  const base = `semgrep-rules/${name}/${name}`;
  const args = [
    'run', '--rm',
    '-v', `${mount}:/src`,
    '-w', '/src',
    IMAGE,
    'semgrep', '--test', '--config', `${base}.yml`, `${base}.js`,
  ];
  const result = spawnSync('docker', args, { stdio: 'inherit' });
  if (result.error) {
    console.error(`[test:semgrep-rules] Docker no disponible: ${result.error.message}`);
    process.exit(127);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
