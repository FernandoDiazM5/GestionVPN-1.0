'use strict';

const mysql = require('mysql2/promise');
const fs = require('fs');
const { createApp } = require('./app');
const { loadConfig } = require('./config');

const config = loadConfig();
const signingPrivateKey = fs.readFileSync(config.signingPrivateKeyFile, 'utf8');
const pool = mysql.createPool({ ...config.db, waitForConnections: true, connectionLimit: 10, enableKeepAlive: true });
const app = createApp({ pool, activationPepper: config.activationPepper,
  rateLimitPepper: config.rateLimitPepper, signingKeyId: config.signingKeyId, signingPrivateKey,
  adminMfaEncryptionKey: config.adminMfaEncryptionKey, adminSessionPepper: config.adminSessionPepper });
const server = app.listen(config.port, '127.0.0.1', () => {
  process.stdout.write(`Joinpoint control plane escuchando en 127.0.0.1:${config.port}\n`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
