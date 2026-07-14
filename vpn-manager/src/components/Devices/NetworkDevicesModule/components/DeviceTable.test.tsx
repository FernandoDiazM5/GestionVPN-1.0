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
    gridTemplate: '44px 40px 54px 140px 120px 80px 44px 180px',
    minTableWidth: 702,
    compactNameMode: false,
    sortConfig: { key: 'ip', dir: 'asc' },
    toggleSort: vi.fn(),
    startResize: vi.fn(),
    sshStatus: {},
    expandedRows: new Set(),
    toggleExpand: vi.fn(),
    savedDevices: [],
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
    expect(screen.getByRole('columnheader', { name: /ip \/ mac/i })).toHaveAttribute('aria-sort', 'ascending');

    const sortButton = screen.getByRole('button', { name: /ordenar por ip \/ mac descendente/i });
    sortButton.focus();
    await user.keyboard('{Enter}');
    expect(props.toggleSort).toHaveBeenCalledWith('ip');

    const resizeButton = screen.getByRole('button', { name: /redimensionar columna señal/i });
    fireEvent.keyDown(resizeButton, { key: 'ArrowRight' });
    expect(props.startResize).toHaveBeenCalledWith('signal', 0, 10);
  });
});
