// ============================================================
//  coreBootstrap.test.js — bootstrap idempotente del Router Core.
//  Usa la routeros.service REAL (safeWrite/writeIdempotent) contra un
//  RouterOS falso con estado (sin sockets), para validar:
//   • clasificación de estado (blank/ours/partial),
//   • idempotencia (2ª corrida ⇒ 0 objetos aditivos nuevos),
//   • anti-bloqueo (§4.18): reglas riesgosas omitidas sin origen seguro.
// ============================================================
const coreBootstrap = require('../../lib/coreBootstrap');
const mgmtNet = require('../../lib/mgmtNet');

// ── RouterOS falso con estado ────────────────────────────────────────────────
function parseArgs(args) {
  const row = {};
  for (const a of args) {
    if (typeof a !== 'string' || !a.startsWith('=')) continue;
    const rest = a.slice(1);
    const i = rest.indexOf('=');
    if (i < 0) continue;
    row[rest.slice(0, i)] = rest.slice(i + 1);
  }
  return row;
}

function makeRouter(seed = {}) {
  const tables = new Map();
  for (const [k, v] of Object.entries(seed)) tables.set(k, v.map(r => ({ ...r })));
  // Servicios por defecto (allow-all: address vacío)
  if (!tables.has('/ip/service')) {
    tables.set('/ip/service', ['api', 'api-ssl', 'ftp', 'telnet', 'www', 'ssh', 'winbox']
      .map((name, i) => ({ name, address: '', disabled: 'false', '.id': `*svc${i}` })));
  }
  if (!tables.has('/system/resource')) tables.set('/system/resource', [{ version: '7.19.3', 'board-name': 'CHR' }]);

  const api = {
    calls: [],
    write: async (cmd) => {
      api.calls.push(cmd);
      const path = cmd[0];
      const m = path.match(/\/(add|set|remove|print)$/);
      if (!m) return [];
      const op = m[1];
      const base = path.replace(/\/(add|set|remove|print)$/, '');
      const args = cmd.slice(1);
      if (!tables.has(base)) tables.set(base, []);
      const rows = tables.get(base);
      if (op === 'print') {
        const filters = args
          .filter(a => typeof a === 'string' && a.startsWith('?'))
          .map(a => { const rest = a.slice(1); const i = rest.indexOf('='); return [rest.slice(0, i), rest.slice(i + 1)]; });
        return rows.filter(r => filters.every(([k, v]) => String(r[k]) === v));
      }
      if (op === 'add') {
        const row = parseArgs(args);
        if (!row['.id']) row['.id'] = `*${base}-${rows.length + 1}`;
        rows.push(row);
        return [];
      }
      if (op === 'set') {
        const row = parseArgs(args);
        if (base === '/ip/service') {
          const t = rows.find(r => r.name === row.numbers);
          if (t) Object.assign(t, row);
          return [];
        }
        if (rows.length === 0) rows.push({});
        Object.assign(rows[0], row);
        if (base === '/interface/sstp-server/server' && row.enabled === 'yes') rows[0].enabled = 'true';
        return [];
      }
      return [];
    },
    close: async () => {},
  };
  return { api, tables };
}

// Router "conforme" (nuestro Core completo) para el test de clasificación 'ours'.
function seedOurs() {
  const names = [mgmtNet.vps.iface, mgmtNet.clients.iface, mgmtNet.admin.iface];
  return {
    '/interface/wireguard': names.map((name, i) => ({ name, 'listen-port': String(13232 + i), running: 'true', 'public-key': `k${i}` })),
    '/interface/sstp-server/server': [{ enabled: 'true', port: '4443' }],
    '/ip/firewall/filter': coreBootstrap.MANAGED_FILTER_COMMENTS.map((comment, i) => ({ comment, '.id': `*f${i}` })),
    '/ip/vrf': [],
  };
}

describe('coreBootstrap — clasificación de estado', () => {
  it('router en blanco → state=blank', async () => {
    const { api } = makeRouter();
    const { state, summary } = await coreBootstrap.readRouterState(api);
    expect(state).toBe('blank');
    expect(summary.mgmtInterfaces.length).toBe(0);
  });

  it('router nuestro completo → state=ours', async () => {
    const { api } = makeRouter(seedOurs());
    const { state, summary } = await coreBootstrap.readRouterState(api);
    expect(state).toBe('ours');
    expect(summary.mgmtInterfaces.length).toBe(3);
    expect(summary.sstpServer?.enabled).toBe(true);
  });

  it('con solo una interfaz de gestión → state=partial', async () => {
    const { api } = makeRouter({
      '/interface/wireguard': [{ name: mgmtNet.vps.iface, 'listen-port': '13232' }],
    });
    const { state } = await coreBootstrap.readRouterState(api);
    expect(state).toBe('partial');
  });

  it('equipo ajeno con otra config (WG no-gestión) → state=foreign', async () => {
    const { api } = makeRouter({
      '/interface/wireguard': [{ name: 'wg-otro', 'listen-port': '51820' }],
    });
    const { state } = await coreBootstrap.readRouterState(api);
    expect(state).toBe('foreign');
  });
});

describe('coreBootstrap — applyBaseline idempotencia', () => {
  // NO se pasa publicIp/wanIface: el bootstrap no gestiona la IP pública/WAN.
  const opts = {
    sstpPort: 4443, backendOrigin: '179.6.29.241',
    trustedPublics: [], lockdownSafe: true,
  };

  it('1ª corrida crea objetos; 2ª corrida no crea nada aditivo (idempotente)', async () => {
    const { api } = makeRouter();
    const run1 = [];
    await coreBootstrap.applyBaseline(api, opts, (s) => run1.push(s));
    expect(run1.some(s => s.status === 'error')).toBe(false);
    expect(run1.filter(s => s.status === 'ok').length).toBeGreaterThan(10);

    const run2 = [];
    await coreBootstrap.applyBaseline(api, opts, (s) => run2.push(s));
    expect(run2.some(s => s.status === 'error')).toBe(false);
    // Los objetos aditivos (todo salvo los `set` singleton) no deben re-crearse.
    const singletonSet = new Set(['SSTP Server', 'DNS', 'API allowlist', 'Servicios inseguros']);
    const additiveCreated = run2.filter(s => s.status === 'ok' && !singletonSet.has(s.obj));
    expect(additiveCreated).toEqual([]);
    // Y debe haber muchos 'skip' (ya presente).
    expect(run2.filter(s => s.status === 'skip').length).toBeGreaterThan(10);
  });

  it('aplica la regla riesgosa "Bloqueo total WAN" cuando el lockdown es seguro', async () => {
    const { api } = makeRouter();
    const steps = [];
    await coreBootstrap.applyBaseline(api, opts, (s) => steps.push(s));
    const wan = steps.find(s => s.obj === 'Firewall' && /Bloqueo total WAN/.test(s.name));
    expect(wan?.status).toBe('ok');
  });
});

describe('coreBootstrap — anti-bloqueo (§4.18)', () => {
  it('omite "drop WAN" y la restricción de API si el origen no es seguro', async () => {
    const { api } = makeRouter();
    const opts = {
      sstpPort: 4443, backendOrigin: null,
      trustedPublics: [], lockdownSafe: false,
    };
    const steps = [];
    await coreBootstrap.applyBaseline(api, opts, (s) => steps.push(s));
    // No debe existir una regla aplicada "Bloqueo total WAN".
    const wanApplied = steps.find(s => s.obj === 'Firewall' && /Bloqueo total WAN/.test(s.name) && s.status === 'ok');
    expect(wanApplied).toBeUndefined();
    // Debe haber un aviso (warn) de firewall diferido y de API allowlist diferida.
    expect(steps.some(s => s.status === 'warn' && /Bloqueo total WAN/.test(s.name))).toBe(true);
    expect(steps.some(s => s.status === 'warn' && /allowlist/i.test(s.obj + s.name))).toBe(true);
  });
});

describe('coreBootstrap — helpers derivados de mgmtNet', () => {
  it('firstHost devuelve la .1 del /24', () => {
    expect(coreBootstrap._internal.firstHost('10.12.250.0/24')).toBe('10.12.250.1');
  });
  it('sstpPoolRange se deriva de la base de nodos SSTP', () => {
    expect(coreBootstrap._internal.sstpPoolRange()).toBe(`${mgmtNet.nodes.sstpBase}200-${mgmtNet.nodes.sstpBase}250`);
  });
  it('detectBackendOrigin extrae el src de una conexión a :8728', async () => {
    const { api } = makeRouter({
      '/ip/firewall/connection': [{ 'protocol': 'tcp', 'src-address': '179.6.29.241:51000', 'dst-address': '10.12.250.1:8728' }],
    });
    const origin = await coreBootstrap.detectBackendOrigin(api);
    expect(origin).toBe('179.6.29.241');
  });
});
