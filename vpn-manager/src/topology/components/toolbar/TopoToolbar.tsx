import { useReactFlow } from '@xyflow/react';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw, Trash2, ListTree, Grid } from 'lucide-react';
import { topologyDb } from '../../db/db';
import { useTopoUiStore } from '../../store/topoUiStore';

interface TopoToolbarProps {
  syncing?: boolean;
}

export default function TopoToolbar({ syncing }: TopoToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { viewMode, setViewMode } = useTopoUiStore();

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white shrink-0">
      {/* Left: View & zoom controls */}
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('canvas')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              viewMode === 'canvas' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Grid size={14} />
            Lienzo
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ListTree size={14} />
            Jerarquía
          </button>
        </div>

        {viewMode === 'canvas' && (
          <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
            <button
              onClick={() => zoomIn({ duration: 200 })}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
              title="Acercar"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => zoomOut({ duration: 200 })}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
              title="Alejar"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={() => fitView({ padding: 0.15, duration: 300 })}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
              title="Ajustar vista"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Center: info pill + sync indicator */}
      <div className="flex items-center gap-2">
        <div className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full border border-blue-200">
          Topologia de Red
        </div>
        {syncing && (
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <RefreshCw size={10} className="animate-spin" />
            <span>Sincronizando...</span>
          </div>
        )}
      </div>

      {/* Right: legend + Actions */}
      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <button
          onClick={async () => {
            if (window.confirm('¿Seguro que deseas eliminar TODA la topología ingresada? Esto borrará todas las torres, dispositivos y enlaces manualmente creados.')) {
              await topologyDb.transaction('rw', [topologyDb.towers, topologyDb.devices, topologyDb.links, topologyDb.apCpeGroups], async () => {
                await topologyDb.towers.clear();
                await topologyDb.devices.clear();
                await topologyDb.links.clear();
                await topologyDb.apCpeGroups.clear();
              });
              window.location.reload();
            }
          }}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 rounded-md border border-red-200 transition-colors mr-2 cursor-pointer"
          title="Borrar Topología Completa"
        >
          <Trash2 size={12} />
          Limpiar Todo
        </button>

        <div className="flex items-center gap-1.5">
          <svg width="24" height="6">
            <line x1="0" y1="3" x2="24" y2="3" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          <span>Wireless</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="24" height="6">
            <line x1="0" y1="3" x2="24" y2="3" stroke="#3b82f6" strokeWidth="2" />
          </svg>
          <span>Wired</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="24" height="6">
            <line x1="0" y1="3" x2="24" y2="3" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          <span>No Link</span>
        </div>
      </div>
    </div>
  );
}
