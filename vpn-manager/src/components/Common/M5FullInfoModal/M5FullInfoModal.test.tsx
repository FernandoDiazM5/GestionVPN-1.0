import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ScannedDevice } from '../../../types/devices';
import { airOsAiApi } from '../../../services/airOsAiApi';
import M5FullInfoModal from './M5FullInfoModal';

const device: ScannedDevice = {
  ip: '10.1.1.128',
  mac: '00:15:6D:3A:24:C9',
  name: 'INTERNET JAQUELIN AMAYA AMAYA 15M S/50',
  model: 'NanoStation loco M5',
  firmware: 'XM.v6.1.3',
  role: 'sta',
  cachedStats: {
    deviceName: 'INTERNET JAQUELIN AMAYA AMAYA 15M S/50',
    deviceModel: 'NanoStation loco M5',
    firmwareVersion: 'XM.v6.1.3',
    signal: -58,
    noiseFloor: -88,
    ccq: 96,
    frequency: 5500,
    cpuLoad: 22,
    memoryPercent: 68,
    mode: 'sta',
    essid: 'H/Floresta/AP/EQUIDAD/ND-1',
    _rawRoutes: '0.0.0.0 10.1.1.1 0.0.0.0 UG br0',
  },
};

describe('<M5FullInfoModal />', () => {
  it('consulta y muestra datos actuales cuando el equipo no tiene caché local', async () => {
    const loadStats = vi.fn().mockResolvedValue({
      deviceName: 'TORRE OMAR',
      signal: -54,
      ccq: 98,
      cpuLoad: 17,
    });

    render(
      <M5FullInfoModal
        dev={{
          ...device,
          id: '00156D3A24C9',
          nodeId: 'node-1',
          nodeName: 'OMAR/ND1',
          addedAt: Date.now(),
          cachedStats: undefined,
        }}
        onClose={vi.fn()}
        loadStats={loadStats}
      />,
    );

    expect(screen.getByText(/consultando datos actuales/i)).toBeInTheDocument();
    expect(await screen.findAllByText('-54 dBm')).toHaveLength(2);
    expect(loadStats).toHaveBeenCalledWith(expect.objectContaining({ ip: device.ip }));
    expect(screen.queryByText(/sin datos disponibles/i)).not.toBeInTheDocument();
  });

  it('separa datos ordenados, bloques técnicos e historial individual en pestañas', async () => {
    const user = userEvent.setup();
    const history = vi.spyOn(airOsAiApi, 'listDeviceAnalyses').mockResolvedValue({
      success: true,
      analyses: [],
      retentionDays: 7,
    });

    render(
      <M5FullInfoModal
        dev={device}
        onClose={vi.fn()}
        onAnalyzeWithAi={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Datos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Datos técnicos' })).toBeInTheDocument();
    expect(screen.getAllByText('-58 dBm')).toHaveLength(2);
    expect(screen.getByText('H/Floresta/AP/EQUIDAD/ND-1')).not.toHaveClass('truncate');
    expect(screen.queryByText(/0\.0\.0\.0 10\.1\.1\.1/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Datos técnicos' }));
    expect(screen.getByText('Tabla de rutas')).toBeInTheDocument();
    expect(screen.getByText(/0\.0\.0\.0 10\.1\.1\.1/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Historial de resultados' }));

    expect(await screen.findByText('Sin diagnósticos guardados')).toBeInTheDocument();
    expect(screen.getByText(/Se conservan durante 7 días/)).toBeInTheDocument();
    expect(history).toHaveBeenCalledWith(device);
  });
});
