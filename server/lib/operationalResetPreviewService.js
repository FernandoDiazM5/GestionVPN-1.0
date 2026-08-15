const { query } = require('../db/mysql');

const count = row => Number(row?.total || 0);

async function loadOperationalResetPreview(runQuery = query) {
  const [
    nodes, nodeSsh, nodeTags, nodeHistory, towers, towerEndpoints,
    aps, apSnapshots, cpes, signalHistory, activeSessions, assignments,
    pendingInvitations, monitoringNodes, orphanTowers, orphanAps,
    workspaces, nonAdminUsers, platformAdmins, settings, auditLogs,
  ] = await Promise.all([
    runQuery('SELECT COUNT(*) AS total FROM nodes'),
    runQuery('SELECT COUNT(*) AS total FROM node_ssh_creds'),
    runQuery('SELECT COUNT(*) AS total FROM node_tags'),
    runQuery('SELECT COUNT(*) AS total FROM node_history'),
    runQuery('SELECT COUNT(*) AS total FROM torres WHERE node_id IS NOT NULL'),
    runQuery('SELECT COUNT(*) AS total FROM torre_ptp_endpoints'),
    runQuery('SELECT COUNT(*) AS total FROM aps'),
    runQuery('SELECT COUNT(*) AS total FROM ap_status_snapshots'),
    runQuery('SELECT COUNT(*) AS total FROM cpes'),
    runQuery('SELECT COUNT(*) AS total FROM signal_history'),
    runQuery("SELECT COUNT(*) AS total FROM tunnel_user_sessions WHERE status = 'ACTIVE'"),
    runQuery('SELECT COUNT(*) AS total FROM tunnel_assignments'),
    runQuery("SELECT COUNT(*) AS total FROM invitations WHERE status = 'PENDING' AND tunnel_id IS NOT NULL"),
    runQuery("SELECT COUNT(*) AS total FROM monitoring_state WHERE target_kind = 'node'"),
    runQuery('SELECT COUNT(*) AS total FROM torres WHERE node_id IS NULL'),
    runQuery('SELECT COUNT(*) AS total FROM aps WHERE node_id IS NULL'),
    runQuery('SELECT COUNT(*) AS total FROM workspaces WHERE deleted_at IS NULL'),
    runQuery('SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL AND is_platform_admin = 0'),
    runQuery('SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL AND is_platform_admin = 1'),
    runQuery('SELECT COUNT(*) AS total FROM app_settings'),
    runQuery('SELECT (SELECT COUNT(*) FROM tunnel_logs) + (SELECT COUNT(*) FROM tunnel_session_logs) + (SELECT COUNT(*) FROM platform_security_audit) AS total'),
  ]);

  const operational = {
    nodes: count(nodes[0]),
    nodeSshCredentials: count(nodeSsh[0]),
    nodeTags: count(nodeTags[0]),
    nodeHistory: count(nodeHistory[0]),
    towers: count(towers[0]),
    towerEndpoints: count(towerEndpoints[0]),
    accessPoints: count(aps[0]),
    accessPointSnapshots: count(apSnapshots[0]),
    cpes: count(cpes[0]),
    signalHistory: count(signalHistory[0]),
    activeSessions: count(activeSessions[0]),
    tunnelAssignments: count(assignments[0]),
    pendingTunnelInvitations: count(pendingInvitations[0]),
    monitoringTargets: count(monitoringNodes[0]),
  };
  const review = {
    towersWithoutNode: count(orphanTowers[0]),
    accessPointsWithoutNode: count(orphanAps[0]),
    nonAdminUsers: count(nonAdminUsers[0]),
    workspaces: count(workspaces[0]),
  };
  const preserved = {
    platformAdmins: count(platformAdmins[0]),
    administrationSettings: count(settings[0]),
    auditRecords: count(auditLogs[0]),
  };
  const operationalTotal = Object.values(operational).reduce((sum, value) => sum + value, 0);
  const ambiguousTotal = review.towersWithoutNode + review.accessPointsWithoutNode;

  return {
    readOnly: true,
    clean: operationalTotal === 0 && ambiguousTotal === 0,
    canExecuteReset: false,
    operationalTotal,
    ambiguousTotal,
    operational,
    review,
    preserved,
    blockers: [
      ...(ambiguousTotal ? ['Existen equipos o torres sin relación exacta con un sitio'] : []),
      ...(preserved.platformAdmins !== 1 ? ['Debe existir exactamente un Administrador de plataforma activo'] : []),
      ...(review.workspaces || review.nonAdminUsers
        ? ['Falta confirmar el tratamiento de workspaces y usuarios no administradores'] : []),
    ],
  };
}

module.exports = { loadOperationalResetPreview };
