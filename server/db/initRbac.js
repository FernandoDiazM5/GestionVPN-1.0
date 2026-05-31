// ============================================================
//  Inicializador del esquema RBAC en MySQL (Fase 1)
//  Crea la base de datos (si no existe) y aplica schema_rbac.sql.
//
//  Requisitos: XAMPP/MySQL corriendo. Ejecutar:
//     cd server && npm run init:rbac
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT) || 3306;
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'vpn_manager';

  const schemaPath = path.join(__dirname, '..', 'sql', 'schema_rbac.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  console.log(`[init:rbac] Conectando a MySQL ${user}@${host}:${port} ...`);

  // Conexión al servidor (sin DB) para poder crearla.
  const conn = await mysql.createConnection({
    host, port, user, password,
    multipleStatements: true,
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` ` +
      `CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`
    );
    console.log(`[init:rbac] Base de datos '${database}' lista.`);

    await conn.query(`USE \`${database}\`;`);
    await conn.query(schemaSql);
    console.log('[init:rbac] Esquema RBAC aplicado correctamente ✓');

    const [tables] = await conn.query('SHOW TABLES;');
    console.log('[init:rbac] Tablas:', tables.map(t => Object.values(t)[0]).join(', '));
  } finally {
    await conn.end();
  }
}

main()
  .then(() => { console.log('[init:rbac] Completado.'); process.exit(0); })
  .catch((err) => {
    console.error('[init:rbac] ERROR:', err.message);
    console.error('  → Verifica que XAMPP/MySQL esté corriendo y las variables MYSQL_* en server/.env');
    process.exit(1);
  });
