import { useState, useCallback } from 'react';

interface Toast {
  id: number;
  text: string;
  type: 'warn' | 'info';
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((text: string, type: Toast['type'] = 'warn') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5500);
  }, []);

  return { toasts, setToasts, addToast };
}
