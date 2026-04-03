import { create } from 'zustand';

type SidebarTab = 'topology' | 'profile' | 'infrastructure' | 'tools';

interface TopoUiState {
  selectedDeviceId: string | null;
  selectedLinkId: string | null;
  sidebarTab: SidebarTab;
  showAddTowerModal: boolean;
  showImportModal: boolean;
  showAddPTPModal: boolean;

  setSelectedDeviceId: (id: string | null) => void;
  setSelectedLinkId: (id: string | null) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setShowAddTowerModal: (v: boolean) => void;
  setShowImportModal: (v: boolean) => void;
  setShowAddPTPModal: (v: boolean) => void;
}

export const useTopoUiStore = create<TopoUiState>((set) => ({
  selectedDeviceId: null,
  selectedLinkId: null,
  sidebarTab: 'topology',
  showAddTowerModal: false,
  showImportModal: false,
  showAddPTPModal: false,

  setSelectedDeviceId: (id) => set({ selectedDeviceId: id, selectedLinkId: null }),
  setSelectedLinkId: (id) => set({ selectedLinkId: id, selectedDeviceId: null }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setShowAddTowerModal: (v) => set({ showAddTowerModal: v }),
  setShowImportModal: (v) => set({ showImportModal: v }),
  setShowAddPTPModal: (v) => set({ showAddPTPModal: v }),
}));
