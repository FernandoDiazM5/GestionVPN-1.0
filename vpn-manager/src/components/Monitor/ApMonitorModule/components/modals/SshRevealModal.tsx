import { useState } from 'react';
import { KeyRound, Eye, EyeOff, Copy, X } from 'lucide-react';

// Muestra la credencial SSH guardada del AP (la que autenticó la antena),
// pedida bajo clic explícito a /api/ap-monitor/reveal-ssh. La contraseña arranca
// enmascarada; se revela/copia a voluntad.
export function SshRevealModal({ data, onClose }: {
  data: { apName: string; user: string; pass: string; port: number };
  onClose: () => void;
}) {
  const [show, setShow] = useState(false);
  const copy = (text: string) => { navigator.clipboard?.writeText(text).catch(() => { /* noop */ }); };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel modal-panel-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
              <KeyRound className="w-4 h-4 text-indigo-500" /> Clave SSH del AP
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={data.apName}>{data.apName}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="btn-ghost btn-icon"><X className="w-4 h-4" /></button>
        </div>

        <div className="modal-body space-y-3">
          <div>
            <label className="text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Usuario</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="data-cell flex-1 truncate">{data.user || '—'}</code>
              <button onClick={() => copy(data.user)} aria-label="Copiar usuario" title="Copiar" className="btn-ghost btn-icon"><Copy className="w-4 h-4" /></button>
            </div>
          </div>

          <div>
            <label className="text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Contraseña</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="data-cell flex-1 truncate">{show ? (data.pass || '—') : '••••••••'}</code>
              <button onClick={() => setShow(s => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={show ? 'Ocultar' : 'Mostrar'} className="btn-ghost btn-icon">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={() => copy(data.pass)} aria-label="Copiar contraseña" title="Copiar" className="btn-ghost btn-icon"><Copy className="w-4 h-4" /></button>
            </div>
          </div>

          <div>
            <label className="text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Puerto</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="data-cell flex-1 truncate">{String(data.port)}</code>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-outline btn-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export default SshRevealModal;
