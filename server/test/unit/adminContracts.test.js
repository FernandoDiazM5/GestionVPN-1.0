const { ModeratorPatchRequestSchema } = require('@gestionvpn/contracts');

describe('contrato de actualización de moderadores', () => {
  it('permite actualizar datos del moderador sin cambiar su espacio', () => {
    expect(ModeratorPatchRequestSchema.parse({ name: 'Nombre actualizado' })).toEqual({
      name: 'Nombre actualizado',
    });
  });

  it('rechaza cambios al nombre del espacio después de crearlo', () => {
    expect(() => ModeratorPatchRequestSchema.parse({ workspaceName: 'Otro espacio' })).toThrow();
    expect(() => ModeratorPatchRequestSchema.parse({
      name: 'Nombre actualizado',
      workspaceName: 'Otro espacio',
    })).toThrow();
  });
});
