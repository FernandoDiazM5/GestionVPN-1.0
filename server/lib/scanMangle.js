// ============================================================
//  scanMangle.js — Opción C: ciclo de vida de la mangle de ESCANEO.
//
//  Antes de escanear, el backend (en el VPS) crea en el MikroTik:
//     src-address=<scan-IP del workspace> → new-routing-mark=<VRF a escanear>
//  con comment SCAN-WS-<ws>. El SSH/HTTP del escaneo se ata a esa scan-IP
//  (localAddress), de modo que el router lo enruta al VRF correcto. Al
//  terminar el escaneo se borra la regla.
//
//  Respeta la disciplina node-routeros: LECTURAS y ESCRITURAS en conexiones
//  separadas (mismo patrón que tunnelService).
// ============================================================
const { connectToMikrotik } = require('../routeros.service');
const provisioner = require('./tunnelProvisioner');
const log = require('./logger').child({ scope: 'scan-mangle' });

/**
 * Crea la mangle de escaneo del workspace (reemplazando cualquier previa).
 * Lanza si el VRF no existe o si el router falla → el caller debe abortar el
 * escaneo (sin la mangle, el tráfico de la scan-IP no llegaría al VRF).
 */
async function setup({ workspaceId, scanIp, vrfName, mikrotik }) {
  const { ip, user, pass } = mikrotik;
  let apiRead, apiWrite;
  try {
    apiRead = await connectToMikrotik(ip, user, pass);
    const vrfOk = await provisioner.vrfExists(apiRead, vrfName);
    const oldIds = await provisioner.findScanMangleIds(apiRead, workspaceId);
    await apiRead.close().catch(() => {});
    apiRead = null;
    if (!vrfOk) throw new Error(`El VRF ${vrfName} no existe en el router`);

    apiWrite = await connectToMikrotik(ip, user, pass);
    await provisioner.removeMangleIds(apiWrite, oldIds);
    await provisioner.addScanMangle(apiWrite, { workspaceId, scanIp, vrfName });
    await apiWrite.close().catch(() => {});
    log.info({ workspaceId, scanIp, vrfName }, 'scan mangle creada');
  } catch (e) {
    if (apiRead) await apiRead.close().catch(() => {});
    if (apiWrite) await apiWrite.close().catch(() => {});
    throw e;
  }
}

/**
 * Borra la mangle de escaneo del workspace. Best-effort: no lanza (la limpieza
 * no debe romper la respuesta al cliente). Si queda huérfana, el siguiente
 * setup la reemplaza igualmente.
 */
async function teardown({ workspaceId, mikrotik }) {
  const { ip, user, pass } = mikrotik;
  let apiRead, apiWrite;
  try {
    apiRead = await connectToMikrotik(ip, user, pass);
    const ids = await provisioner.findScanMangleIds(apiRead, workspaceId);
    await apiRead.close().catch(() => {});
    apiRead = null;
    if (ids.length) {
      apiWrite = await connectToMikrotik(ip, user, pass);
      await provisioner.removeMangleIds(apiWrite, ids);
      await apiWrite.close().catch(() => {});
      log.info({ workspaceId, count: ids.length }, 'scan mangle eliminada');
    }
  } catch (e) {
    if (apiRead) await apiRead.close().catch(() => {});
    if (apiWrite) await apiWrite.close().catch(() => {});
    log.warn({ workspaceId, err: e?.message }, 'teardown scan mangle falló (se reemplazará en el próximo escaneo)');
  }
}

module.exports = { setup, teardown };
