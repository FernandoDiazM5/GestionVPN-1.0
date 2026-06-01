// ============================================================
//  Aislamiento multi-tenant para datos de AP/CPE (Monitor AP, Equipos)
//  Admin de plataforma ve/gestiona todo; cada moderador solo los datos
//  (grupos AP, APs, CPEs, señal) de su propio workspace. Todo cuelga de
//  ap_groups.workspace_id.
//  Las funciones reciben el handle de BD (db.service.getDb()) y `req`.
// ============================================================

/** workspace del solicitante, o null si es admin (sin restricción). */
function reqWorkspace(req) {
  const acc = req.account;
  if (!acc || acc.platform_admin) return null;
  return acc.workspace_id || '__none__';
}

/** IDs (INTEGER) de los ap_groups del workspace. Admin → null (todos). */
async function ownedGroupIntIds(db, req) {
  const ws = reqWorkspace(req);
  if (ws === null) return null;
  const rows = await db.all('SELECT id FROM ap_groups WHERE workspace_id = ?', [ws]);
  return rows.map(r => r.id);
}

/** IDs (INTEGER) de los APs del workspace (vía ap_group). Admin → null (todos). */
async function ownedApIntIds(db, req) {
  const gids = await ownedGroupIntIds(db, req);
  if (gids === null) return null;
  if (gids.length === 0) return [];
  const ph = gids.map(() => '?').join(',');
  const rows = await db.all(`SELECT id FROM aps WHERE ap_group_id IN (${ph})`, gids);
  return rows.map(r => r.id);
}

/** ¿el ap_group (uuid) pertenece al workspace? (admin → siempre true). */
async function ownsGroupUuid(db, req, uuid) {
  const ws = reqWorkspace(req);
  if (ws === null) return true;
  const row = await db.get('SELECT workspace_id FROM ap_groups WHERE uuid = ?', [uuid]);
  return !!row && row.workspace_id === ws;
}

/** ¿el AP (uuid) pertenece al workspace? (admin → siempre true). */
async function ownsApUuid(db, req, uuid) {
  const ws = reqWorkspace(req);
  if (ws === null) return true;
  const row = await db.get(
    'SELECT g.workspace_id AS w FROM aps a JOIN ap_groups g ON g.id = a.ap_group_id WHERE a.uuid = ?', [uuid]);
  return !!row && row.w === ws;
}

/**
 * ¿El CPE (por mac) pertenece a OTRO workspace? (existe + tiene AP + ese AP es
 * de otro). Los CPEs huérfanos (sin ap_id) o inexistentes no son ajenos.
 */
async function cpeForeign(db, req, mac) {
  const ws = reqWorkspace(req);
  if (ws === null) return false;
  const row = await db.get(
    `SELECT c.ap_id, g.workspace_id AS w
       FROM cpes c LEFT JOIN aps a ON a.id = c.ap_id
       LEFT JOIN ap_groups g ON g.id = a.ap_group_id WHERE c.mac = ?`, [mac]);
  if (!row || row.ap_id == null) return false;
  return row.w !== ws;
}

module.exports = {
  reqWorkspace, ownedGroupIntIds, ownedApIntIds, ownsGroupUuid, ownsApUuid, cpeForeign,
};
