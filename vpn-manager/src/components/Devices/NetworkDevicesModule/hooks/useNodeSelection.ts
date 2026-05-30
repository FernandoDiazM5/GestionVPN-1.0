import { useState, useCallback } from 'react';

export function useNodeSelection(nodeId?: string) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(nodeId);

  const selectNode = useCallback((id: string | undefined) => {
    setSelectedNodeId(id);
  }, []);

  return { selectedNodeId, selectNode };
}
