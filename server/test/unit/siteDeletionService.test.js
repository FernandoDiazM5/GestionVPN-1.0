const { stubModule } = require('../helpers/moduleMock');

const statements = [];
let ambiguous = 0;
let apRows = [{ id: 11, uuid: 'ap-11' }, { id: 12, uuid: 'ap-12' }];

async function runQuery(sql, params = []) {
  statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
  if (/SELECT id, workspace_id, nombre_nodo/.test(sql)) {
    return [{ id: 7, workspace_id: 'ws-1', nombre_nodo: 'Sitio Uno', ppp_user: 'PPP-1', nombre_vrf: 'VRF-1' }];
  }
  if (/SELECT a\.id, a\.uuid FROM aps/.test(sql)) return apRows;
  if (/COUNT\(\*\) AS n FROM cpes/.test(sql)) return [{ n: 4 }];
  if (/COUNT\(\*\) AS n FROM ap_status_snapshots/.test(sql)) return [{ n: 2 }];
  if (/COUNT\(\*\) AS n FROM signal_history/.test(sql)) return [{ n: 9 }];
  if (/a\.node_id IS NULL/.test(sql)) return [{ n: ambiguous }];
  if (/COUNT\(\*\) AS n FROM tunnel_user_sessions/.test(sql)) return [{ n: 1 }];
  if (/COUNT\(\*\) AS n FROM tunnel_assignments/.test(sql)) return [{ n: 2 }];
  if (/COUNT\(\*\) AS n FROM invitations/.test(sql)) return [{ n: 1 }];
  if (/COUNT\(\*\) AS n FROM torres/.test(sql)) return [{ n: 1 }];
  return { affectedRows: 1 };
}

stubModule(__dirname, '../../db/mysql', {
  query: runQuery,
  withTransaction: async fn => fn({ query: runQuery }),
});
stubModule(__dirname, '../../lib/logger', {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
});

const { loadImpact, publicImpact, deleteSiteData } = require('../../lib/siteDeletionService');

beforeEach(() => {
  statements.length = 0;
  ambiguous = 0;
  apRows = [{ id: 11, uuid: 'ap-11' }, { id: 12, uuid: 'ap-12' }];
});

describe('siteDeletionService', () => {
  it('calcula impacto aislado por workspace y no expone IDs internos', async () => {
    const impact = await loadImpact({ workspaceId: 'ws-1', pppUser: 'PPP-1', vrfName: 'VRF-1', runQuery });
    expect(publicImpact(impact)).toMatchObject({
      node: { workspace_id: 'ws-1', nombre_nodo: 'Sitio Uno' },
      devices: 2,
      deviceIds: ['ap-11', 'ap-12'],
      cpes: 4,
      snapshots: 2,
      signalHistory: 9,
      activeSessions: 1,
      assignments: 2,
      pendingInvitations: 1,
      ambiguousDevices: 0,
    });
    expect(publicImpact(impact)).not.toHaveProperty('_nodeIds');
    expect(statements.find(s => /FROM nodes/.test(s.sql)).params[0]).toBe('ws-1');
  });

  it('elimina CPE antes de AP, cierra sesiones y conserva auditoría resumida', async () => {
    const impact = await loadImpact({ workspaceId: 'ws-1', pppUser: 'PPP-1', vrfName: 'VRF-1', runQuery });
    statements.length = 0;
    const result = await deleteSiteData({
      workspaceId: 'ws-1', pppUser: 'PPP-1', vrfName: 'VRF-1',
      expectedFingerprint: impact.fingerprint, actorUserId: 'owner-1',
    });
    expect(result.deviceIds).toEqual(['ap-11', 'ap-12']);
    const cpeDelete = statements.findIndex(s => /^DELETE FROM cpes/.test(s.sql));
    const apDelete = statements.findIndex(s => /^DELETE FROM aps/.test(s.sql));
    const nodeDelete = statements.findIndex(s => /^DELETE FROM nodes/.test(s.sql));
    expect(cpeDelete).toBeGreaterThan(-1);
    expect(apDelete).toBeGreaterThan(cpeDelete);
    expect(nodeDelete).toBeGreaterThan(apDelete);
    expect(statements.some(s => /^DELETE g FROM ap_groups/.test(s.sql))).toBe(true);
    expect(statements.some(s => /UPDATE tunnel_user_sessions SET status = 'CLOSED'/.test(s.sql))).toBe(true);
    expect(statements.some(s => /INSERT INTO tunnel_logs/.test(s.sql))).toBe(true);
  });

  it('bloquea equipos históricos ambiguos en lugar de adivinar su dueño', async () => {
    ambiguous = 1;
    const impact = await loadImpact({ workspaceId: 'ws-1', pppUser: 'PPP-1', vrfName: 'VRF-1', runQuery });
    await expect(deleteSiteData({
      workspaceId: 'ws-1', pppUser: 'PPP-1', vrfName: 'VRF-1',
      expectedFingerprint: impact.fingerprint, actorUserId: 'owner-1',
    })).rejects.toMatchObject({ code: 'SITE_HAS_AMBIGUOUS_DEVICES' });
    expect(statements.some(s => /^DELETE FROM nodes/.test(s.sql))).toBe(false);
  });

  it('rechaza una confirmación cuyo inventario cambió', async () => {
    const impact = await loadImpact({ workspaceId: 'ws-1', pppUser: 'PPP-1', vrfName: 'VRF-1', runQuery });
    apRows = [{ id: 11, uuid: 'ap-11' }];
    await expect(deleteSiteData({
      workspaceId: 'ws-1', pppUser: 'PPP-1', vrfName: 'VRF-1',
      expectedFingerprint: impact.fingerprint, actorUserId: 'owner-1',
    })).rejects.toMatchObject({ code: 'DELETION_IMPACT_CHANGED' });
    expect(statements.some(s => /^DELETE FROM nodes/.test(s.sql))).toBe(false);
  });
});
