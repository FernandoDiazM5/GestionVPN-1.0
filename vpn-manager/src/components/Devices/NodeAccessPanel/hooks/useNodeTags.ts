import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';

export function useNodeTags() {
  const [nodeTags, setNodeTags] = useState<Record<string, string[]>>({});
  const tagsLoadedRef = useRef(false);

  const saveNodeTags = (pppUser: string, tags: string[]) => {
    setNodeTags(prev => ({ ...prev, [pppUser]: tags }));
    apiFetch(`${API_BASE_URL}/api/node/tag/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pppUser, tags }),
    }).catch(() => {});
  };

  // Cargar tags al montar
  useEffect(() => {
    if (!tagsLoadedRef.current) {
      tagsLoadedRef.current = true;
      apiFetch(`${API_BASE_URL}/api/node/tags`)
        .then(r => r.json())
        .then(d => {
          if (d.success) setNodeTags(d.tags || {});
        })
        .catch(() => {});
    }
  }, []);

  return { nodeTags, setNodeTags, saveNodeTags, tagsLoadedRef };
}
