// ============================================================
//  scanLock — mutex async por workspace (Opción C).
//  Valida serialización por clave, concurrencia entre claves y
//  auto-liberación de seguridad por timeout.
// ============================================================
const scanLock = require('../../lib/scanLock');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

describe('scanLock.withLock', () => {
  it('serializa secciones críticas de la MISMA clave', async () => {
    const order = [];
    const a = scanLock.withLock('ws-1', async () => {
      order.push('a-in'); await sleep(20); order.push('a-out');
    });
    const b = scanLock.withLock('ws-1', async () => {
      order.push('b-in'); await sleep(5); order.push('b-out');
    });
    await Promise.all([a, b]);
    // b no debe entrar hasta que a salga.
    expect(order).toEqual(['a-in', 'a-out', 'b-in', 'b-out']);
  });

  it('permite concurrencia entre claves DISTINTAS', async () => {
    const order = [];
    const a = scanLock.withLock('ws-A', async () => {
      order.push('A-in'); await sleep(20); order.push('A-out');
    });
    const b = scanLock.withLock('ws-B', async () => {
      order.push('B-in'); await sleep(5); order.push('B-out');
    });
    await Promise.all([a, b]);
    // B entra mientras A sigue dentro (sin contención entre claves).
    expect(order[0]).toBe('A-in');
    expect(order[1]).toBe('B-in');
    expect(order.indexOf('B-out')).toBeLessThan(order.indexOf('A-out'));
  });

  it('libera el lock aunque fn lance', async () => {
    await expect(scanLock.withLock('ws-2', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    // El siguiente debe poder entrar (lock liberado pese al throw).
    let entered = false;
    await scanLock.withLock('ws-2', async () => { entered = true; });
    expect(entered).toBe(true);
  });
});

describe('scanLock.acquire', () => {
  it('auto-libera por timeout de seguridad si no se llama release', async () => {
    const release1 = await scanLock.acquire('ws-3', 30); // no lo llamamos
    void release1;
    const t0 = Date.now();
    // El segundo acquire debe destrabarse cuando el timer de seguridad libere el primero.
    const release2 = await scanLock.acquire('ws-3', 1000);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(20);
    release2();
  });
});

describe('scanLock.acquireOrNull', () => {
  it('toma el lock de inmediato si está libre', async () => {
    const release = await scanLock.acquireOrNull('ws-on-1', 50);
    expect(typeof release).toBe('function');
    release();
  });

  it('devuelve null si el lock sigue ocupado tras waitMs', async () => {
    const held = await scanLock.acquire('ws-on-2', 10000);
    const t0 = Date.now();
    const got = await scanLock.acquireOrNull('ws-on-2', 30);
    expect(got).toBeNull();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(20);
    held();
  });

  it('NO filtra la cola al expirar: un acquire posterior entra al liberar el holder', async () => {
    const held = await scanLock.acquire('ws-on-3', 10000);
    const got = await scanLock.acquireOrNull('ws-on-3', 20); // expira → null
    expect(got).toBeNull();
    held(); // libera; el waiter cancelado NO debe haberse quedado con el testigo
    // Si la cola se hubiera filtrado, este acquire se colgaría hasta el timeout.
    const next = await scanLock.acquire('ws-on-3', 1000);
    expect(typeof next).toBe('function');
    next();
  });

  it('concede el lock si el holder libera DENTRO de waitMs', async () => {
    const held = await scanLock.acquire('ws-on-4', 10000);
    setTimeout(() => held(), 15);
    const got = await scanLock.acquireOrNull('ws-on-4', 500);
    expect(typeof got).toBe('function');
    got();
  });
});
