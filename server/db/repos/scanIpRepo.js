// ============================================================
//  scanIpRepo.js — Opción C: IP de origen del VPS por workspace.
//  Fuente de verdad para el src-address de la mangle de ESCANEO
//  y para el localAddress del SSH/HTTP del escaneo.
//  ⚠️ La IP NUNCA se toma del request del cliente — siempre de aquí.
//
//  Pool por defecto: 10.11.252.2 .. 10.11.252.254 (1 por workspace).
//  /24 DEDICADO, separado de la gestión por nodo (10.11.250/251).
//  Configurable por env: SCAN_IP_POOL_BASE / _START / _END.
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');

const POOL_BASE  = process.env.SCAN_IP_POOL_BASE  || '10.11.252.';
const POOL_START = Number(process.env.SCAN_IP_POOL_START || 2);
const POOL_END   = Number(process.env.SCAN_IP_POOL_END   || 254);

/**
 * Devuelve la scan-IP (ej. "10.11.252.5") del workspace, o null si no tiene
 * una asignada. Sin asignación → el escaneo cae al comportamiento legacy
 * (sin localAddress ni mangle), útil en desarrollo local donde el backend
 * ES la máquina del moderador.
 */
async function getScanIpForWorkspace(workspaceId) {
  const rows = await query(
    'SELECT scan_ip FROM workspace_scan_ip WHERE workspace_id = ? LIMIT 1',
    [workspaceId]
  );
  return rows[0] ? rows[0].scan_ip : null;
}

/** Registro completo (diagnósticos). */
async function getByWorkspace(workspaceId) {
  const rows = await query(
    'SELECT * FROM workspace_scan_ip WHERE workspace_id = ? LIMIT 1',
    [workspaceId]
  );
  return rows[0] || null;
}

/**
 * Crea/actualiza el mapeo workspace→scan-IP. Idempotente por workspace.
 * Lanza si la IP ya pertenece a OTRO workspace (uq_wsi_ip) → contención.
 */
async function upsert({ workspaceId, scanIp }) {
  const ip = String(scanIp || '').split('/')[0].trim();
  if (!workspaceId) throw new Error('workspaceId requerido');
  if (!ip) throw new Error('scanIp requerido');
  const now = Date.now();
  await query(
    `INSERT INTO workspace_scan_ip (id, workspace_id, scan_ip, created_at, updated_at)
     VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE scan_ip = VALUES(scan_ip), updated_at = VALUES(updated_at)`,
    [crypto.randomUUID(), workspaceId, ip, now, now]
  );
  return ip;
}

/**
 * Asigna al workspace la siguiente scan-IP libre del pool (idempotente: si ya
 * tiene una, la devuelve). Lanza si el pool está agotado.
 */
async function allocate(workspaceId) {
  const existing = await getScanIpForWorkspace(workspaceId);
  if (existing) return existing;

  const used = new Set(
    (await query('SELECT scan_ip FROM workspace_scan_ip')).map(r => r.scan_ip)
  );
  for (let i = POOL_START; i <= POOL_END; i++) {
    const candidate = `${POOL_BASE}${i}`;
    if (!used.has(candidate)) {
      await upsert({ workspaceId, scanIp: candidate });
      return candidate;
    }
  }
  throw new Error(`Pool de scan-IPs agotado (${POOL_BASE}${POOL_START}-${POOL_END})`);
}

/** Lista el mapeo completo (admin). */
async function list() {
  return query(
    `SELECT wsi.workspace_id, wsi.scan_ip, w.name AS workspace_name
       FROM workspace_scan_ip wsi
       LEFT JOIN workspaces w ON w.id = wsi.workspace_id
      ORDER BY wsi.scan_ip`
  );
}

/** Lee una clave de app_settings (string | null). */
async function getSetting(key) {
  const rows = await query('SELECT value FROM app_settings WHERE `key` = ? LIMIT 1', [key]);
  return rows[0] ? rows[0].value : null;
}

/**
 * Resuelve la scan-IP EFECTIVA según el modo global de escaneo
 * (app_settings.scan_mode, conmutable por el Administrador desde el panel):
 *
 *  • 'local' → usa una sola IP global `local_scan_ip` = la IP WG de gestión de
 *    ESTA máquina. Para el caso "1 box hace todo" (backend corre en el equipo
 *    del moderador): el escaneo origina desde su propia IP y la mangle la marca
 *    a su VRF. No requiere pool ni asignación por workspace.
 *
 *  • 'vps' (default, multi-tenant) → usa la scan-IP del POOL asignada por
 *    workspace (10.11.252.x). Cada workspace tiene la suya → co-moderadores
 *    escanean en paralelo sin colisión.
 *
 * Devuelve null si no hay IP resoluble → el escaneo cae a modo legacy.
 */
async function resolveForWorkspace(workspaceId) {
  const mode = (await getSetting('scan_mode')) || 'vps';
  if (mode === 'local') {
    const ip = String((await getSetting('local_scan_ip')) || '').split('/')[0].trim();
    return ip || null;
  }
  return getScanIpForWorkspace(workspaceId);
}

module.exports = { getScanIpForWorkspace, getByWorkspace, upsert, allocate, list, resolveForWorkspace, getSetting, POOL_BASE, POOL_START, POOL_END };
