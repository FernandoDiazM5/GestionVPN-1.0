// ============================================================
//  Mock del módulo db/mysql.js — backing store en memoria.
//
//  Soporta solo el subset de queries que cubren los tests (SELECT/INSERT/
//  UPDATE/DELETE básicos sobre tablas que el test define). NO es un
//  emulador SQL — los tests deben configurar el storage manualmente.
//
//  Uso:
//
//    import { vi } from 'vitest';
//    vi.mock('../db/mysql', () => require('./mocks/mysql'));
//
//    const { __db } = require('./mocks/mysql');
//    __db.tables.users = [{ id: 'u1', email: 'a@b.c', deleted_at: null }];
//    // Ahora, query('SELECT id FROM users WHERE email = ?', ['a@b.c']) responde.
// ============================================================

const tables = {};

function reset() {
  for (const k of Object.keys(tables)) delete tables[k];
}

/**
 * Mini parser: detecta SELECT <cols> FROM <tabla> WHERE <col1> = ? [AND ...].
 * Para casos más complejos los tests deben mockear `query` directamente:
 *   vi.mocked(require('../db/mysql').query).mockResolvedValueOnce([...])
 */
function parseSimple(sql) {
  const m = /SELECT\s+(?:.+?)\s+FROM\s+([a-z_]+)/i.exec(sql);
  return { table: m?.[1] || null };
}

async function query(sql, params = []) {
  const { table } = parseSimple(sql);
  if (!table || !tables[table]) return [];
  // Devuelve TODA la tabla — los tests deben ajustar el filtro a mano
  // si necesitan precisión. Para asserts de "se llamó con X" usa vi.spyOn.
  void params;
  return tables[table];
}

async function withTransaction(fn) {
  const tx = { query };
  return fn(tx);
}

function getPool() {
  return {
    end: async () => {},
    getConnection: async () => ({
      release: () => {},
      query,
    }),
  };
}

function startMonitor() { /* noop */ }

module.exports = {
  query,
  withTransaction,
  getPool,
  startMonitor,
  __db: { tables, reset },
};
