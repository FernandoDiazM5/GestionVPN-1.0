import { useState } from 'react';
import type { NodeInfo } from '../../../../types/api';

export function useNodeModals() {
  const [showNuevoNodo, setShowNuevoNodo] = useState(false);
  const [showBatchCsv, setShowBatchCsv] = useState(false);
  const [editNode, setEditNode] = useState<NodeInfo | null>(null);
  const [deleteNode, setDeleteNode] = useState<NodeInfo | null>(null);
  const [scriptNode, setScriptNode] = useState<NodeInfo | null>(null);
  const [historyNode, setHistoryNode] = useState<NodeInfo | null>(null);
  const [tagNode, setTagNode] = useState<NodeInfo | null>(null);

  return {
    showNuevoNodo,
    setShowNuevoNodo,
    showBatchCsv,
    setShowBatchCsv,
    editNode,
    setEditNode,
    deleteNode,
    setDeleteNode,
    scriptNode,
    setScriptNode,
    historyNode,
    setHistoryNode,
    tagNode,
    setTagNode,
  };
}
