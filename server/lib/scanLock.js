// ============================================================
//  scanLock.js — mutex async por clave (workspace) para la scan-IP.
//
//  La scan-IP de un workspace tiene UNA sola mangle activa a la vez
//  (src=scan-IP → VRF). El escaneo interactivo (scan.routes) y el job
//  de Monitor AP (apPollJob) la manipulan; si dos co-moderadores del
//  mismo workspace operan a la vez, podrían pisarse el VRF. Este lock
//  serializa por workspace (claves distintas → sin contención).
//
//  - acquire(key, maxMs): espera su turno y devuelve release(). Un timer
//    de seguridad auto-libera tras maxMs para que un handler que nunca
//    dispara no deje el workspace bloqueado para siempre.
//  - withLock(key, fn, maxMs): azúcar para casos async simples.
// ============================================================
const log = require('./logger').child({ scope: 'scan-lock' });

const tails = new Map(); // key -> Promise (cola del mutex)
const DEFAULT_MAX_MS = 5 * 60 * 1000;

/**
 * Adquiere el lock de `key`. Resuelve a una función `release()` idempotente.
 * @returns {Promise<() => void>}
 */
function acquire(key, maxMs = DEFAULT_MAX_MS) {
  const prev = tails.get(key) || Promise.resolve();
  let openGate;
  const gate = new Promise((res) => { openGate = res; });
  tails.set(key, prev.then(() => gate));

  return prev.then(() => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        log.warn({ key, maxMs }, 'scan lock auto-liberado por timeout de seguridad');
        done = true; openGate();
      }
    }, maxMs);
    return () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      openGate();
    };
  });
}

/** Ejecuta `fn` con el lock de `key` tomado; lo libera pase lo que pase. */
async function withLock(key, fn, maxMs = DEFAULT_MAX_MS) {
  const release = await acquire(key, maxMs);
  try {
    return await fn();
  } finally {
    release();
  }
}

module.exports = { acquire, withLock };
