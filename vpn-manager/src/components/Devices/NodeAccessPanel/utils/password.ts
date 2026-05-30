// ── Generador de contraseña segura
export function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*-_+=?';
  const all = upper + lower + digits + symbols;
  const mandatory = [
    upper[Math.floor(Math.random() * upper.length)],
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];
  const remaining = Array.from({ length: 14 }, () =>
    all[Math.floor(Math.random() * all.length)]
  );
  return [...mandatory, ...remaining].sort(() => Math.random() - 0.5).join('');
}
