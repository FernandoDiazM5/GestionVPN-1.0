import { useCallback, useReducer } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { NodeInfo } from '../../types/api';
import type { RouterCredentials } from '../../store/db';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../config';

export function useNodeManagement() {
  const [state, dispatch] = useReducer(nodeManagementReducer, initialState);

  const setNodes = useCallback<Dispatch<SetStateAction<NodeInfo[]>>>((value) => {
    dispatch({ type: 'setNodes', value });
  }, []);
  const setActiveNodeVrf = useCallback<Dispatch<SetStateAction<string | null>>>((value) => {
    dispatch({ type: 'setActiveNodeVrf', value });
  }, []);
  const setTunnelExpiry = useCallback<Dispatch<SetStateAction<number | null>>>((value) => {
    dispatch({ type: 'setTunnelExpiry', value });
  }, []);

  const deactivateAllNodes = useCallback(async (credentials?: RouterCredentials) => {
    if (!credentials) return;
    try {
      await fetchWithTimeout(`${API_BASE_URL}/api/tunnel/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }, 15_000);
    } catch (err) {
      console.error('Error desactivando tunnels:', err);
    }
    dispatch({ type: 'clearTunnel' });
  }, []);

  const removeNodeFromState = useCallback((pppUser: string) => {
    dispatch({ type: 'removeNode', pppUser });
  }, []);

  return {
    nodes: state.nodes,
    setNodes,
    activeNodeVrf: state.activeNodeVrf,
    setActiveNodeVrf,
    tunnelExpiry: state.tunnelExpiry,
    setTunnelExpiry,
    deactivateAllNodes,
    removeNodeFromState,
  };
}

interface NodeManagementState {
  nodes: NodeInfo[];
  activeNodeVrf: string | null;
  tunnelExpiry: number | null;
}

type NodeManagementAction =
  | { type: 'setNodes'; value: SetStateAction<NodeInfo[]> }
  | { type: 'setActiveNodeVrf'; value: SetStateAction<string | null> }
  | { type: 'setTunnelExpiry'; value: SetStateAction<number | null> }
  | { type: 'clearTunnel' }
  | { type: 'removeNode'; pppUser: string };

const initialState: NodeManagementState = {
  nodes: [],
  activeNodeVrf: null,
  tunnelExpiry: null,
};

function resolveStateUpdate<T>(value: SetStateAction<T>, current: T): T {
  return typeof value === 'function'
    ? (value as (previous: T) => T)(current)
    : value;
}

function nodeManagementReducer(
  state: NodeManagementState,
  action: NodeManagementAction
): NodeManagementState {
  switch (action.type) {
    case 'setNodes':
      return { ...state, nodes: resolveStateUpdate(action.value, state.nodes) };
    case 'setActiveNodeVrf':
      return {
        ...state,
        activeNodeVrf: resolveStateUpdate(action.value, state.activeNodeVrf),
      };
    case 'setTunnelExpiry':
      return {
        ...state,
        tunnelExpiry: resolveStateUpdate(action.value, state.tunnelExpiry),
      };
    case 'clearTunnel':
      return { ...state, activeNodeVrf: null, tunnelExpiry: null };
    case 'removeNode': {
      const removedNode = state.nodes.find((node) => node.ppp_user === action.pppUser);
      if (!removedNode) return state;

      const removedActiveNode = state.activeNodeVrf === removedNode.nombre_vrf;
      return {
        ...state,
        nodes: state.nodes.filter((node) => node.ppp_user !== action.pppUser),
        activeNodeVrf: removedActiveNode ? null : state.activeNodeVrf,
        tunnelExpiry: removedActiveNode ? null : state.tunnelExpiry,
      };
    }
  }
}
