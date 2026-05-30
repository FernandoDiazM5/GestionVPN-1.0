import { useState, useRef, useEffect } from 'react';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';

export function useNodeNameEdit(node: NodeInfo, onRename?: (newName: string) => void) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const startEditName = () => {
    setNameInput(node.nombre_nodo || '');
    setEditingName(true);
  };

  const cancelEditName = () => setEditingName(false);

  const saveNodeName = async () => {
    if (!nameInput.trim() || nameInput.trim() === node.nombre_nodo || savingName) return;
    const newName = nameInput.trim();
    const originalName = node.nombre_nodo;
    onRename?.(newName);
    setEditingName(false);
    setSavingName(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/label/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, label: newName }),
      }, 5_000);
      const d = await r.json();
      if (!d.success) onRename?.(originalName);
    } catch (_) {
      onRename?.(originalName);
    }
    setSavingName(false);
  };

  return {
    editingName,
    nameInput,
    savingName,
    nameInputRef,
    setNameInput,
    startEditName,
    cancelEditName,
    saveNodeName,
  };
}
