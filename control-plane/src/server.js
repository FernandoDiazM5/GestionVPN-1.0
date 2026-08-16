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
const server = app.listen(config.port, config.host, () => {
  process.stdout.write(`Joinpoint control plane escuchando en ${config.host}:${config.port}\n`);
});

const notificationTimer=setInterval(()=>app.locals.processNotifications?.().catch(()=>{}),30_000);
notificationTimer.unref();
const commercialTimer=setInterval(()=>app.locals.reconcileCommercial?.().catch(()=>{}),60_000);
commercialTimer.unref();

async function shutdown() {
  clearInterval(notificationTimer);
  clearInterval(commercialTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
