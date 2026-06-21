// ============================================================
//  scanLock.js — mutex async por clave (workspace) para la scan-IP.
//
//  La scan-IP de un workspace tiene UNA sola mangle activa a la vez
//  (src=scan-IP → VRF). Dos consumidores la manipulan: el escaneo
//  interactivo (scan.routes, disparado por el moderador) y el job de
//  Monitor AP en segundo plano (apPollJob). Como el workspace tiene UN
//  solo moderador, ya no se serializan dos humanos, pero SÍ hay que
//  serializar al moderador contra el job de fondo: si ambos conmutan la
//  mangle a la vez, los resultados saldrían del VRF equivocado. Este lock
//  serializa por workspace (claves distintas → sin contención).
//
//  - acquire(key, maxMs): ESPERA su turno (encola) y devuelve release().
//    Lo usa el escaneo interactivo, que debe completarse sí o sí.
//  - tryAcquire(key, maxMs): NO espera. Devuelve release() si la clave está
//    libre, o null si está ocupada. Lo usa el job de Monitor AP: si el
//    moderador está escaneando, el job se SALTA ese workspace este tick (sin
//    bloquear el tick global de los demás workspaces) y reintenta al próximo.
//  - withLock(key, fn, maxMs): azúcar bloqueante para casos async simples.
//
//  Un timer de seguridad auto-libera tras maxMs para que un handler que nunca
//  dispara su release no deje el workspace bloqueado para siempre.
// ============================================================
const log = require('./logger').child({ scope: 'scan-lock' });

const tails = new Map();    // key -> Promise (cola del mutex, para acquire)
const pending = new Map();  // key -> nº de holders activos + encolados
const DEFAULT_MAX_MS = 5 * 60 * 1000;

function incPending(key) { pending.set(key, (pending.get(key) || 0) + 1); }
function decPending(key) {
  const n = (pending.get(key) || 1) - 1;
  if (n <= 0) pending.delete(key); else pending.set(key, n);
}

/**
 * Adquiere el lock de `key`, ESPERANDO en cola si está ocupado.
 * Resuelve a una función `release()` idempotente.
 * @returns {Promise<() => void>}
 */
function acquire(key, maxMs = DEFAULT_MAX_MS) {
  const prev = tails.get(key) || Promise.resolve();
  let openGate;
  const gate = new Promise((res) => { openGate = res; });
  incPending(key);
  tails.set(key, prev.then(() => gate));

  return prev.then(() => {
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      decPending(key);
      openGate();
    };
    const timer = setTimeout(() => {
      if (!done) {
        log.warn({ key, maxMs }, 'scan lock auto-liberado por timeout de seguridad');
        release();
      }
    }, maxMs);
    return release;
  });
}

/**
 * Intenta adquirir el lock de `key` SIN esperar. Si la clave está libre la toma
 * y devuelve `release()`; si está ocupada (alguien la tiene o la espera),
 * devuelve `null` de inmediato. Pensado para jobs periódicos que prefieren
 * saltarse un tick antes que bloquear.
 * @returns {(() => void) | null}
 */
function tryAcquire(key, maxMs = DEFAULT_MAX_MS) {
  if ((pending.get(key) || 0) > 0) return null;   // ocupado → no esperamos
  let openGate;
  const gate = new Promise((res) => { openGate = res; });
  incPending(key);
  tails.set(key, gate);

  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    decPending(key);
    openGate();
  };
  const timer = setTimeout(() => {
    if (!done) {
      log.warn({ key, maxMs }, 'scan lock auto-liberado por timeout de seguridad');
      release();
    }
  }, maxMs);
  return release;
}

/** Ejecuta `fn` con el lock de `key` tomado (ESPERANDO turno); lo libera siempre. */
async function withLock(key, fn, maxMs = DEFAULT_MAX_MS) {
  const release = await acquire(key, maxMs);
  try {
    return await fn();
  } finally {
    release();
  }
}

module.exports = { acquire, tryAcquire, withLock };
