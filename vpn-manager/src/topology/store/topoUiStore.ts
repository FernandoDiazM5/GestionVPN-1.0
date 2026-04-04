import { create } from 'zustand';

type SidebarTab = 'topology' | 'profile' | 'infrastructure' | 'tools';

interface TopoUiState {
  viewMode: 'canvas' | 'list';
  selectedDeviceId: string | null;
  selectedLinkId: string | null;
  selectedTowerId: string | null;
  sidebarTab: SidebarTab;
  showAddTowerModal: boolean;
  showImportModal: boolean;
  showAddPTPModal: boolean;
  showTowerSettings: boolean;
  autoSync: boolean;

  setViewMode: (mode: 'canvas' | 'list') => void;
  setSelectedDeviceId: (id: string | null) => void;
  setSelectedLinkId: (id: string | null) => void;
  setSelectedTowerId: (id: string | null) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setShowAddTowerModal: (v: boolean) => void;
  setShowImportModal: (v: boolean) => void;
  setShowAddPTPModal: (v: boolean) => void;
  setShowTowerSettings: (v: boolean) => void;
  setAutoSync: (v: boolean) => void;
}

export const useTopoUiStore = create<TopoUiState>((set) => ({
  viewMode: 'canvas',
  selectedDeviceId: null,
  selectedLinkId: null,
  selectedTowerId: null,
  sidebarTab: 'topology',
  showAddTowerModal: false,
  showImportModal: false,
  showAddPTPModal: false,
  showTowerSettings: false,
  autoSync: true,

  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedDeviceId: (id) => set({ selectedDeviceId: id, selectedLinkId: null }),
  setSelectedLinkId: (id) => set({ selectedLinkId: id, selectedDeviceId: null }),
  setSelectedTowerId: (id) => set({ selectedTowerId: id }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setShowAddTowerModal: (v) => set({ showAddTowerModal: v }),
  setShowImportModal: (v) => set({ showImportModal: v }),
  setShowAddPTPModal: (v) => set({ showAddPTPModal: v }),
  setShowTowerSettings: (v) => set({ showTowerSettings: v }),
  setAutoSync: (v) => set({ autoSync: v }),
}));
