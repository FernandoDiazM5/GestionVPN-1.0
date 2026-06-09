// ============================================================
//  Mock de RouterOS API para tests.
//
//  Uso típico (vitest):
//
//    import { vi } from 'vitest';
//    vi.mock('../routeros.service', () => require('./mocks/routeros'));
//
//  Devuelve un cliente API "fake" cuyas operaciones .write() leen de
//  una tabla configurable por test. NO abre sockets ni RouterOS reales.
// ============================================================

const state = {
  // Tabla mutable: { '/path/print': [rowFake, ...] }
  responses: new Map(),
  // Calls observados — útil para asserts
  calls: [],
};

function setResponse(command, rows) {
  state.responses.set(command, Array.isArray(rows) ? rows : []);
}

function reset() {
  state.responses.clear();
  state.calls.length = 0;
}

async function connectToMikrotik(_host, _user, _pass) {
  return {
    write: async (cmd) => {
      state.calls.push(cmd);
      const key = Array.isArray(cmd) ? cmd[0] : cmd;
      // .add/.set/.remove devuelven [] vacío (idempotente)
      if (/\/(add|set|remove)$/.test(key)) return [];
      // /print devuelve lo configurado o [] por defecto
      return state.responses.get(key) || [];
    },
    close: async () => {},
  };
}

async function safeWrite(api, cmd, _timeout) {
  return api.write(cmd);
}

async function writeIdempotent(api, cmd, _timeout) {
  return api.write(cmd);
}

function getErrorMessage(err) {
  return err?.message || String(err);
}

function parseHandshakeSecs(s) {
  return s === '' ? Infinity : 0;
}

async function cleanTunnelRules() { return 0; }

module.exports = {
  connectToMikrotik,
  safeWrite,
  writeIdempotent,
  getErrorMessage,
  parseHandshakeSecs,
  cleanTunnelRules,
  // helpers test-only
  __mock: { setResponse, reset, state },
};
