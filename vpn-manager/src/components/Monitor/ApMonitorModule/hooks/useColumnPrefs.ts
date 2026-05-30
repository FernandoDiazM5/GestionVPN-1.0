import { useState } from 'react';
import { loadColPrefs, saveColPrefs, loadApColPrefs, saveApColPrefs } from '../utils/columnDefs';

export function useColumnPrefs() {
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(loadColPrefs);
  const [hiddenApCols, setHiddenApCols] = useState<Set<string>>(loadApColPrefs);

  const handleColChange = (h: Set<string>) => {
    setHiddenCols(h);
    saveColPrefs(h);
  };

  const handleApColChange = (h: Set<string>) => {
    setHiddenApCols(h);
    saveApColPrefs(h);
  };

  return {
    hiddenCols,
    setHiddenCols,
    hiddenApCols,
    setHiddenApCols,
    handleColChange,
    handleApColChange,
  };
}
