'use strict';

const net = require('node:net');

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRY_MS = 1_000;

function waitForTcp({ host, port, timeoutMs = DEFAULT_TIMEOUT_MS, retryMs = DEFAULT_RETRY_MS }) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host, port });
      let settled = false;

      const finishAttempt = (error) => {
        if (settled) return;
        settled = true;
        socket.destroy();

        if (!error) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Database TCP endpoint ${host}:${port} was unavailable after ${timeoutMs} ms`));
          return;
        }

        setTimeout(attempt, retryMs);
      };

      socket.setTimeout(Math.min(retryMs, 2_000));
      socket.once('connect', () => finishAttempt());
      socket.once('timeout', () => finishAttempt(new Error('timeout')));
      socket.once('error', finishAttempt);
    };

    attempt();
  });
}

async function main() {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || 3306);
  const timeoutMs = Number(process.env.DB_STARTUP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MYSQL_PORT must be a valid TCP port');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) {
    throw new Error('DB_STARTUP_TIMEOUT_MS must be at least 1000 ms');
  }

  console.log(`[entrypoint] Esperando MariaDB en ${host}:${port} ...`);
  await waitForTcp({ host, port, timeoutMs });
  console.log('[entrypoint] MariaDB acepta conexiones TCP.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[entrypoint] ERROR esperando MariaDB: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { waitForTcp };
