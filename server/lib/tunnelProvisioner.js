// ============================================================
//  tunnelProvisioner.js — Provisión de acceso por USUARIO en MikroTik
//
//  Modelo multi-usuario: una regla mangle POR IP de gestión.
//    src-address=<mgmt_ip> dst-address-list=LIST-NET-REMOTE-TOWERS
//    new-routing-mark=<vrf>  comment=ACCESO-USER-<userTag>
//
//  Cada usuario marca SOLO su propio tráfico → coexisten N usuarios,
//  cada uno enrutado a su VRF, sin colisión de LANs duplicadas.
//
//  IMPORTANTE (node-routeros): las funciones aquí son granulares y
//  separan LECTURAS de ESCRITURAS. La ruta debe usar una conexión para
//  prints y OTRA para removes/add (patrón probado en deprovision), para
//  evitar la desincronización del protocolo cuando un write queda pendiente.
//  El cleanup es por `comment` (no por .id) → no requiere re-leer tras el add.
// ============================================================
const { safeWrite, writeIdempotent } = require('../routeros.service');
const log = require('./logger').child({ scope: 'provisioner' });

const DST_LIST = 'LIST-NET-REMOTE-TOWERS';

/** Etiqueta corta y estable del usuario para el comment de la regla. */
function userTag(userId) {
  return String(userId || '').replace(/-/g, '').slice(0, 12) || 'anon';
}

/** comment único de la mangle de un usuario. */
function mangleComment(userId) {
  return `ACCESO-USER-${userTag(userId)}`;
}

/** comment de la mangle de ESCANEO de un workspace (Opción C).
 *  Namespace separado de la de túnel para no pisar el acceso del usuario:
 *  marca SOLO el tráfico de la scan-IP del VPS hacia el VRF a escanear. */
function scanMangleComment(workspaceId) {
  return `SCAN-WS-${userTag(workspaceId)}`;
}

// ── LECTURAS (conexión de solo-lectura) ─────────────────────────────────────
//  IMPORTANTE: estas funciones NO enmascaran errores de `print`. Si el router
//  no responde, PROPAGAN la excepción para que el caller falle de forma segura
//  (fail-closed) en lugar de asumir "no hay reglas" (lo que duplicaría mangles
//  o cerraría sesiones sin revocar acceso). Ver C1–C4 de la auditoría.

/** ¿Existe el VRF en el router? Lanza si el print falla. */
async function vrfExists(api, vrfName) {
  const vrfs = await safeWrite(api, ['/ip/vrf/print'], 10000);
  return vrfs.some(v => v.name === vrfName);
}

/** Lee la tabla mangle UNA vez (para combinar varias búsquedas sin N prints). Lanza si falla. */
async function readMangles(api) {
  return safeWrite(api, ['/ip/firewall/mangle/print'], 12000);
}

/** .id de la mangle del usuario dentro de una lista YA leída (filtro puro). */
function filterUserMangleIds(all, userId) {
  const comment = mangleComment(userId);
  return (all || []).filter(m => m.comment === comment && m['.id']).map(m => m['.id']);
}

/** .id de las mangle GLOBALES legacy dentro de una lista YA leída (filtro puro). */
function filterLegacyGlobalMangleIds(all) {
  return (all || []).filter(m => LEGACY_GLOBAL_COMMENTS.includes(m.comment) && m['.id']).map(m => m['.id']);
}

/** .id de las mangle del usuario (por comment). Lanza si el print falla. */
async function findUserMangleIds(api, userId) {
  return filterUserMangleIds(await readMangles(api), userId);
}

/** .id de las mangle de ESCANEO del workspace (por comment). Lanza si falla. */
async function findScanMangleIds(api, workspaceId) {
  const comment = scanMangleComment(workspaceId);
  const all = await safeWrite(api, ['/ip/firewall/mangle/print'], 12000);
  return all.filter(m => m.comment === comment && m['.id']).map(m => m['.id']);
}

// comments del modelo single-user antiguo (mangle GLOBAL src=192.168.21.0/24).
// El backend nuevo nunca los crea → si existen, son legacy y rompen el aislamiento.
const LEGACY_GLOBAL_COMMENTS = ['ACCESO-ADMIN', 'ACCESO-DINAMICO'];

/**
 * .id de las mangle GLOBALES legacy (single-user). Se eliminan automáticamente
 * para que el modelo por-usuario no conviva con la regla que marca toda la /24.
 * Lanza si el print falla.
 */
async function findLegacyGlobalMangleIds(api) {
  return filterLegacyGlobalMangleIds(await readMangles(api));
}

/** ¿Existe la mangle del usuario para ese VRF? (keepalive). Lanza si el print falla. */
async function hasUserMangle(api, { userId, mgmtIp, vrfName }) {
  const comment = mangleComment(userId);
  const all = await safeWrite(api, ['/ip/firewall/mangle/print'], 12000);
  return all.some(m =>
    m.comment === comment &&
    m['src-address'] === mgmtIp &&
    m['new-routing-mark'] === vrfName
  );
}

// ── ESCRITURAS (conexión separada) ──────────────────────────────────────────

/**
 * Remueve una lista de .id de mangle. Si ALGÚN borrado falla, lanza un error
 * (con `.failed` y `.removed`) para que el caller NO asuma que el acceso fue
 * revocado. Ver C1 de la auditoría ("Revocar" debe fallar si no se pudo borrar).
 * @returns {Promise<number>} cantidad eliminada (solo si TODOS tuvieron éxito)
 */
async function removeMangleIds(api, ids = []) {
  let removed = 0;
  const failed = [];
  for (const id of ids) {
    try {
      await safeWrite(api, ['/ip/firewall/mangle/remove', `=.id=${id}`], 10000);
      removed++;
    } catch (e) {
      log.warn({ mangleId: id, err: e?.message }, 'remove mangle falló');
      failed.push({ id, error: e?.message });
    }
  }
  if (failed.length) {
    const err = new Error(`No se pudieron eliminar ${failed.length} regla(s) mangle`);
    err.failed = failed;
    err.removed = removed;
    throw err;
  }
  return removed;
}

/** Crea la mangle de acceso del usuario hacia un VRF (idempotente por comment). */
async function addUserMangle(api, { userId, mgmtIp, vrfName }) {
  if (!mgmtIp) throw new Error('mgmtIp requerido');
  if (!vrfName) throw new Error('vrfName requerido');
  await writeIdempotent(api, [
    '/ip/firewall/mangle/add',
    '=chain=prerouting',
    '=action=mark-routing',
    `=comment=${mangleComment(userId)}`,
    `=dst-address-list=${DST_LIST}`,
    `=new-routing-mark=${vrfName}`,
    `=src-address=${mgmtIp}`,
    '=passthrough=yes',
  ], 12000);
}

/** Crea la mangle de ESCANEO del VPS (Opción C): src=scan-IP del workspace → VRF.
 *  El caller DEBE remover primero la scan-mangle previa del workspace (el VRF
 *  cambia entre escaneos); ver lib/scanMangle.setup. */
async function addScanMangle(api, { workspaceId, scanIp, vrfName }) {
  if (!scanIp) throw new Error('scanIp requerido');
  if (!vrfName) throw new Error('vrfName requerido');
  await writeIdempotent(api, [
    '/ip/firewall/mangle/add',
    '=chain=prerouting',
    '=action=mark-routing',
    `=comment=${scanMangleComment(workspaceId)}`,
    `=dst-address-list=${DST_LIST}`,
    `=new-routing-mark=${vrfName}`,
    `=src-address=${scanIp}`,
    '=passthrough=yes',
  ], 12000);
}

module.exports = {
  DST_LIST,
  LEGACY_GLOBAL_COMMENTS,
  userTag, mangleComment, scanMangleComment,
  vrfExists, findUserMangleIds, findLegacyGlobalMangleIds, hasUserMangle,
  findScanMangleIds,
  readMangles, filterUserMangleIds, filterLegacyGlobalMangleIds,
  removeMangleIds, addUserMangle, addScanMangle,
};
