import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import AuditTimeline from './AuditTimeline';

vi.mock('../../../../services/auditApi', () => ({
  auditApi: { exportLogs: vi.fn() },
  downloadBlob: vi.fn(),
}));

describe('AuditTimeline export', () => {
  it('ofrece PDF junto con CSV y JSON', async () => {
    const user = userEvent.setup();
    render(<AuditTimeline logs={[]} />);

    await user.click(screen.getByRole('button', { name: /exportar/i }));

    expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();
    expect(screen.getByText(/registros anteriores a 7 días se eliminan automáticamente/i)).toBeInTheDocument();
  });
});
