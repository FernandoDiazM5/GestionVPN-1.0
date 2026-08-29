const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { query } = require('../db/mysql');
const { AppError } = require('./apiResponse');

const KEY = 'MIKROWISP';
const MAX_BYTES = 5 * 1024 * 1024;
const STORAGE_ROOT = path.resolve(process.env.INTEGRATION_GUIDE_DIR || path.join(__dirname, '..', 'uploads', 'integration-guides'));

function publicRow(row) {
  if (!row) return null;
  return { key: row.integration_key, title: row.title, version: row.version_label, fileName: row.file_name, fileSize: Number(row.file_size), active: Boolean(row.active), updatedAt: Number(row.updated_at) };
}
function assertPdf(file) {
  if (!file?.buffer || file.size < 8 || file.size > MAX_BYTES || file.mimetype !== 'application/pdf') throw new AppError('Selecciona un PDF válido de máximo 5 MB', 422, 'INTEGRATION_GUIDE_PDF_INVALID');
  const header = file.buffer.subarray(0, 5).toString('ascii');
  const tail = file.buffer.subarray(Math.max(0, file.buffer.length - 2048)).toString('latin1');
  if (header !== '%PDF-' || !tail.includes('%%EOF')) throw new AppError('El archivo no contiene un PDF válido', 422, 'INTEGRATION_GUIDE_PDF_INVALID');
}
async function get(activeOnly = false) {
  const rows = await query(`SELECT * FROM integration_guides WHERE integration_key=?${activeOnly ? ' AND active=1' : ''} LIMIT 1`, [KEY]);
  return rows[0] || null;
}
async function save({ userId, title, version, file }) {
  assertPdf(file);
  const safeTitle = String(title || '').trim().slice(0, 255);
  const safeVersion = String(version || '').trim().slice(0, 64);
  if (!safeTitle || !safeVersion) throw new AppError('Título y versión son obligatorios', 422, 'INTEGRATION_GUIDE_FIELDS_REQUIRED');
  fs.mkdirSync(STORAGE_ROOT, { recursive: true, mode: 0o750 });
  const storedName = `${crypto.randomUUID()}.pdf`;
  const target = path.join(STORAGE_ROOT, storedName);
  fs.writeFileSync(target, file.buffer, { mode: 0o640, flag: 'wx' });
  const previous = await get(false);
  const now = Date.now();
  try {
    await query(`INSERT INTO integration_guides (integration_key,title,version_label,file_name,storage_path,file_size,active,configured_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),version_label=VALUES(version_label),file_name=VALUES(file_name),storage_path=VALUES(storage_path),file_size=VALUES(file_size),active=1,configured_by=VALUES(configured_by),updated_at=VALUES(updated_at)`,
    [KEY, safeTitle, safeVersion, String(file.originalname || 'guia.pdf').slice(0, 255), target, file.size, userId, now, now]);
  } catch (error) { try { fs.unlinkSync(target); } catch (_) { /* best effort */ } throw error; }
  if (previous?.storage_path && previous.storage_path !== target && path.resolve(previous.storage_path).startsWith(`${STORAGE_ROOT}${path.sep}`)) try { fs.unlinkSync(previous.storage_path); } catch (_) { /* best effort */ }
  return publicRow(await get(false));
}
async function setActive(active) {
  const result = await query('UPDATE integration_guides SET active=?,updated_at=? WHERE integration_key=?', [active ? 1 : 0, Date.now(), KEY]);
  if (!result.affectedRows) throw new AppError('No hay una guía configurada', 404, 'INTEGRATION_GUIDE_NOT_FOUND');
  return publicRow(await get(false));
}
async function download() {
  const row = await get(true);
  if (!row) throw new AppError('No hay una guía activa', 404, 'INTEGRATION_GUIDE_NOT_FOUND');
  const resolved = path.resolve(row.storage_path);
  if (!resolved.startsWith(`${STORAGE_ROOT}${path.sep}`) || !fs.existsSync(resolved)) throw new AppError('El archivo de la guía no está disponible', 404, 'INTEGRATION_GUIDE_FILE_MISSING');
  return { row, path: resolved };
}

module.exports = { KEY, MAX_BYTES, STORAGE_ROOT, publicRow, assertPdf, get, save, setActive, download };
