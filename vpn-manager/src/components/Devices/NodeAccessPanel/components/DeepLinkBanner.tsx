// ============================================================
//  DeepLinkBanner — banner de confirmación para deep-links del bot (M1)
//
//  Cuando el usuario llega desde un link del bot Telegram
//  (?activate=VRF-X o ?deactivate=1), el deep-link hook guarda la
//  intención en sessionStorage. Este banner la muestra y pide
//  confirmación humana antes de tocar el router. Pone "Activar ahora"
//  o "Desactivar ahora" como botón explícito — un clic en el panel
//  es auth fuerte (cookie HttpOnly) y representa intención clara.
// ============================================================
import { useEffect, useState } from 'react';
import { Send, X, Power, PowerOff } from 'lucide-react';
import {
  consumePendingActivate,
  consumePendingDeactivate,
} from '../../../../context/hooks/useDeepLinks';

interface DeepLinkBannerProps {
  /** Llamado cuando el usuario confirma Activar (recibe el VRF objetivo). */
  onActivate: (targetVRF: string) => void;
  /** Llamado cuando el usuario confirma Desactivar. */
  onDeactivate: () => void;
}

export function DeepLinkBanner({ onActivate, onDeactivate }: DeepLinkBannerProps) {
  const [activateVrf, setActivateVrf] = useState<string | null>(null);
  const [deactivate, setDeactivate] = useState(false);

  // Consume el flag UNA vez al montar — evita que un refresh
  // re-aplique la acción si el usuario olvidó cancelar antes.
  useEffect(() => {
    setActivateVrf(consumePendingActivate());
    setDeactivate(consumePendingDeactivate());
  }, []);

  if (!activateVrf && !deactivate) return null;

  function confirm() {
    if (activateVrf) onActivate(activateVrf);
    else if (deactivate) onDeactivate();
    setActivateVrf(null);
    setDeactivate(false);
  }

  function cancel() {
    setActivateVrf(null);
    setDeactivate(false);
  }

  return (
    <div className="mb-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-500/10 p-4 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
      <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center shrink-0">
        <Send className="w-4 h-4 text-indigo-600" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {activateVrf
            ? <>El bot de Telegram solicitó activar <code className="font-mono">{activateVrf}</code></>
            : 'El bot de Telegram solicitó desactivar tu túnel'}
        </p>
        <p className="text-xs text-slate-500">Confirma para continuar — la acción la ejecutas desde aquí, no el bot.</p>
      </div>
      <button
        onClick={cancel}
        className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs shrink-0"
        title="Cancelar"
      >
        <X className="w-3.5 h-3.5" /> Cancelar
      </button>
      <button
        onClick={confirm}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs shrink-0 ${activateVrf ? 'btn-success' : 'btn-danger'}`}
      >
        {activateVrf ? <><Power className="w-3.5 h-3.5" /> Activar ahora</> : <><PowerOff className="w-3.5 h-3.5" /> Desactivar ahora</>}
      </button>
    </div>
  );
}

export default DeepLinkBanner;
