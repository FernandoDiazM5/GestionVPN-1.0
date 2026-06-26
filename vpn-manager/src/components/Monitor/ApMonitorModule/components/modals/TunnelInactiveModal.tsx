import { WifiOff, X } from 'lucide-react';

// Aviso cuando una operación de Monitor AP (sync, detalle de CPE/AP) se rechaza
// con 409 TUNNEL_NOT_ACTIVE: el túnel del nodo no está activo, así que no hay
// ruta hacia sus equipos. Ofrece ir a activarlo.
export function TunnelInactiveModal({ message, onClose, onGoActivate }: {
  message: string;
  onClose: () => void;
  onGoActivate: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
            <WifiOff className="w-4 h-4 text-amber-500" /> Túnel del nodo inactivo
          </h3>
          <button onClick={onClose} aria-label="Cerrar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors dark:hover:text-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          El monitoreo de los equipos requiere el túnel del nodo activo (la ruta hacia su LAN).
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-outline btn-sm">Cerrar</button>
          <button onClick={onGoActivate} className="btn-primary btn-sm">Ir a activar el túnel</button>
        </div>
      </div>
    </div>
  );
}

export default TunnelInactiveModal;
