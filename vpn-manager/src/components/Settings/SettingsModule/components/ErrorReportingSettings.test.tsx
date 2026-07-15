import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorReportingSettings } from './ErrorReportingSettings';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('../../../../utils/apiClient', () => ({
  apiFetch: (...args: unknown[]) => mocks.apiFetch(...args),
}));

const response = (body: object, ok = true) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response;

function Harness() {
  const [email, setEmail] = useState('');
  return <ErrorReportingSettings email={email} onEmailChange={setEmail} />;
}

describe('ErrorReportingSettings', () => {
  beforeEach(() => { mocks.apiFetch.mockReset(); });

  it('guarda el destinatario normalizado', async () => {
    mocks.apiFetch.mockResolvedValue(response({ success: true }));
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Correo de reportes'), 'Alertas@Example.COM');
    await user.click(screen.getByRole('button', { name: 'Guardar correo' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/settings/save'),
      expect.objectContaining({ body: JSON.stringify({ key: 'error_report_email', value: 'alertas@example.com' }) }),
    ));
    expect(await screen.findByText('Destinatario actualizado')).toBeInTheDocument();
  });

  it('guarda y envia un correo de prueba', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(response({ success: true }))
      .mockResolvedValueOnce(response({ success: true, message: 'Correo de prueba enviado' }));
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Correo de reportes'), 'admin@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviar prueba' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Correo de prueba enviado')).toBeInTheDocument();
  });
});
