import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { WgPeer } from '../../../../types/api';
import UsersTable from './UsersTable';

const peers: WgPeer[] = [
  {
    id: 'peer-1',
    name: 'Zeta',
    allowedAddress: '10.13.250.2/32',
    publicKey: 'public-key-1',
    lastHandshakeSecs: 30,
    active: true,
    email: 'zeta@example.com',
  },
];

describe('UsersTable accessibility', () => {
  beforeEach(() => localStorage.removeItem('vpn_users_visible_cols'));

  it('ordena desde teclado y mantiene el scroll dentro de una región', async () => {
    const user = userEvent.setup();
    render(
      <UsersTable
        peers={peers}
        peerColors={{}}
        copiedPeerId={null}
        onCopyConfig={vi.fn()}
        onSaveAlias={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.getByRole('region', { name: /usuarios wireguard/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /estado/i })).toHaveAttribute('aria-sort', 'descending');

    const sortButton = screen.getByRole('button', { name: /ordenar por usuario ascendente/i });
    sortButton.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('columnheader', { name: /usuario/i })).toHaveAttribute('aria-sort', 'ascending');
  });
});
