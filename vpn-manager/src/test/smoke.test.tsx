// ============================================================
//  smoke.test.tsx — verifica que el runner + jsdom + Testing Library
//  + matchers funcionan. Sin importar nada del proyecto a propósito.
// ============================================================
import { render, screen } from '@testing-library/react';

describe('vitest smoke (frontend)', () => {
  it('expect funciona', () => {
    expect(1 + 1).toBe(2);
  });

  it('jsdom expone window + document', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });

  it('Testing Library + jest-dom matchers funcionan', () => {
    render(<button type="button">Hola test</button>);
    const btn = screen.getByRole('button', { name: 'Hola test' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('matchMedia shim no rompe', () => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    expect(mq.matches).toBe(false);
    expect(typeof mq.addEventListener).toBe('function');
  });
});
