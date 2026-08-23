import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScanModeToggle } from './ScanModeToggle';

describe('ScanModeToggle', () => {
  it('muestra el modo VPS fijo sin selector local', () => {
    render(<ScanModeToggle />);
    expect(screen.getByText('Modo VPS activo')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Local$/)).not.toBeInTheDocument();
  });
});
