import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../Settings/ModeratorSettings/tabs/TelegramForums', () => ({
  default: ({ standalone }: { standalone?: boolean }) => <div data-testid="telegram-forums">standalone:{String(standalone)}</div>,
}));

import ClientHistoryModule from './ClientHistoryModule';

describe('ClientHistoryModule', () => {
  it('monta la administración de Telegram como módulo independiente', () => {
    render(<ClientHistoryModule />);
    expect(screen.getByTestId('telegram-forums')).toHaveTextContent('standalone:true');
  });
});
