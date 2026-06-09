// ============================================================
//  src/test/render.tsx — wrapper de render con providers reales
//  del proyecto.
//
//  Importa desde @testing-library/react el render base y lo envuelve
//  con VpnProvider + WorkspaceSessionProvider para que los componentes
//  bajo test tengan el contexto disponible sin tener que repetir cada
//  vez la composición.
//
//  Uso:
//
//    import { renderWithProviders, screen } from '@/test/render';
//    renderWithProviders(<MyComponent />);
//    expect(screen.getByText('Hola')).toBeInTheDocument();
//
//  Re-exporta utilidades comunes para tener una sola fuente de import.
// ============================================================
import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VpnProvider } from '../context';
import { WorkspaceSessionProvider } from '../context/WorkspaceSession';

interface WrapperProps {
  children: ReactNode;
}

function AppProviders({ children }: WrapperProps) {
  return (
    <VpnProvider>
      <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>
    </VpnProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup();
  const result = render(ui, { wrapper: AppProviders, ...options });
  return { ...result, user };
}

// Re-exports para ergonomía (un solo import desde los tests).
export * from '@testing-library/react';
export { userEvent };
