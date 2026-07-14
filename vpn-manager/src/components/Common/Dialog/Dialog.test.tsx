import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Drawer from '../Drawer';
import Dialog from './Dialog';

function DialogHarness({ cancelable = true }: { cancelable?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Abrir</button>
      {open && (
        <Dialog
          title="Confirmar operación"
          onClose={() => setOpen(false)}
          closeOnBackdrop={cancelable}
          closeOnEscape={cancelable}
          panelClassName="panel"
        >
          <p>Contenido</p>
          <button>Primero</button>
          <button>Último</button>
        </Dialog>
      )}
    </div>
  );
}

describe('<Dialog />', () => {
  it('crea un dialog accesible en un portal y oculta el fondo', async () => {
    const user = userEvent.setup();
    const { container } = render(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    const dialog = screen.getByRole('dialog', { name: 'Confirmar operación' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.parentElement?.parentElement).toHaveAttribute('data-overlay-root');
    expect(container).toHaveAttribute('inert');
    expect(container).toHaveAttribute('aria-hidden', 'true');
    expect(document.body).toHaveStyle({ overflow: 'hidden' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Primero' })).toHaveFocus());
  });

  it('mantiene Tab y Shift+Tab dentro del dialog', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    const first = screen.getByRole('button', { name: 'Primero' });
    const last = screen.getByRole('button', { name: 'Último' });
    await waitFor(() => expect(first).toHaveFocus());

    await user.tab();
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('cierra con Escape y restaura el foco al disparador', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.body.style.overflow).toBe('');
  });

  it('cierra al pulsar el backdrop', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    fireEvent.click(document.querySelector('[data-accessible-overlay]') as HTMLElement);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('respeta dialogs no cancelables', async () => {
    const user = userEvent.setup();
    render(<DialogHarness cancelable={false} />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const overlay = document.querySelector('[data-accessible-overlay]') as HTMLElement;

    await user.keyboard('{Escape}');
    fireEvent.click(overlay);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('permite usar la misma accesibilidad en un drawer', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer title="Navegación principal" onClose={onClose}>
        <button>Cerrar menú</button>
      </Drawer>,
    );

    const drawer = screen.getByRole('dialog', { name: 'Navegación principal' });
    expect(drawer.tagName).toBe('ASIDE');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
