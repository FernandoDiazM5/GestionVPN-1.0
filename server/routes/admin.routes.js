// ============================================================
//  Rutas del Administrador de plataforma (Sistemas) — /api/admin
//  Solo accesible con sesión platform_admin. Dashboard global +
//  alta/gestión de Moderadores (cada uno = OWNER de su workspace).
// ============================================================
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { query, withTransaction } = require('../db/mysql');
const { requireSession, requirePlatformAdmin } = require('../middleware/authJwt');
const workspaceRepo = require('../db/repos/workspaceRepo');

const router = express.Router();
router.use(requireSession, requirePlatformAdmin);

// ── GET /api/admin/summary — métricas globales para el Dashboard ──
router.get('/summary', asyncHandler(async (_req, res) => {
  const roles = (await query(
    `SELECT
       SUM(role='OWNER') AS moderadores,
       SUM(role='CO_MODERATOR') AS comoderadores,
       SUM(role='MEMBER') AS miembros,
       COUNT(*) AS total
     FROM workspace_members WHERE deleted_at IS NULL`
  ))[0] || {};
  const ws = (await query('SELECT COUNT(*) AS total FROM workspaces WHERE deleted_at IS NULL'))[0] || {};
  const usr = (await query('SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL'))[0] || {};
  const acts = (await query('SELECT COUNT(*) AS total FROM tunnel_logs WHERE created_at >= ?', [Date.now() - 86400000]))[0] || {};
  const recent = await query(
    `SELECT tl.action, tl.tunnel_id, tl.created_at, u.email AS user_email
       FROM tunnel_logs tl LEFT JOIN users u ON u.id = tl.user_id
      ORDER BY tl.created_at DESC LIMIT 10`
  );

  return sendOk(res, {
    summary: {
      workspaces: Number(ws.total || 0),
      usuarios: Number(usr.total || 0),
      moderadores: Number(roles.moderadores || 0),
      comoderadores: Number(roles.comoderadores || 0),
      miembros: Number(roles.miembros || 0),
      acciones_24h: Number(acts.total || 0),
    },
    recent,
  });
}));

// ── GET /api/admin/moderators — lista de moderadores (OWNERs) ──
router.get('/moderators', asyncHandler(async (_req, res) => {
  const moderators = await query(
    `SELECT u.id AS user_id, u.email, u.name, u.created_at, w.id AS workspace_id, w.name AS workspace_name,
            (SELECT COUNT(*) FROM workspace_members m2
              WHERE m2.workspace_id = w.id AND m2.deleted_at IS NULL AND m2.role <> 'OWNER') AS miembros
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.role = 'OWNER' AND wm.deleted_at IS NULL AND w.deleted_at IS NULL
        AND u.deleted_at IS NULL AND u.is_platform_admin = 0
      ORDER BY u.created_at DESC`
  );
  return sendOk(res, { moderators });
}));

// ── POST /api/admin/moderators — alta directa de un Moderador ──
const createSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  name: z.string().max(120).optional(),
  workspaceName: z.string().max(160).optional(),
});

router.post('/moderators', asyncHandler(async (req, res) => {
  const { email, password, name, workspaceName } = createSchema.parse(req.body);

  const existing = await query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1', [email]);
  if (existing.length) throw new AppError('Ese email ya está registrado', 409, 'EMAIL_TAKEN');

  const userId = crypto.randomUUID();
  const now = Date.now();
  const wsId = await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO users (id, email, password_hash, name, is_platform_admin, email_verified, created_at, updated_at)
       VALUES (?,?,?,?,0,1,?,?)`,
      [userId, email, await bcrypt.hash(password, 10), name || '', now, now]
    );
    const { workspaceId } = await workspaceRepo.createForOwner(tx, {
      ownerId: userId, name: workspaceName || `Espacio de ${name || email.split('@')[0]}`,
    });
    return workspaceId;
  });

  return sendOk(res, {
    moderator: { user_id: userId, email, name: name || '', workspace_id: wsId },
    message: 'Moderador creado',
  }, 201);
}));

module.exports = router;
