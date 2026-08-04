import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { ColumnDef } from '../types';
import { DeviceTable } from './DeviceTable';

const signalColumn: ColumnDef = {
  key: 'signal',
  label: 'Señal',
  width: '80px',
  defaultVisible: true,
  requiresStats: true,
  render: () => null,
};

function renderTable(overrides: Partial<React.ComponentProps<typeof DeviceTable>> = {}) {
  const props: React.ComponentProps<typeof DeviceTable> = {
    sortedRows: [],
    activeConfigCols: [signalColumn],
    gridTemplate: '44px 54px 180px minmax(220px,1fr) 80px 44px 116px',
    minTableWidth: 738,
    sortConfig: { key: 'ip', dir: 'asc' },
    toggleSort: vi.fn(),
    startResize: vi.fn(),
    sshStatus: {},
    expandedRows: new Set(),
    toggleExpand: vi.fn(),
    savedDevices: [],
    savingIds: new Set(),
    selectedNode: null,
    selectedIds: new Set(),
    onToggleSelected: vi.fn(),
    onSelectAllVisibleCandidates: vi.fn(),
    onClearSelection: vi.fn(),
    visibleCandidateCount: 0,
    stationNamesByMac: new Map(),
    onOpenM5Detail: vi.fn(),
    onSyncToSaved: vi.fn(),
    onDirectSave: vi.fn(),
    onOpenAddModal: vi.fn(),
    onRefreshStats: vi.fn(),
    ...overrides,
  };
  render(<DeviceTable {...props} />);
  return props;
}

describe('DeviceTable accessibility', () => {
  it('expone ordenación y resize operables por teclado', async () => {
    const user = userEvent.setup();
    const props = renderTable();

    expect(screen.getByRole('region', { name: /dispositivos escaneados/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^ip/i })).toHaveAttribute('aria-sort', 'ascending');

    const sortButton = screen.getByRole('button', { name: /ordenar por ip descendente/i });
    sortButton.focus();
    await user.keyboard('{Enter}');
    expect(props.toggleSort).toHaveBeenCalledWith('ip');

    const resizeButton = screen.getByRole('button', { name: /redimensionar columna señal/i });
    fireEvent.keyDown(resizeButton, { key: 'ArrowRight' });
    expect(props.startResize).toHaveBeenCalledWith('signal', 0, 10);

    const ipResizeButton = screen.getByRole('button', { name: /redimensionar columna ip/i });
    fireEvent.keyDown(ipResizeButton, { key: 'ArrowLeft' });
    expect(props.startResize).toHaveBeenCalledWith('ip', 0, -10);
  });

  it('mantiene la IP completa y fija sin mostrar un control de copia', () => {
    renderTable({
      sortedRows: [{
        devId: '1C6A1BCE9A8B',
        isSaved: false,
        dev: {
          ip: '192.168.30.200',
          mac: '1C:6A:1B:CE:9A:8B',
          name: 'Torre Omar',
          model: 'LiteAP GPS',
          firmware: 'v8.7.19',
          role: 'ap',
        },
      }],
    });

    const ipLink = screen.getByRole('link', { name: '192.168.30.200' });
    expect(ipLink).toHaveClass('whitespace-nowrap');
    expect(ipLink.getAttribute('title')).toContain('MAC: 1C:6A:1B:CE:9A:8B');
    expect(screen.queryByRole('button', { name: /copiar ip 192\.168\.30\.200/i })).not.toBeInTheDocument();
    expect(ipLink.closest('[role="cell"]')).toHaveClass('sticky', 'left-0');
  });

  it('omite la columna SSH y muestra Nombre / Modelo sin truncarlo', () => {
    renderTable({
      sortedRows: [{
        devId: '1C6A1BCE9A8B',
        isSaved: false,
        dev: {
          ip: '192.168.30.200',
          mac: '1C:6A:1B:CE:9A:8B',
          name: 'INTERNET CLIENTE TORRE OMAR',
          model: 'LiteBeam 5AC Generation 2',
          firmware: 'v8.7.19',
          role: 'sta',
        },
      }],
    });

    expect(screen.queryByRole('columnheader', { name: /^ssh$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /nombre \/ modelo/i })).toBeInTheDocument();
    expect(screen.getByText('INTERNET CLIENTE TORRE OMAR')).toHaveClass('break-words');
    expect(screen.getByText('LiteBeam 5AC Generation 2')).toHaveClass('break-words');
  });

  it('usa tarjetas legibles en móvil sin montar la cuadrícula horizontal', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 639px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      renderTable({
        sortedRows: [{
          devId: '88AA88BB88CC',
          isSaved: false,
          dev: {
            ip: '10.1.1.213',
            mac: '88:AA:88:BB:88:CC',
            name: 'Cliente Floresta',
            model: 'LiteBeam M5',
            firmware: 'v6.3',
            role: 'sta',
            frequency: 5800,
            cachedStats: { signal: -60 },
          },
        }],
        activeConfigCols: [{
          ...signalColumn,
          render: dev => <span>{dev.cachedStats?.signal} dBm</span>,
        }],
        sshStatus: { '10.1.1.213': 'success' },
      });

      expect(screen.queryByRole('region', { name: /dispositivos escaneados/i })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: /equipos encontrados en vista móvil/i })).toBeInTheDocument();
      expect(screen.getByText('Cliente Floresta')).toBeInTheDocument();
      expect(screen.getByText('10.1.1.213')).toBeInTheDocument();
      expect(screen.getByText('LiteBeam M5')).toBeInTheDocument();
      expect(screen.getByText('-60 dBm')).toBeInTheDocument();
      expect(screen.getByText(/ssh conectado/i)).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
