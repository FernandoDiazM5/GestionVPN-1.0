const {
  sanitizeIdentity, localDateParts, buildBackupStem, maskEmail, validateRscContent,
} = require('../../lib/coreBackupService');

describe('coreBackupService helpers', () => {
  it('genera el nombre requerido con fecha local e identidad segura', () => {
    const date = new Date('2026-07-14T07:00:00.000Z');
    expect(buildBackupStem('GW VPN / CORE ISP', date, 'America/Lima'))
      .toBe('servervpn_2026-07-14_02-00-00_GW-VPN-CORE-ISP');
  });

  it('calcula fecha y hora según la zona configurada', () => {
    expect(localDateParts(new Date('2026-07-14T05:30:00.000Z'), 'America/Lima'))
      .toMatchObject({ date: '2026-07-14', time: '00:30' });
  });

  it('limpia identidades y enmascara el destinatario', () => {
    expect(sanitizeIdentity('  Núcleo@Lima  ')).toBe('Nucleo-Lima');
    expect(maskEmail('administrador@example.com')).toBe('ad***********@example.com');
  });

  it('acepta un export sin secretos visibles', () => {
    expect(validateRscContent('# jul/14/2026\n/interface wireguard\nadd name=VPN-WG-VPS private-key=""')).toBe(true);
  });

  it('rechaza contraseñas o claves privadas visibles en el RSC', () => {
    expect(() => validateRscContent('# export\n/user add name=ops password="secreto"')).toThrow(/secreto visible/i);
    expect(() => validateRscContent('# export\n/interface wireguard add private-key="abc123"')).toThrow(/secreto visible/i);
  });
});
