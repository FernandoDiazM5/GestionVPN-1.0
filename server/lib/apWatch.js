// ============================================================
//  lib/apWatch.js (E1) — registro en memoria de "quién está mirando
//  Monitor AP". El frontend manda un heartbeat (POST /api/ap-monitor/watch)
//  mientras la vista está montada; el apPollJob solo pollea workspaces con
//  un heartbeat reciente. Así el SSH a las antenas ocurre SOLO mientras un
//  moderador tiene la vista abierta (alineado con la política §43).
// ============================================================

const DEFAULT_TTL_MS = 90_000;

/** @type {Map<string, number>} workspace_id → último heartbeat (epoch ms) */
const watches = new Map();

/** Registra/renueva el heartbeat de un workspace. */
function touch(workspaceId, now = Date.now()) {
  if (workspaceId) watches.set(workspaceId, now);
}

/** ¿El workspace tiene un heartbeat dentro del TTL? */
function isWatched(workspaceId, ttlMs = DEFAULT_TTL_MS, now = Date.now()) {
  const ts = watches.get(workspaceId);
  return !!ts && (now - ts <= ttlMs);
}

/** Lista de workspaces con heartbeat vigente; purga los vencidos de paso. */
function watchedWorkspaces(ttlMs = DEFAULT_TTL_MS, now = Date.now()) {
  const out = [];
  for (const [ws, ts] of watches) {
    if (now - ts <= ttlMs) out.push(ws);
    else watches.delete(ws);
  }
  return out;
}

/** Solo para tests. */
function _reset() { watches.clear(); }

module.exports = { touch, isWatched, watchedWorkspaces, DEFAULT_TTL_MS, _reset };
