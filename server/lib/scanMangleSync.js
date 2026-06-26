// ============================================================
//  scanMangleSync.js — ata el ciclo de vida de la mangle de ESCANEO
//  (SCAN-WS-<ws>: src=scan-IP → VRF) al ciclo de vida del TÚNEL del
//  moderador, en vez de a un timer de gracia que la dejaba "colgada".
//
//  Modelo (decidido con el usuario):
//    • Al ACTIVAR un túnel  → crear/re-apuntar la mangle al VRF activado.
//    • Al DESACTIVAR/EXPIRAR → borrar la mangle (muere con el túnel).
//
//  Es válido porque el sistema fuerza "1 túnel activo por usuario" y hay
//  "1 moderador por workspace" (único que escanea): la scan-IP del workspace
//  solo necesita apuntar al VRF del túnel activo. Entre workspaces NO hay
//  conflicto (cada uno tiene su propia scan-IP del pool 10.11.252.0/24).
//
//  TODO best-effort: nunca lanza (una caída del router no debe romper el
//  activate/deactivate). Usa scanLock.tryAcquire para serializar contra el
//  job de Monitor AP y el escaneo interactivo SIN bloquear: si está ocupado,
//  el propio escaneo del moderador re-sincroniza la mangle (setup idempotente).
// ============================================================
const scanIpRepo = require('../db/repos/scanIpRepo');
const scanMangle = require('./scanMangle');
const log = require('./logger').child({ scope: 'scan-mangle-sync' });

// scanMangleSync es el ÚNICO gestor de la mangle de escaneo (la crea al activar,
// la destruye al desactivar/expirar). Ningún otro sitio la toca (ni el escaneo,
// ni Monitor AP, ni el job de polling), así que NO necesita lock: no hay
// contención por la mangle. Best-effort: una caída del router no rompe el
// activate/deactivate.

/**
 * Túnel activado → la mangle de escaneo del workspace apunta a ese VRF.
 * No-op si el workspace no tiene scan-IP (dev local / sin Opción C).
 */
async function onTunnelActivated({ workspaceId, vrfName, mikrotik }) {
  try {
    if (!mikrotik?.ip || !workspaceId || !vrfName) return;
    const scanIp = await scanIpRepo.resolveForWorkspace(workspaceId).catch(() => null);
    if (!scanIp) return;
    await scanMangle.setup({ workspaceId, scanIp, vrfName, mikrotik });
    log.info({ workspaceId, vrfName }, 'scan mangle sincronizada con túnel activado');
  } catch (e) {
    log.warn({ workspaceId, vrfName, err: e?.message }, 'onTunnelActivated best-effort falló');
  }
}

/**
 * Túnel cerrado/expirado → borra la mangle de escaneo del workspace.
 * No-op si el workspace no tiene scan-IP.
 */
async function onTunnelClosed({ workspaceId, mikrotik }) {
  try {
    if (!mikrotik?.ip || !workspaceId) return;
    const scanIp = await scanIpRepo.resolveForWorkspace(workspaceId).catch(() => null);
    if (!scanIp) return; // sin Opción C no hay scan mangle que limpiar
    await scanMangle.teardown({ workspaceId, mikrotik });
    log.info({ workspaceId }, 'scan mangle removida al cerrar el túnel');
  } catch (e) {
    log.warn({ workspaceId, err: e?.message }, 'onTunnelClosed best-effort falló');
  }
}

module.exports = { onTunnelActivated, onTunnelClosed };
