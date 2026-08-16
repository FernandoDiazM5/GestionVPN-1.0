'use strict';
const fs = require('fs');
const mysql = require('mysql2/promise');
const { loadConfig } = require('../config');

async function main() {
  const config = loadConfig();
  const connection = await mysql.createConnection({ ...config.db, multipleStatements: true });
  try {
    await connection.query(fs.readFileSync('/app/control-plane/sql/001_control_plane_core.sql', 'utf8'));
    process.stdout.write('Esquema central aplicado\n');
  } finally { await connection.end(); }
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exit(1); });
