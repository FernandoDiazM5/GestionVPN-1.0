import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TUNNEL_TIMEOUT_MS } from '../../../../../context';
import AnimatedCountdown from './AnimatedCountdown';

describe('AnimatedCountdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('comienza verde usando el lease real de cinco minutos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T03:00:00Z'));

    render(<AnimatedCountdown expiry={Date.now() + TUNNEL_TIMEOUT_MS} />);

    expect(screen.getByText('5:00')).toHaveClass('text-emerald-700');
    expect(screen.getByText('Tiempo restante')).toBeInTheDocument();
  });

  it('avisa únicamente durante el último cuarto del lease', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T03:00:00Z'));

    render(<AnimatedCountdown expiry={Date.now() + 60_000} />);

    expect(screen.getByText('1:00')).toHaveClass('text-rose-600');
    expect(screen.getByText('Expira pronto')).toBeInTheDocument();
  });
});
