import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NodeInfo } from '../../../../types/api';
import { NodeCardSshForm } from './NodeCardSshForm';

const node = {
  nombre_nodo: 'Torre Housenet',
  ppp_user: 'torre-housenet',
} as NodeInfo;

function renderModal() {
  const props = {
    showSshForm: true,
    node,
    sshCredsArr: [{ user: 'ubnt', pass: 'secret' }],
    showPasswords: false,
    sshLoading: false,
    sshSaved: false,
    onSetShowPasswords: vi.fn(),
    onCloseSshForm: vi.fn(),
    onUpdateCred: vi.fn(),
    onRemoveCred: vi.fn(),
    onAddCred: vi.fn(),
    onSaveSshCreds: vi.fn(),
  };
  render(<NodeCardSshForm {...props} />);
  return props;
}

describe('<NodeCardSshForm />', () => {
  it('presenta las credenciales como un dialog accesible con identidad visual', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Acceso a equipos — Torre Housenet' });
    expect(dialog).toHaveClass('modal-panel', 'modal-panel-xl');
    expect(screen.getByText('Se probarán en este orden cuando busques equipos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toHaveClass('btn-primary');
    expect(document.querySelector('tr')).not.toBeInTheDocument();
  });

  it('conecta las acciones principales del formulario', async () => {
    const user = userEvent.setup();
    const props = renderModal();

    await user.click(screen.getByRole('button', { name: 'Mostrar claves' }));
    await user.click(screen.getByRole('button', { name: /Agregar otra credencial/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(props.onSetShowPasswords).toHaveBeenCalledWith(true);
    expect(props.onAddCred).toHaveBeenCalledOnce();
    expect(props.onSaveSshCreds).toHaveBeenCalledOnce();
    expect(props.onCloseSshForm).toHaveBeenCalledOnce();
  });
});
