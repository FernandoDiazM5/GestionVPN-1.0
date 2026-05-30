import { useState, useEffect } from 'react';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../config';

export function useAuthStatus() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    fetchWithTimeout(`${API_BASE_URL}/api/auth/status`, { method: 'GET' }, 5000)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setNeedsSetup(data.needsSetup);
        } else {
          setNeedsSetup(false);
        }
      })
      .catch(() => setNeedsSetup(false));
  }, []);

  return needsSetup;
}
