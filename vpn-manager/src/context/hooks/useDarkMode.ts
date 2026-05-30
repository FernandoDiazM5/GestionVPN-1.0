import { useState, useEffect } from 'react';
import { LS_DARK_MODE } from '../constants';

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem(LS_DARK_MODE);
    return stored !== null ? stored === 'true' : false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem(LS_DARK_MODE, String(darkMode));
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  return {
    darkMode,
    toggleDarkMode,
  };
}
