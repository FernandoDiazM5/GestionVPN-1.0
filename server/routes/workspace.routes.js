// ============================================================
//  Rutas del workspace propio (Fase C) — base /api/workspace
//
//  Endpoints:
//   • PATCH /name        — renombra el workspace (OWNER)
//   • GET   /export      — descarga JSON versionado (OWNER)
//   • POST  /import      — importa workspace con dryRun/apply (OWNER)
//
//  Decisiones:
//   • Solo OWNER manipula la configuración del workspace
//   • Export: incluye creds cifradas tal cual están en BD (AES-256-GCM con
//     `.db_secret`). El destinatario debe tener el MISMO secret para
//     descifrarlas. Esto cierra la cadena de custodia: secretos jamás viajan
//     en claro y la restauración cross-instalación se decide intencionalmente.
//   • Import: política de conflictos en BD = skip|overwrite. Provisión MikroTik
//     queda como "best-effort": si el router está caído, los registros quedan
//     en BD y el operador puede reintentar con un import idempotente.
// ============================================================
const express = require('express');
const {
  WorkspaceRenameRequestSchema,
  ImportRequestSchema,
  EXPORT_VERSION,
} = require('@gestionvpn/contracts');

const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { query, withTransaction } = require('../db/mysql');
const { requireSession, requireRole } = require('../middleware/authJwt');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
//  PATCH /name — renombrar el workspace
// ──────────────────────────────────────────────────────────────
const renameSchema = WorkspaceRenameRequestSchema;

router.patch('/name', requireSession, requireRole('OWNER'),
  asyncHandler(async (req, res) => {
    const { name } = renameSchema.parse(req.body);
    const wsId = req.account.workspace_id;
    await query(
      'UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?',
      [name.trim(), Date.now(), wsId]
    );
    return sendOk(res, { message: 'Workspace actualizado', name: name.trim() });
  }));

// ──────────────────────────────────────────────────────────────
//  GET /export — descarga JSON del workspace
// ──────────────────────────────────────────────────────────────
router.get('/export', requireSession, requireRole('OWNER'),
  asyncHandler(async (req, res) => {
    const wsId = req.account.workspace_id;

    const ws = (await query('SELECT id, name, created_at FROM workspaces WHERE id = ?', [wsId]))[0];
    if (!ws) throw new AppError('Workspace no encontrado', 404, 'NOT_FOUND');

    const members = await query(
      `SELECT u.email, u.name, u.disabled_at, wm.role, wm.created_at
         FROM workspace_members wm
         JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ? AND wm.deleted_at IS NULL AND u.deleted_at IS NULL
        ORDER BY wm.created_at ASC`,
      [wsId]
    );

    // Nodos del workspace + sus credenciales SSH cifradas
    const nodes = await query(
      `SELECT id, ppp_user, mikrotik_id, nombre_nodo, nombre_vrf, iface_name,
              segmento_lan, ip_tunnel, ppp_password_enc, label, server_ip,
              wg_public_key, lan_subnets, protocol, node_number, created_at, updated_at
         FROM nodes WHERE workspace_id = ?`,
      [wsId]
    );
    const nodeIds = nodes.map(n => n.id);
    const sshCreds = nodeIds.length
      ? await query(
          `SELECT node_id, ssh_user, ssh_pass_enc, ssh_port, priority, created_at
             FROM node_ssh_creds WHERE node_id IN (${nodeIds.map(() => '?').join(',')})`,
          nodeIds
        )
      : [];

    // WireGuard por miembro (incluye config_enc — útil para re-mostrar el .conf)
    const memberWg = await query(
      `SELECT u.email AS user_email, mw.peer_name, mw.allowed_ip, mw.public_key,
              mw.server_public_key, mw.endpoint, mw.config_enc, mw.created_at
         FROM member_wireguard mw
         JOIN users u ON u.id = mw.user_id
        WHERE mw.workspace_id = ?`,
      [wsId]
    );

    // Peers de gestión atribuidos al workspace
    const mgmtPeers = await query(
      `SELECT public_key, allowed_address, comment, created_at
         FROM mgmt_peer_owners WHERE workspace_id = ?`,
      [wsId]
    );

    // AP groups + APs + CPEs (telemetría queda fuera por tamaño)
    const apGroups = await query(
      `SELECT id, uuid, nombre, descripcion, ubicacion, created_at
         FROM ap_groups WHERE workspace_id = ?`,
      [wsId]
    );
    const groupIds = apGroups.map(g => g.id);
    const aps = groupIds.length
      ? await query(
          `SELECT id, uuid, ap_group_id, hostname, modelo, firmware, mac_lan, mac_wlan,
                  ip, frecuencia_mhz, ssid, canal_mhz, tx_power, modo_red,
                  usuario_ssh, clave_ssh_enc, puerto_ssh, wifi_password_enc, router_port,
                  nombre_nodo, is_active, last_seen
             FROM aps WHERE ap_group_id IN (${groupIds.map(() => '?').join(',')})`,
          groupIds
        )
      : [];

    const payload = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      workspace: { id: ws.id, name: ws.name, created_at: ws.created_at },
      members: members.map(m => ({
        email: m.email, name: m.name, role: m.role,
        disabled: !!m.disabled_at, joined_at: Number(m.created_at),
      })),
      tunnels: nodes.map(n => ({
        ...n,
        ssh_creds: sshCreds.filter(s => s.node_id === n.id),
      })),
      member_wireguard: memberWg,
      mgmt_peer_owners: mgmtPeers,
      ap_groups: apGroups.map(g => ({
        ...g,
        aps: aps.filter(a => a.ap_group_id === g.id),
      })),
    };

    const filename = `workspace-${ws.name.replace(/[^\w-]+/g, '_')}-${Date.now()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify(payload, null, 2));
  }));

// ──────────────────────────────────────────────────────────────
//  POST /import — importa un JSON (dryRun + apply)
// ──────────────────────────────────────────────────────────────
const importSchema = ImportRequestSchema;

router.post('/import', requireSession, requireRole('OWNER'),
  asyncHandler(async (req, res) => {
    const parsed = importSchema.parse(req.body);
    const { payload, conflict, dryRun } = parsed;
    const wsId = req.account.workspace_id;

    if (!payload.version || !payload.version.startsWith('1.')) {
      throw new AppError(`Versión del export no soportada: ${payload.version}`, 400, 'BAD_VERSION');
    }

    // ── PLAN: comparar payload con estado actual ────────────────
    const plan = {
      members: { create: [], update: [], skip: [] },
      tunnels: { create: [], update: [], skip: [] },
      ap_groups: { create: [], update: [], skip: [] },
    };

    if (payload.tunnels?.length) {
      const existing = await query(
        'SELECT ppp_user FROM nodes WHERE workspace_id = ?',
        [wsId]
      );
      const existingSet = new Set(existing.map(r => r.ppp_user));
      for (const t of payload.tunnels) {
        if (existingSet.has(t.ppp_user)) {
          (conflict === 'overwrite' ? plan.tunnels.update : plan.tunnels.skip).push(t.ppp_user);
        } else {
          plan.tunnels.create.push(t.ppp_user);
        }
      }
    }

    if (payload.ap_groups?.length) {
      const existing = await query(
        'SELECT uuid FROM ap_groups WHERE workspace_id = ?',
        [wsId]
      );
      const existingSet = new Set(existing.map(r => r.uuid));
      for (const g of payload.ap_groups) {
        if (existingSet.has(g.uuid)) {
          (conflict === 'overwrite' ? plan.ap_groups.update : plan.ap_groups.skip).push(g.nombre);
        } else {
          plan.ap_groups.create.push(g.nombre);
        }
      }
    }

    if (payload.members?.length) {
      const existing = await query(
        `SELECT u.email FROM workspace_members wm JOIN users u ON u.id = wm.user_id
          WHERE wm.workspace_id = ? AND wm.deleted_at IS NULL`, [wsId]
      );
      const existingSet = new Set(existing.map(r => r.email));
      for (const m of payload.members) {
        if (m.role === 'OWNER') continue; // OWNER no se importa (es el ws actual)
        if (existingSet.has(m.email)) plan.members.skip.push(m.email);
        else plan.members.create.push(m.email);
      }
    }

    if (dryRun) {
      return sendOk(res, {
        message: 'Plan calculado (no aplicado)',
        version: payload.version,
        conflict,
        plan,
      });
    }

    // ── APPLY: persistir cambios en BD dentro de transacción ────
    //  El provisioning en MikroTik queda fuera de la transacción (best-effort).
    //  Estrategia: prevalece la BD; el operador puede re-sincronizar desde la UI.
    const now = Date.now();
    const inserts = { tunnels: 0, ap_groups: 0 };
    const updates = { tunnels: 0, ap_groups: 0 };

    await withTransaction(async (tx) => {
      // Tunnels
      if (payload.tunnels?.length) {
        for (const t of payload.tunnels) {
          const exists = (await tx.query(
            'SELECT id FROM nodes WHERE workspace_id = ? AND ppp_user = ? LIMIT 1',
            [wsId, t.ppp_user]
          ))[0];
          if (exists && conflict === 'skip') continue;
          if (exists) {
            await tx.query(
              `UPDATE nodes SET nombre_nodo=?, nombre_vrf=?, iface_name=?, segmento_lan=?,
                                ip_tunnel=?, ppp_password_enc=?, label=?, server_ip=?,
                                lan_subnets=?, protocol=?, updated_at=?
                 WHERE id = ?`,
              [t.nombre_nodo || '', t.nombre_vrf || '', t.iface_name || '', t.segmento_lan || '',
               t.ip_tunnel || '', t.ppp_password_enc || null, t.label || '', t.server_ip || '',
               t.lan_subnets || '[]', t.protocol || 'sstp', now, exists.id]
            );
            updates.tunnels++;
          } else {
            await tx.query(
              `INSERT INTO nodes (ppp_user, mikrotik_id, nombre_nodo, nombre_vrf, iface_name,
                                  segmento_lan, ip_tunnel, ppp_password_enc, label, server_ip,
                                  lan_subnets, protocol, workspace_id, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [t.ppp_user, t.mikrotik_id || '', t.nombre_nodo || '', t.nombre_vrf || '',
               t.iface_name || '', t.segmento_lan || '', t.ip_tunnel || '', t.ppp_password_enc || null,
               t.label || '', t.server_ip || '', t.lan_subnets || '[]', t.protocol || 'sstp',
               wsId, now, now]
            );
            inserts.tunnels++;
          }
        }
      }

      // AP groups
      if (payload.ap_groups?.length) {
        for (const g of payload.ap_groups) {
          const exists = (await tx.query(
            'SELECT id FROM ap_groups WHERE workspace_id = ? AND uuid = ? LIMIT 1',
            [wsId, g.uuid]
          ))[0];
          if (exists && conflict === 'skip') continue;
          if (exists) {
            await tx.query(
              'UPDATE ap_groups SET nombre=?, descripcion=?, ubicacion=?, updated_at=? WHERE id = ?',
              [g.nombre, g.descripcion || '', g.ubicacion || '', now, exists.id]
            );
            updates.ap_groups++;
          } else {
            await tx.query(
              `INSERT INTO ap_groups (uuid, nombre, descripcion, ubicacion, workspace_id, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?)`,
              [g.uuid, g.nombre, g.descripcion || '', g.ubicacion || '', wsId, now, now]
            );
            inserts.ap_groups++;
          }
        }
      }
    });

    return sendOk(res, {
      message: 'Importación aplicada',
      version: payload.version,
      conflict,
      inserts,
      updates,
    });
  }));

module.exports = router;
