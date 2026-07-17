const attempts = new Map();

function seconds() {
  return Math.max(0, Number(process.env.GEMINI_USER_COOLDOWN_SECONDS || 60));
}

function acquire(userId, now = Date.now()) {
  const waitMs = seconds() * 1000;
  if (!attempts.has(userId)) {
    attempts.set(userId, now);
    return { acquired: true, acquiredAt: now, retryAfterSeconds: 0 };
  }
  const previous = attempts.get(userId);
  const remainingMs = previous + waitMs - now;
  if (remainingMs > 0) return { acquired: false, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
  attempts.set(userId, now);
  return { acquired: true, acquiredAt: now, retryAfterSeconds: 0 };
}

function release(userId, acquiredAt) {
  if (attempts.get(userId) === acquiredAt) attempts.delete(userId);
}

function resetForTests() {
  attempts.clear();
}

module.exports = { acquire, release, resetForTests, seconds };
