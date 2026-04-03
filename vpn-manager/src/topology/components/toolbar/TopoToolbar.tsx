import { useReactFlow } from '@xyflow/react';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw } from 'lucide-react';

interface TopoToolbarProps {
  syncing?: boolean;
}

export default function TopoToolbar({ syncing }: TopoToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white shrink-0">
      {/* Left: zoom controls */}
      <div className="flex items-center gap-1">
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

      {/* Right: legend */}
      <div className="flex items-center gap-4 text-[11px] text-slate-500">
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
