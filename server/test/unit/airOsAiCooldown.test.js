const cooldown = require('../../lib/ai/airOsCooldown');

describe('cooldown por moderador', () => {
  beforeEach(() => {
    cooldown.resetForTests();
    process.env.GEMINI_USER_COOLDOWN_SECONDS = '60';
  });

  it('acepta el primer intento y bloquea el siguiente dentro de la ventana', () => {
    expect(cooldown.acquire('owner-1', 1_000).acquired).toBe(true);
    expect(cooldown.acquire('owner-1', 31_000)).toEqual({ acquired: false, retryAfterSeconds: 30 });
    expect(cooldown.acquire('owner-1', 61_000).acquired).toBe(true);
  });

  it('permite liberar una reserva que no consumió Gemini', () => {
    const attempt = cooldown.acquire('owner-1', 1_000);
    cooldown.release('owner-1', attempt.acquiredAt);
    expect(cooldown.acquire('owner-1', 1_001).acquired).toBe(true);
  });
});
