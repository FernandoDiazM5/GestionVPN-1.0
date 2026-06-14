// ============================================================
//  test/unit/apWatch.test.js — registro de heartbeats (E1)
// ============================================================
const apWatch = require('../../lib/apWatch');

beforeEach(() => apWatch._reset());

describe('apWatch', () => {
  it('touch + isWatched dentro del TTL', () => {
    apWatch.touch('ws-1', 1000);
    expect(apWatch.isWatched('ws-1', 90_000, 1000)).toBe(true);
    expect(apWatch.isWatched('ws-1', 90_000, 1000 + 80_000)).toBe(true);
  });

  it('isWatched false fuera del TTL', () => {
    apWatch.touch('ws-1', 1000);
    expect(apWatch.isWatched('ws-1', 90_000, 1000 + 90_001)).toBe(false);
  });

  it('isWatched false para workspace nunca tocado', () => {
    expect(apWatch.isWatched('otro')).toBe(false);
  });

  it('touch ignora workspaceId vacío', () => {
    apWatch.touch(null, 1000);
    apWatch.touch('', 1000);
    expect(apWatch.watchedWorkspaces(90_000, 1000)).toEqual([]);
  });

  it('watchedWorkspaces devuelve los vigentes y purga los vencidos', () => {
    apWatch.touch('a', 1000);
    apWatch.touch('b', 1000);
    // 'a' renovado más tarde; 'b' vence
    apWatch.touch('a', 100_000);
    const list = apWatch.watchedWorkspaces(90_000, 100_000);
    expect(list).toContain('a');
    expect(list).not.toContain('b');
    // 'b' fue purgado del mapa
    expect(apWatch.isWatched('b', 90_000, 100_000)).toBe(false);
  });
});
