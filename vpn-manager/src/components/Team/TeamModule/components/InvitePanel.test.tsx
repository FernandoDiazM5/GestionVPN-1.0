import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import InvitePanel from './InvitePanel';

describe('InvitePanel', () => {
  it('usa un form nativo y envía con Enter los datos normalizados', async () => {
    const onInvite = vi.fn().mockResolvedValue(null);
    const user = userEvent.setup();
    render(<InvitePanel invitations={[]} onInvite={onInvite} onRevoke={vi.fn()} />);

    const name = screen.getByLabelText('Nombre del invitado');
    const email = screen.getByLabelText('Correo electrónico del invitado');
    expect(name).toHaveAttribute('name', 'name');
    expect(name).toHaveAttribute('autocomplete', 'name');
    expect(email).toHaveAttribute('name', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(email).toBeRequired();

    await user.type(name, '  Ada Lovelace  ');
    await user.type(email, 'correo-invalido');
    await user.keyboard('{Enter}');
    expect(onInvite).not.toHaveBeenCalled();

    await user.clear(email);
    await user.type(email, 'ada@example.com');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onInvite).toHaveBeenCalledWith('ada@example.com', 'MEMBER', undefined, 'Ada Lovelace');
    });
  });

  it('anuncia los errores del envío', async () => {
    const onInvite = vi.fn().mockRejectedValue(new Error('El correo ya fue invitado'));
    const user = userEvent.setup();
    render(<InvitePanel invitations={[]} onInvite={onInvite} onRevoke={vi.fn()} />);

    await user.type(screen.getByLabelText('Correo electrónico del invitado'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El correo ya fue invitado');
  });
});
