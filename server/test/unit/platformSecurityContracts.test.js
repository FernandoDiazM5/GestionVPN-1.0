const { SecurityMutationSchema, SecurityStepUpRequestSchema } = require('@gestionvpn/contracts');

const base = {
  target: '203.0.113.10', category: 'MAINTENANCE', reason: 'Mantenimiento autorizado',
  stepUpToken: 'x'.repeat(32), duration: '1h',
};

describe('contratos de seguridad del VPS', () => {
  it('acepta IP individuales y la red máxima recomendada', () => {
    expect(SecurityMutationSchema.safeParse(base).success).toBe(true);
    expect(SecurityMutationSchema.safeParse({ ...base, target: '192.0.2.0/24' }).success).toBe(true);
    expect(SecurityMutationSchema.safeParse({ ...base, target: '2001:db8::/64' }).success).toBe(true);
  });

  it('rechaza redes demasiado amplias y motivos cortos', () => {
    expect(SecurityMutationSchema.safeParse({ ...base, target: '192.0.2.0/23' }).success).toBe(false);
    expect(SecurityMutationSchema.safeParse({ ...base, target: '2001:db8::/63' }).success).toBe(false);
    expect(SecurityMutationSchema.safeParse({ ...base, reason: 'corto' }).success).toBe(false);
  });

  it('exige exactamente un método de reautenticación', () => {
    expect(SecurityStepUpRequestSchema.safeParse({ password: 'secreto' }).success).toBe(true);
    expect(SecurityStepUpRequestSchema.safeParse({ firebaseIdToken: 'token' }).success).toBe(true);
    expect(SecurityStepUpRequestSchema.safeParse({}).success).toBe(false);
    expect(SecurityStepUpRequestSchema.safeParse({ password: 'a', firebaseIdToken: 'b' }).success).toBe(false);
  });
});
