#!/usr/bin/env node

const os = require('os');
const { performance } = require('perf_hooks');
const bcrypt = require('bcryptjs');

function numericArg(name, fallback) {
  const position = process.argv.indexOf(name);
  if (position === -1) return fallback;
  const value = Number(process.argv[position + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return value;
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
  return {
    min_ms: rounded(sorted[0]),
    mean_ms: rounded(values.reduce((total, value) => total + value, 0) / values.length),
    p50_ms: rounded(percentile(0.5)),
    p95_ms: rounded(percentile(0.95)),
    max_ms: rounded(sorted.at(-1)),
  };
}

async function measure(operation) {
  const startedAt = performance.now();
  await operation();
  return performance.now() - startedAt;
}

async function main() {
  const samples = numericArg('--samples', 10);
  const rounds = numericArg('--rounds', 10);
  const syntheticPassword = 'Benchmark-only password 2026!';

  await bcrypt.hash(syntheticPassword, rounds);

  const cpuBefore = process.cpuUsage();
  const memoryBefore = process.memoryUsage().rss;
  let peakRss = memoryBefore;
  const hashTimes = [];
  const verifyTimes = [];

  for (let index = 0; index < samples; index += 1) {
    let hash;
    hashTimes.push(await measure(async () => {
      hash = await bcrypt.hash(syntheticPassword, rounds);
    }));
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    verifyTimes.push(await measure(async () => {
      const valid = await bcrypt.compare(syntheticPassword, hash);
      if (!valid) throw new Error('bcrypt produjo un resultado de verificación inesperado');
    }));
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }

  const cpu = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage().rss;
  const result = {
    algorithm: 'bcryptjs',
    rounds,
    samples,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      os_release: os.release(),
      logical_cpus: os.cpus().length,
      total_memory_mb: rounded(os.totalmem() / 1024 / 1024),
    },
    hash: summarize(hashTimes),
    verify: summarize(verifyTimes),
    process: {
      cpu_user_ms: rounded(cpu.user / 1000),
      cpu_system_ms: rounded(cpu.system / 1000),
      rss_before_mb: rounded(memoryBefore / 1024 / 1024),
      rss_peak_mb: rounded(peakRss / 1024 / 1024),
      rss_after_mb: rounded(memoryAfter / 1024 / 1024),
    },
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
