// ============================================================
//  Capa de acceso MySQL (Fase 1 — multi-usuario / RBAC)
//  Coexiste con SQLite (db.service.js sigue manejando los
//  dispositivos/nodos cacheados). MySQL maneja el dominio
//  multi-tenant: users, workspaces, members, invitations, logs.
//
//  Config por entorno (valores por defecto = XAMPP local):
//    MYSQL_HOST=127.0.0.1  MYSQL_PORT=3306
//    MYSQL_USER=root       MYSQL_PASSWORD=(vacío)
//    MYSQL_DATABASE=vpn_manager
// ============================================================

// Carga .env si está disponible (no falla si no existe dotenv)
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const mysql = require('mysql2/promise');

let pool = null;

/** Devuelve el pool de conexiones (singleton). */
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'vpn_manager',
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_POOL || 10),
      queueLimit: 0,
      charset: 'utf8mb4_general_ci',
      timezone: 'Z',
    });
  }
  return pool;
}

/**
 * Ejecuta una consulta parametrizada.
 * @returns {Promise<Array>} filas (SELECT) o ResultSetHeader (INSERT/UPDATE).
 */
async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/**
 * Ejecuta una función dentro de una transacción ACID.
 * Hace COMMIT si la función resuelve, ROLLBACK si lanza.
 * El callback recibe un objeto { query } ligado a la conexión.
 *
 * @example
 *   await withTransaction(async (tx) => {
 *     await tx.query('INSERT INTO users ...', [...]);
 *     await tx.query('INSERT INTO workspace_members ...', [...]);
 *   });
 */
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      query: async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return rows;
      },
    };
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* noop */ }
    throw err;
  } finally {
    conn.release();
  }
}

/** Verifica conectividad (para el endpoint de health). */
async function ping() {
  await query('SELECT 1');
  return true;
}

/** Cierra el pool (tests / shutdown). */
async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}

module.exports = { getPool, query, withTransaction, ping, closePool };
