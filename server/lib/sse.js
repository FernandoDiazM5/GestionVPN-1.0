// ============================================================
//  Hub de Server-Sent Events (Fase 4) — tiempo real aislado
//  Canales (rooms) por workspace_id: nadie fuera de tu workspace
//  recibe tus eventos.
// ============================================================

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const rooms = new Map();

/** Suscribe una respuesta SSE al room de un workspace. Devuelve unsubscribe(). */
function subscribe(workspaceId, res) {
  if (!rooms.has(workspaceId)) rooms.set(workspaceId, new Set());
  rooms.get(workspaceId).add(res);
  return () => {
    const set = rooms.get(workspaceId);
    if (set) { set.delete(res); if (set.size === 0) rooms.delete(workspaceId); }
  };
}

/** Publica un evento a todos los clientes de un workspace. */
function publish(workspaceId, event, data) {
  const set = rooms.get(workspaceId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch (_) { /* conexión caída; se limpia al cerrar */ }
  }
}

/** Nº de clientes conectados (diagnóstico). */
function clientCount(workspaceId) {
  return rooms.get(workspaceId)?.size || 0;
}

module.exports = { subscribe, publish, clientCount };
