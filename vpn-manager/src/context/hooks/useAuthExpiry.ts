import { useEffect } from 'react';

export function useAuthExpiry(handleLogout: () => Promise<void>) {
  useEffect(() => {
    const onAuthExpired = () => {
      console.warn('[AUTH] Token expirado o sesión inválida detectada');
      handleLogout();
    };

    window.addEventListener('auth_expired', onAuthExpired);
    return () => window.removeEventListener('auth_expired', onAuthExpired);
  }, [handleLogout]);
}
