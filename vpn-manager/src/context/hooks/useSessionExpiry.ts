import { useCallback, useEffect, useRef, useState } from 'react';
import { accountApi } from '../../services/accountApi';

const WARNING_MS = 30_000;
const STATUS_POLL_MS = 10_000;

export function useSessionExpiry(authenticated: boolean, logout: () => Promise<void>) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const expiresAtRef = useRef<number | null>(null);
  const renewingRef = useRef(false);

  const syncStatus = useCallback(async () => {
    if (!authenticated) return;
    const result = await accountApi.sessionStatus();
    expiresAtRef.current = result.expiresAt;
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) {
      expiresAtRef.current = null;
      setSecondsLeft(null);
      return;
    }
    void syncStatus().catch(() => undefined);
    const poll = window.setInterval(() => { void syncStatus().catch(() => undefined); }, STATUS_POLL_MS);
    const clock = window.setInterval(() => {
      const expiresAt = expiresAtRef.current;
      if (!expiresAt) return;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setSecondsLeft(null);
        void logout();
      } else if (remaining <= WARNING_MS) {
        setSecondsLeft(Math.ceil(remaining / 1000));
      } else {
        setSecondsLeft(null);
      }
    }, 250);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [authenticated, logout, syncStatus]);

  const continueSession = useCallback(async () => {
    if (renewingRef.current) return;
    renewingRef.current = true;
    try {
      const result = await accountApi.renewSession();
      expiresAtRef.current = result.expiresAt;
      setSecondsLeft(null);
    } finally {
      renewingRef.current = false;
    }
  }, []);

  return { secondsLeft, continueSession };
}
