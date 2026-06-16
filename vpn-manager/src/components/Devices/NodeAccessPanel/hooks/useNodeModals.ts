import { useState } from 'react';
import type { NodeInfo } from '../../../../types/api';

type ModalKind = 'edit' | 'delete' | 'script' | 'history' | 'tag';

/**
 * Estado de los modales de fila de la tabla de nodos.
 *
 * Garantía: **un solo modal de nodo abierto a la vez**. Antes cada modal tenía
 * su propio `useState`, así que abrir una segunda acción dejaba ambos montados
 * (modales apilados). Ahora hay un único `active` y los setters son
 * mutuamente excluyentes; la API pública (editNode/setEditNode/…) no cambia.
 */
export function useNodeModals() {
  const [showNuevoNodo, setShowNuevoNodo] = useState(false);
  const [showBatchCsv, setShowBatchCsv] = useState(false);
  const [active, setActive] = useState<{ kind: ModalKind; node: NodeInfo } | null>(null);

  // setter(node)  → abre ese modal y cierra cualquier otro.
  // setter(null)  → cierra solo si el activo es de ese tipo (semántica onClose).
  const setterFor = (kind: ModalKind) => (n: NodeInfo | null) =>
    setActive(n ? { kind, node: n } : (prev => (prev?.kind === kind ? null : prev)));

  return {
    showNuevoNodo,
    setShowNuevoNodo,
    showBatchCsv,
    setShowBatchCsv,
    editNode: active?.kind === 'edit' ? active.node : null,
    setEditNode: setterFor('edit'),
    deleteNode: active?.kind === 'delete' ? active.node : null,
    setDeleteNode: setterFor('delete'),
    scriptNode: active?.kind === 'script' ? active.node : null,
    setScriptNode: setterFor('script'),
    historyNode: active?.kind === 'history' ? active.node : null,
    setHistoryNode: setterFor('history'),
    tagNode: active?.kind === 'tag' ? active.node : null,
    setTagNode: setterFor('tag'),
  };
}
