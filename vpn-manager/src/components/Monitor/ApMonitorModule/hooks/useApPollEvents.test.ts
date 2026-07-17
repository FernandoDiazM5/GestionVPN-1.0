import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApPollEvents } from './useApPollEvents';

class EventSourceMock {
  static instance: EventSourceMock | null = null;
  listeners = new Map<string, Set<EventListener>>();
  close = vi.fn();

  constructor() {
    EventSourceMock.instance = this;
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: Event = new Event(type)) {
    this.listeners.get(type)?.forEach(listener => listener(event));
  }
}

describe('useApPollEvents', () => {
  it('refleja apertura y reconexión del stream SSE', () => {
    const originalEventSource = globalThis.EventSource;
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      writable: true,
      value: EventSourceMock,
    });

    try {
      const { result, unmount } = renderHook(() => useApPollEvents(vi.fn(), true));
      const source = EventSourceMock.instance;

      expect(result.current).toBe('connecting');
      act(() => source?.emit('open'));
      expect(result.current).toBe('connected');
      act(() => source?.emit('error'));
      expect(result.current).toBe('reconnecting');

      unmount();
      expect(source?.close).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(globalThis, 'EventSource', {
        configurable: true,
        writable: true,
        value: originalEventSource,
      });
    }
  });
});
