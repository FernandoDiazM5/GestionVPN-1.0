import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmModal from './ConfirmModal';

describe('<ConfirmModal /> accesible', () => {
  it('expone su título y permite cancelar con Escape', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmModal
        isOpen
        title="Eliminar nodo"
        message="Esta acción no se puede deshacer."
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Eliminar nodo' })).toHaveAttribute('aria-modal', 'true');
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
