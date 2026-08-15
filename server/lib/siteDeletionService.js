const crypto = require('crypto');
const { query, withTransaction } = require('../db/mysql');
const log = require('./logger').child({ scope: 'site-deletion' });

const placeholders = values => values.map(() => '?').join(',');
const unique = values => [...new Set(values.filter(Boolean))];

async function loadImpact({ workspaceId, pppUser, vrfName = null, runQuery = query, lock = false }) {
  if (!workspaceId || (!pppUser && !vrfName)) return { node: null };
  const nodes = await runQuery(
    `SELECT id, workspace_id, nombre_nodo, ppp_user, nombre_vrf
       FROM nodes
      WHERE workspace_id = ? AND (ppp_user = ? OR (? IS NOT NULL AND nombre_vrf = ?))
      ORDER BY (ppp_user = ?) DESC, id ASC${lock ? ' FOR UPDATE' : ''}`,
    [workspaceId, pppUser || null, vrfName, vrfName, pppUser || null],
  );
  if (!nodes.length) return { node: null };

  const node = nodes[0];
  const nodeIds = nodes.map(row => row.id);
  const nodePh = placeholders(nodeIds);
  const aps = await runQuery(
    `SELECT a.id, a.uuid FROM aps a
       JOIN ap_groups g ON g.id = a.ap_group_id
      WHERE g.workspace_id = ? AND a.node_id IN (${nodePh})`, // nosemgrep: placeholders only
    [workspaceId, ...nodeIds],
  );
  const apIds = aps.map(row => row.id);
  let cpes = 0;
  let snapshots = 0;
  let signalHistory = 0;
  if (apIds.length) {
    const apPh = placeholders(apIds);
    cpes = Number((await runQuery(`SELECT COUNT(*) AS n FROM cpes WHERE ap_id IN (${apPh})`, apIds))[0]?.n || 0); // nosemgrep: placeholders only
    snapshots = Number((await runQuery(`SELECT COUNT(*) AS n FROM ap_status_snapshots WHERE ap_id IN (${apPh})`, apIds))[0]?.n || 0); // nosemgrep: placeholders only
    signalHistory = Number((await runQuery(`SELECT COUNT(*) AS n FROM signal_history WHERE ap_id IN (${apPh})`, apIds))[0]?.n || 0); // nosemgrep: placeholders only
  }
  const ambiguousRows = await runQuery(
    `SELECT COUNT(*) AS n FROM aps a
       JOIN ap_groups g ON g.id = a.ap_group_id
      WHERE g.workspace_id = ? AND a.node_id IS NULL AND a.nombre_nodo = ?`,
    [workspaceId, node.nombre_nodo || ''],
  );
  const tunnelIds = unique([pppUser, vrfName, node.ppp_user, node.nombre_vrf]);
  let activeSessions = 0;
  let assignments = 0;
  let pendingInvitations = 0;
  if (tunnelIds.length) {
    const tunnelPh = placeholders(tunnelIds);
    activeSessions = Number((await runQuery(
      `SELECT COUNT(*) AS n FROM tunnel_user_sessions WHERE workspace_id = ? AND status = 'ACTIVE'
        AND (tunnel_id IN (${tunnelPh}) OR vrf_name IN (${tunnelPh}))`, // nosemgrep: placeholders only
      [workspaceId, ...tunnelIds, ...tunnelIds],
    ))[0]?.n || 0);
    assignments = Number((await runQuery(
      `SELECT COUNT(*) AS n FROM tunnel_assignments WHERE workspace_id = ? AND tunnel_id IN (${tunnelPh})`, // nosemgrep: placeholders only
      [workspaceId, ...tunnelIds],
    ))[0]?.n || 0);
    pendingInvitations = Number((await runQuery(
      `SELECT COUNT(*) AS n FROM invitations WHERE workspace_id = ? AND status = 'PENDING' AND tunnel_id IN (${tunnelPh})`, // nosemgrep: placeholders only
      [workspaceId, ...tunnelIds],
    ))[0]?.n || 0);
  }
  const towerRows = await runQuery(
    `SELECT COUNT(*) AS n FROM torres WHERE node_id IN (${nodePh})`, // nosemgrep: placeholders only
    nodeIds,
  );
  const impactData = {
    nodeIds,
    apIds: apIds.slice().sort((a, b) => a - b),
    cpes,
    snapshots,
    signalHistory,
    towers: Number(towerRows[0]?.n || 0),
    activeSessions,
    assignments,
    pendingInvitations,
    ambiguousDevices: Number(ambiguousRows[0]?.n || 0),
  };
  return {
    node,
    nodeRows: nodeIds.length,
    devices: aps.length,
    deviceIds: aps.map(row => row.uuid),
    ...impactData,
    fingerprint: crypto.createHash('sha256').update(JSON.stringify(impactData)).digest('hex'),
    _nodeIds: nodeIds,
    _apIds: apIds,
    _tunnelIds: tunnelIds,
  };
}

function publicImpact(impact) {
  if (!impact?.node) return { node: null };
  const { _nodeIds, _apIds, _tunnelIds, ...safe } = impact;
  return safe;
}

async function deleteSiteData({ workspaceId, pppUser, vrfName, expectedFingerprint, actorUserId }) {
  return withTransaction(async tx => {
    const runQuery = tx.query;
    const impact = await loadImpact({ workspaceId, pppUser, vrfName, runQuery, lock: true });
    if (!impact.node) return null;
    if (impact.ambiguousDevices > 0) {
      const error = new Error('Hay equipos guardados sin relación exacta con el sitio');
      error.code = 'SITE_HAS_AMBIGUOUS_DEVICES';
      error.details = { ambiguousDevices: impact.ambiguousDevices };
      throw error;
    }
    if (!expectedFingerprint || impact.fingerprint !== expectedFingerprint) {
      const error = new Error('El contenido del sitio cambió; revisa el impacto nuevamente');
      error.code = 'DELETION_IMPACT_CHANGED';
      throw error;
    }

    if (impact._apIds.length) {
      const apPh = placeholders(impact._apIds);
      await runQuery(`DELETE FROM cpes WHERE ap_id IN (${apPh})`, impact._apIds); // nosemgrep: placeholders only
      await runQuery(`DELETE FROM aps WHERE id IN (${apPh})`, impact._apIds); // nosemgrep: placeholders only
    }
    await runQuery(
      `DELETE g FROM ap_groups g
        LEFT JOIN aps a ON a.ap_group_id = g.id
       WHERE g.workspace_id = ? AND a.id IS NULL`,
      [workspaceId],
    );
    if (impact._tunnelIds.length) {
      const tunnelPh = placeholders(impact._tunnelIds);
      await runQuery(
        `UPDATE tunnel_user_sessions SET status = 'CLOSED', deactivated_at = ?
          WHERE workspace_id = ? AND status = 'ACTIVE'
            AND (tunnel_id IN (${tunnelPh}) OR vrf_name IN (${tunnelPh}))`, // nosemgrep: placeholders only
        [Date.now(), workspaceId, ...impact._tunnelIds, ...impact._tunnelIds],
      );
      await runQuery(
        `DELETE FROM tunnel_assignments WHERE workspace_id = ? AND tunnel_id IN (${tunnelPh})`, // nosemgrep: placeholders only
        [workspaceId, ...impact._tunnelIds],
      );
      await runQuery(
        `UPDATE invitations SET status = 'REVOKED'
          WHERE workspace_id = ? AND status = 'PENDING' AND tunnel_id IN (${tunnelPh})`, // nosemgrep: placeholders only
        [workspaceId, ...impact._tunnelIds],
      );
      await runQuery(
        `DELETE FROM monitoring_state
          WHERE workspace_id = ? AND target_kind = 'node' AND target_id IN (${tunnelPh})`, // nosemgrep: placeholders only
        [workspaceId, ...impact._tunnelIds],
      );
    }
    const nodePh = placeholders(impact._nodeIds);
    await runQuery(`DELETE FROM torres WHERE node_id IN (${nodePh})`, impact._nodeIds); // nosemgrep: placeholders only
    await runQuery(`DELETE FROM nodes WHERE id IN (${nodePh})`, impact._nodeIds); // nosemgrep: placeholders only
    await runQuery(
      `INSERT INTO tunnel_logs (id, workspace_id, tunnel_id, user_id, action, ip_address, detail, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), workspaceId, impact.node.nombre_vrf || impact.node.ppp_user, actorUserId || null,
        'SITE_DELETE', null, JSON.stringify({
          site: impact.node.nombre_nodo,
          devices: impact.devices,
          cpes: impact.cpes,
          snapshots: impact.snapshots,
          signalHistory: impact.signalHistory,
          towers: impact.towers,
        }), Date.now()],
    );
    log.info({ workspaceId, nodeId: impact.node.id, devices: impact.devices, cpes: impact.cpes }, 'Sitio eliminado con sus equipos');
    return publicImpact(impact);
  });
}

module.exports = { loadImpact, publicImpact, deleteSiteData };
