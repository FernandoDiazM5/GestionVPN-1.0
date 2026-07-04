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
      <div className="modal-panel modal-panel-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <WifiOff className="w-4 h-4 text-amber-500" /> Túnel del nodo inactivo
          </h3>
          <button onClick={onClose} aria-label="Cerrar" className="btn-ghost btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body">
          <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            El monitoreo de los equipos requiere el túnel del nodo activo (la ruta hacia su LAN).
          </p>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-outline btn-sm">Cerrar</button>
          <button onClick={onGoActivate} className="btn-primary btn-sm">Ir a activar el túnel</button>
        </div>
      </div>
    </div>
  );
}

export default TunnelInactiveModal;
