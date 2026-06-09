// ============================================================
//  test/helpers/moduleMock.js — reemplaza un módulo CJS en el cache
//  de Node para que TODOS los `require(<modulo>)` posteriores (vengan
//  del test o de otros módulos) reciban el objeto mockeado.
//
//  vi.mock() es la API canónica de vitest, pero NO funciona con
//  destructuring imports en CJS cuando el path relativo difiere entre
//  archivos (caso típico de monorepo con repos en db/repos/* que hacen
//  `require('../mysql')` mientras el test hace `require('../../db/mysql')`).
//
//  Uso:
//
//    const { stubModule } = require('../helpers/moduleMock');
//    const mysqlMocks = stubModule(__dirname, '../../db/mysql', {
//      query: vi.fn(),
//      withTransaction: vi.fn(),
//    });
//    // Cualquier `require('../mysql')` desde un repo recibe el mismo mock.
// ============================================================
const path = require('node:path');

/**
 * Mete `exports` en require.cache para el path resuelto desde `fromDir`.
 * @returns el objeto exports (para encadenar .mockResolvedValue, etc.).
 */
function stubModule(fromDir, modulePath, exports_) {
  const absPath = require.resolve(path.join(fromDir, modulePath));
  require.cache[absPath] = {
    id: absPath,
    filename: absPath,
    loaded: true,
    exports: exports_,
    children: [],
    paths: [],
  };
  return exports_;
}

/** Limpia un stub. Devuelve true si había algo cacheado. */
function unstubModule(fromDir, modulePath) {
  const absPath = require.resolve(path.join(fromDir, modulePath));
  const had = !!require.cache[absPath];
  delete require.cache[absPath];
  return had;
}

module.exports = { stubModule, unstubModule };
