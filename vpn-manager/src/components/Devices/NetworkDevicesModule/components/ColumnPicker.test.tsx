import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ColumnPicker } from './ColumnPicker';

function ControlledColumnPicker() {
  const [visibleCols, setVisibleCols] = useState(['essid']);
  return <ColumnPicker visibleCols={visibleCols} onChange={setVisibleCols} />;
}

describe('ColumnPicker', () => {
  it('permanece abierto al seleccionar y desplazar dentro del menu', () => {
    render(<ControlledColumnPicker />);

    fireEvent.click(screen.getByRole('button', { name: /columnas/i }));
    const menu = screen.getByRole('menu', { name: /mostrar\/ocultar columnas/i });

    expect(menu).toHaveClass('overscroll-contain');
    expect(menu.style.maxHeight).not.toBe('');

    fireEvent.scroll(menu);
    expect(menu).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /^señal ssh$/i }));
    expect(screen.getByRole('menu', { name: /mostrar\/ocultar columnas/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /mover señal hacia arriba/i })).toBeInTheDocument();
  });

  it('continua cerrandose cuando el desplazamiento ocurre fuera del menu', () => {
    render(<ControlledColumnPicker />);

    fireEvent.click(screen.getByRole('button', { name: /columnas/i }));
    expect(screen.getByRole('menu', { name: /mostrar\/ocultar columnas/i })).toBeInTheDocument();

    fireEvent.scroll(document);

    expect(screen.queryByRole('menu', { name: /mostrar\/ocultar columnas/i })).not.toBeInTheDocument();
  });
});
