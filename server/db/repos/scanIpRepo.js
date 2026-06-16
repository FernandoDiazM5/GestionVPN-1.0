// ============================================================
//  scanIpRepo.js — Opción C: IP de origen del VPS por workspace.
//  Fuente de verdad para el src-address de la mangle de ESCANEO
//  y para el localAddress del SSH/HTTP del escaneo.
//  ⚠️ La IP NUNCA se toma del request del cliente — siempre de aquí.
//
//  Pool por defecto: 192.168.21.200 .. 192.168.21.230 (1 por moderador).
//  Configurable por env: SCAN_IP_POOL_BASE / _START / _END.
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');

const POOL_BASE  = process.env.SCAN_IP_POOL_BASE  || '192.168.21.';
const POOL_START = Number(process.env.SCAN_IP_POOL_START || 200);
const POOL_END   = Number(process.env.SCAN_IP_POOL_END   || 230);

/**
 * Devuelve la scan-IP (ej. "192.168.21.205") del workspace, o null si no tiene
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

module.exports = { getScanIpForWorkspace, getByWorkspace, upsert, allocate, list, POOL_BASE, POOL_START, POOL_END };
