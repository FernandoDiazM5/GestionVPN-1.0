const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseWg0Conf, ensureAllowedIps, appendWg0Intent } = require('../../lib/wg0Sync');

// wg0.conf de ejemplo: scan-pool por PostUp (caso real del VPS), AllowedIPs con
// un plano de gestión + una LAN de torre.
const SAMPLE = `[Interface]
Address = 10.12.250.60/32
PrivateKey = N0YclaveDePruebaNoReal=
PostUp  = for i in $(seq 2 50); do ip addr add 10.11.252.$i/32 dev wg0; done
PostDown = for i in $(seq 2 50); do ip addr del 10.11.252.$i/32 dev wg0; done

[Peer]
PublicKey = R79pubkeyDePrueba=
Endpoint = 1.2.3.4:13232
AllowedIPs = 10.12.250.0/24, 142.152.7.0/24
PersistentKeepalive = 25
`;

describe('lib/wg0Sync — parseWg0Conf', () => {
  it('recoge AllowedIPs e ifaceAddrs y detecta el scan-pool por PostUp', () => {
    const p = parseWg0Conf(SAMPLE);
    expect(p.peerAllowed).toEqual(['10.12.250.0/24', '142.152.7.0/24']);
    expect(p.ifaceAddrs).toEqual(['10.12.250.60/32']);
    expect(p.hasPostUpScan).toBe(true);   // PostUp con 10.11.252. → no gestionar Address
  });
});

describe('lib/wg0Sync — ensureAllowedIps (guarda de idempotencia)', () => {
  let confPath;
  beforeEach(() => {
    confPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wg0-')), 'wg0.conf');
    fs.writeFileSync(confPath, SAMPLE);
  });

  it('NO-OP cuando la LAN ya existe: no marca cambio ni reescribe el archivo', () => {
    const before = fs.readFileSync(confPath, 'utf8');
    const r = ensureAllowedIps(confPath, ['142.152.7.0/24'], { reload: false });
    expect(r.changed).toBe(false);
    expect(r.added).toEqual([]);
    expect(fs.readFileSync(confPath, 'utf8')).toBe(before);      // intacto
    expect(fs.existsSync(`${confPath}.bak`)).toBe(false);         // ni backup
  });

  it('añade SOLO la LAN faltante (unión) y preserva llaves/PostUp/Endpoint', () => {
    const r = ensureAllowedIps(confPath, ['10.1.1.0/24', '142.152.7.0/24'], { reload: false });
    expect(r.changed).toBe(true);
    expect(r.added).toEqual(['10.1.1.0/24']);                     // la ya presente no se re-añade
    const after = fs.readFileSync(confPath, 'utf8');
    expect(after).toContain('AllowedIPs = 10.12.250.0/24, 142.152.7.0/24, 10.1.1.0/24');
    expect(after).toContain('PrivateKey = N0YclaveDePruebaNoReal=');   // secreto preservado
    expect(after).toContain('PostUp  = for i in $(seq 2 50)');         // PostUp preservado
    expect(after).toContain('Endpoint = 1.2.3.4:13232');
    // una sola línea AllowedIPs (no se duplica)
    expect((after.match(/AllowedIPs/g) || []).length).toBe(1);
  });

  it('normaliza IP suelta a /32 y deduplica la entrada a añadir', () => {
    const r = ensureAllowedIps(confPath, ['10.11.250.7', '10.11.250.7'], { reload: false });
    expect(r.added).toEqual(['10.11.250.7/32']);
  });

  it('apply:false calcula el diff pero NO escribe', () => {
    const before = fs.readFileSync(confPath, 'utf8');
    const r = ensureAllowedIps(confPath, ['10.1.1.0/24'], { apply: false });
    expect(r.changed).toBe(true);
    expect(r.added).toEqual(['10.1.1.0/24']);
    expect(fs.readFileSync(confPath, 'utf8')).toBe(before);      // sin tocar
  });
});

describe('lib/wg0Sync — appendWg0Intent (modelo hardened, guarda)', () => {
  let intentPath;
  beforeEach(() => {
    intentPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wg0i-')), 'allowedips.desired');
  });

  it('primera vez: crea el archivo con la(s) LAN', () => {
    const r = appendWg0Intent(intentPath, ['10.1.1.0/24', '10.2.2.0/24']);
    expect(r.changed).toBe(true);
    expect(r.added).toEqual(['10.1.1.0/24', '10.2.2.0/24']);
    expect(fs.readFileSync(intentPath, 'utf8')).toBe('10.1.1.0/24\n10.2.2.0/24\n');
  });

  it('NO-OP si la LAN ya está en la intención: no reescribe (no dispara al watcher)', () => {
    fs.writeFileSync(intentPath, '10.1.1.0/24\n');
    const mtime = fs.statSync(intentPath).mtimeMs;
    const r = appendWg0Intent(intentPath, ['10.1.1.0/24']);
    expect(r.changed).toBe(false);
    expect(r.added).toEqual([]);
    expect(fs.statSync(intentPath).mtimeMs).toBe(mtime);         // archivo intacto
  });

  it('añade solo la LAN nueva, preservando las previas (unión)', () => {
    fs.writeFileSync(intentPath, '10.1.1.0/24\n');
    const r = appendWg0Intent(intentPath, ['10.1.1.0/24', '10.3.3.0/24']);
    expect(r.changed).toBe(true);
    expect(r.added).toEqual(['10.3.3.0/24']);
    expect(fs.readFileSync(intentPath, 'utf8')).toBe('10.1.1.0/24\n10.3.3.0/24\n');
  });
});
