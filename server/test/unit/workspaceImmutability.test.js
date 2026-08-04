const workspaceRouter = require('../../routes/workspace.routes');

describe('inmutabilidad del espacio de trabajo', () => {
  it('no expone una ruta para cambiar su nombre después de crearlo', () => {
    const renameRoute = workspaceRouter.stack.find(layer =>
      layer.route?.path === '/name' && layer.route?.methods?.patch
    );

    expect(renameRoute).toBeUndefined();
  });
});
