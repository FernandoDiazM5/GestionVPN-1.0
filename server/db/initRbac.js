// ============================================================
//  Inicializador del esquema RBAC en MySQL/MariaDB (Fase 1)
//  Crea la base de datos (si no existe) y aplica schema_rbac.sql
//  ejecutando cada sentencia por separado (robusto en XAMPP/MariaDB).
//
//  Requisitos: XAMPP/MySQL corriendo. Ejecutar:
//     cd server && npm run init:rbac
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

/** Divide un script SQL en sentencias individuales (DDL plano, sin procedures). */
function splitStatements(sql) {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))  // quita comentarios de línea
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

async function main() {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT) || 3306;
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'vpn_manager';

  const schemaPath = path.join(__dirname, '..', 'sql', 'schema_rbac.sql');
  const statements = splitStatements(fs.readFileSync(schemaPath, 'utf8'));

  console.log(`[init:rbac] Conectando a MySQL ${user}@${host}:${port} ...`);

  // 1) Conexión al servidor (sin DB) para crearla.
  const root = await mysql.createConnection({ host, port, user, password });
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` ` +
    `CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`
  );
  await root.end();
  console.log(`[init:rbac] Base de datos '${database}' lista.`);

  // 2) Reconexión directa a la DB y aplicar sentencias una por una.
  const conn = await mysql.createConnection({ host, port, user, password, database });
  try {
    // Limpieza previa: elimina tablas (incluidas las corruptas de un crash anterior).
    // Seguro en Fase 1 (sin datos). FK checks off para poder dropear en cualquier orden.
    await conn.query('SET FOREIGN_KEY_CHECKS = 0;');
    for (const tbl of ['auth_attempts', 'tunnel_logs', 'workspace_routers',
                       'invitations', 'workspace_members', 'workspaces', 'users']) {
      try { await conn.query(`DROP TABLE IF EXISTS \`${tbl}\`;`); }
      catch (e) { console.warn(`[init:rbac] aviso al dropear ${tbl}: ${e.message}`); }
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('[init:rbac] Limpieza previa completada.');

    let applied = 0;
    for (const stmt of statements) {
      try {
        await conn.query(stmt);
        applied++;
      } catch (e) {
        console.error(`\n[init:rbac] Falló la sentencia #${applied + 1}:`);
        console.error('  ', stmt.slice(0, 120).replace(/\s+/g, ' '), '...');
        throw e;
      }
    }
    console.log(`[init:rbac] ${applied} sentencias aplicadas ✓`);

    const [tables] = await conn.query('SHOW TABLES;');
    console.log('[init:rbac] Tablas:', tables.map(t => Object.values(t)[0]).join(', '));
  } finally {
    await conn.end();
  }
}

main()
  .then(() => { console.log('[init:rbac] Completado.'); process.exit(0); })
  .catch((err) => {
    console.error('[init:rbac] ERROR:', err.code || '', err.message);
    console.error('  → Verifica que XAMPP/MySQL esté corriendo y las variables MYSQL_* en server/.env');
    process.exit(1);
  });
