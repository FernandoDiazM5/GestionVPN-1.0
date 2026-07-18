const {
  ApGroupRequestSchema,
  CpeEnrichBatchRequestSchema,
  DeviceAntennaRequestSchema,
  DeviceAutoLoginRequestSchema,
  DevicePatchRequestSchema,
  DevicePersistRequestSchema,
} = require('@gestionvpn/contracts');

describe('security input schemas', () => {
  it('normaliza puertos y texto sin aceptar campos desconocidos', () => {
    const result = DeviceAntennaRequestSchema.parse({
      deviceIP: '10.0.50.7',
      deviceUser: '  ubnt  ',
      devicePass: 'secret',
      devicePort: '2222',
    });

    expect(result).toEqual({
      deviceIP: '10.0.50.7',
      deviceUser: 'ubnt',
      devicePass: 'secret',
      devicePort: 2222,
    });
    expect(DeviceAntennaRequestSchema.safeParse({
      ...result,
      targetHost: '169.254.169.254',
    }).success).toBe(false);
  });

  it('limita las credenciales probadas y valida cada IPv4', () => {
    const credential = { user: 'ubnt', pass: 'secret', port: 22 };
    expect(DeviceAutoLoginRequestSchema.safeParse({
      ip: '999.0.0.1',
      sshCredentials: [credential],
    }).success).toBe(false);
    expect(DeviceAutoLoginRequestSchema.safeParse({
      ip: '10.0.0.1',
      sshCredentials: Array.from({ length: 21 }, () => credential),
    }).success).toBe(false);
  });

  it('acepta el esqueleto persistido real, incluidos nulos heredados', () => {
    const result = DevicePersistRequestSchema.safeParse({
      id: 'AABBCCDDEEFF',
      mac: 'legacy-device-id',
      ip: '10.0.50.7',
      name: 'AP principal',
      role: 'ap',
      nodeId: null,
      frequency: null,
      channelWidth: null,
      addedAt: null,
      lastCpeCount: null,
    });

    expect(result.success).toBe(true);
  });

  it('rechaza actualizaciones vacías y secretos excesivos', () => {
    expect(DevicePatchRequestSchema.safeParse({}).success).toBe(false);
    expect(DevicePatchRequestSchema.safeParse({ sshPass: 'x'.repeat(513) }).success).toBe(false);
  });

  it('limita los lotes de CPE y valida MAC/IP', () => {
    const item = { mac: 'AA:BB:CC:DD:EE:FF', ip: '10.0.50.9' };
    expect(CpeEnrichBatchRequestSchema.safeParse({
      apId: 'ap-1',
      cpes: Array.from({ length: 100 }, () => item),
    }).success).toBe(true);
    expect(CpeEnrichBatchRequestSchema.safeParse({
      apId: 'ap-1',
      cpes: Array.from({ length: 101 }, () => item),
    }).success).toBe(false);
    expect(CpeEnrichBatchRequestSchema.safeParse({
      apId: 'ap-1',
      cpes: [{ mac: 'not-a-mac', ip: '10.0.50.9' }],
    }).success).toBe(false);
  });

  it('rechaza caracteres de control en texto operativo', () => {
    expect(ApGroupRequestSchema.safeParse({ nombre: 'Grupo\ninyectado' }).success).toBe(false);
  });
});
