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
//  - acquire(key, maxMs): ESPERA su turno (encola, FIFO) y devuelve release().
//  - acquireOrNull(key, waitMs, maxMs): espera ACOTADA. Devuelve release() si
//    lo obtiene dentro de waitMs, o null si no (sin dejar un waiter colgado en
//    la cola → no se filtra el lock). Lo usa el escaneo interactivo para NO
//    bloquear hasta el 504 de nginx: si el lock está ocupado, responde 409.
//  - tryAcquire(key, maxMs): NO espera. Devuelve release() si la clave está
//    libre, o null si está ocupada. Lo usa el job de Monitor AP.
//  - withLock(key, fn, maxMs): azúcar bloqueante para casos async simples.
//
//  Un timer de seguridad auto-libera tras maxMs para que un holder que nunca
//  dispara su release no deje el workspace bloqueado para siempre.
// ============================================================
const log = require('./logger').child({ scope: 'scan-lock' });

const DEFAULT_MAX_MS = 5 * 60 * 1000;

// Estado por clave: si está tomado y la cola FIFO de espera.
//   state: key -> { locked: boolean, waiters: Array<{ cancelled, grant }> }
const state = new Map();

function _state(key) {
  let s = state.get(key);
  if (!s) { s = { locked: false, waiters: [] }; state.set(key, s); }
  return s;
}

// Ocupado = tomado o con al menos un waiter NO cancelado esperando.
function _busy(s) {
  return s.locked || s.waiters.some((w) => !w.cancelled);
}

function _maybeDelete(key, s) {
  if (!s.locked && s.waiters.length === 0) state.delete(key);
}

// Construye un release() idempotente para un holder YA activo (s.locked=true).
function _makeRelease(key, s, maxMs) {
  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    // Pasa el testigo al siguiente waiter NO cancelado (FIFO).
    let next = null;
    while (s.waiters.length) {
      const w = s.waiters.shift();
      if (!w.cancelled) { next = w; break; }
    }
    if (next) {
      next.grant();              // mantiene s.locked = true
    } else {
      s.locked = false;
      _maybeDelete(key, s);
    }
  };
  const timer = setTimeout(() => {
    if (!done) {
      log.warn({ key, maxMs }, 'scan lock auto-liberado por timeout de seguridad');
      release();
    }
  }, maxMs);
  return release;
}

/**
 * Adquiere el lock de `key`, ESPERANDO en cola (FIFO) si está ocupado.
 * Resuelve a una función `release()` idempotente.
 * @returns {Promise<() => void>}
 */
function acquire(key, maxMs = DEFAULT_MAX_MS) {
  const s = _state(key);
  if (!s.locked) {
    s.locked = true;
    return Promise.resolve(_makeRelease(key, s, maxMs));
  }
  return new Promise((resolve) => {
    s.waiters.push({
      cancelled: false,
      grant: () => resolve(_makeRelease(key, s, maxMs)),
    });
  });
}

/**
 * Adquiere el lock de `key` con espera ACOTADA. Si lo obtiene dentro de `waitMs`
 * devuelve `release()`; si no, devuelve `null` y SE DES-ENCOLA (marca su waiter
 * como cancelado → el holder lo salta al liberar). Pensado para el escaneo
 * interactivo: nunca debe bloquear hasta que nginx corte con 504.
 * @returns {Promise<(() => void) | null>}
 */
function acquireOrNull(key, waitMs = 8000, maxMs = DEFAULT_MAX_MS) {
  const s = _state(key);
  if (!s.locked) {
    s.locked = true;
    return Promise.resolve(_makeRelease(key, s, maxMs));
  }
  return new Promise((resolve) => {
    let settled = false;
    const waiter = {
      cancelled: false,
      grant: () => {
        if (settled) return;     // expiró antes de que nos pasaran el testigo
        settled = true;
        clearTimeout(timer);
        resolve(_makeRelease(key, s, maxMs));
      },
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      waiter.cancelled = true;   // el holder lo saltará al liberar
      _maybeDelete(key, s);
      resolve(null);
    }, waitMs);
    s.waiters.push(waiter);
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
  const s = _state(key);
  if (_busy(s)) return null;     // ocupado → no esperamos
  s.locked = true;
  return _makeRelease(key, s, maxMs);
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

module.exports = { acquire, acquireOrNull, tryAcquire, withLock };
