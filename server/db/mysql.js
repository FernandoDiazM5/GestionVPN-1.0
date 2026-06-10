// ============================================================
//  Capa de acceso MySQL — pool de conexiones (singleton).
//  MySQL/MariaDB es la única BD del sistema: dominio operativo
//  (nodos, APs, CPEs, settings vía db.service.js) + dominio
//  multi-tenant/RBAC (users, workspaces, members, invitations, logs).
//
//  Config por entorno (valores por defecto = XAMPP local):
//    MYSQL_HOST=127.0.0.1  MYSQL_PORT=3306
//    MYSQL_USER=root       MYSQL_PASSWORD=(vacío)
//    MYSQL_DATABASE=vpn_manager
// ============================================================

// Carga .env si está disponible (no falla si no existe dotenv)
try { require('dotenv').config(); } catch (_) { /* opcional */ }
const log = require('../lib/logger').child({ scope: 'mysql' });

const mysql = require('mysql2/promise');

let pool = null;

/**
 * Devuelve el pool de conexiones (singleton).
 *
 * Tuning explícito (FASE 11):
 *   • connectTimeout — cuánto esperamos abrir el socket TCP al servidor MySQL.
 *     Si XAMPP/MariaDB está iniciándose o la red se cuelga, sin este límite el
 *     primer request quedaría colgado hasta el TCP-RST del kernel (~75s en Linux).
 *   • keepAliveInitialDelayMs — 5s evita el warning de mysql2 cuando el OS no
 *     soporta delay 0 (visto en Windows). 5s es invisible para el caso normal
 *     y permite reciclar conexiones zombi en pocos segundos.
 *   • maxIdle — el pool puede tener N conexiones idle. Con connectionLimit=10
 *     y MAX_IDLE=5 evitamos retener 10 sockets abiertos en horarios bajos
 *     (libera ficheros + descriptors del lado MySQL).
 *   • idleTimeout — cuánto vive una idle conn antes de cerrarla. 60s sirve para
 *     el patrón del proyecto (polling cada 30s sobre /api/health y nodes).
 */
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
      connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 10000),
      enableKeepAlive: true,
      keepAliveInitialDelayMs: Number(process.env.MYSQL_KEEPALIVE_DELAY_MS || 5000),
      idleTimeout: Number(process.env.MYSQL_IDLE_TIMEOUT_MS || 60000),
      maxIdle: Number(process.env.MYSQL_MAX_IDLE || 5),
    });
  }
  return pool;
}

// Timeout para acquire de conexión. mysql2 no expone `acquireTimeout` real
// en el pool (queda esperando indefinidamente si todas las conns están en uso),
// así que envolvemos getConnection() con Promise.race.
const ACQUIRE_TIMEOUT_MS = Number(process.env.MYSQL_ACQUIRE_TIMEOUT_MS || 8000);

async function acquireConnection() {
  return await Promise.race([
    getPool().getConnection(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error('MySQL acquire timeout'), { code: 'ER_GET_CONNECTION_TIMEOUT' })),
        ACQUIRE_TIMEOUT_MS,
      ),
    ),
  ]);
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
  const conn = await acquireConnection();
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

/**
 * Inicia monitoreo periódico de MySQL.
 * Si detecta caída, reintenta la conexión cada 3 segundos.
 * Útil para XAMPP que puede crashear y reiniciar.
 */
let _monitorHandle = null;
let _monitorRunning = false;   // C7: evita health checks solapados
function startMonitor(intervalMs = 10000) {
  if (_monitorHandle) return; // ya está ejecutándose

  async function healthCheck() {
    if (_monitorRunning) return;   // C7: si el check anterior sigue en curso, saltar
    _monitorRunning = true;
    try {
      await ping();
      // Conexión OK
    } catch (err) {
      const msg = err?.code || err?.message || '';
      const isLostConn = /ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ER_GET_CONNECTION_TIMEOUT/i.test(msg);
      if (isLostConn) {
        log.warn('Monitor: MySQL perdió conexión. Intentando reconectar en 3s');
        // Cierra el pool actual para forzar recreación
        if (pool) pool.end().catch(() => {});
        pool = null;
        await new Promise(r => setTimeout(r, 3000));
        try {
          await getPool().query('SELECT 1');
          log.info('Monitor: MySQL reconectado exitosamente');
        } catch (retryErr) {
          log.warn({ code: retryErr?.code }, 'Monitor: reintento fallido, volverá a intentar');
        }
      }
    } finally {
      _monitorRunning = false;
    }
  }

  _monitorHandle = setInterval(healthCheck, intervalMs);
  log.info({ intervalMs }, 'Health check de MySQL iniciado');
}

function stopMonitor() {
  if (_monitorHandle) {
    clearInterval(_monitorHandle);
    _monitorHandle = null;
  }
}

module.exports = { getPool, query, withTransaction, ping, closePool, startMonitor, stopMonitor };
