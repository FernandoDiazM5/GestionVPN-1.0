import Dialog from '../Common/Dialog';

interface Props {
  secondsLeft: number | null;
  onContinue: () => Promise<void>;
}

export default function SessionExpiryDialog({ secondsLeft, onContinue }: Props) {
  if (secondsLeft === null) return null;
  return (
    <Dialog title="Tu sesión está por expirar" onClose={() => undefined}
      panelClassName="modal-panel modal-panel-sm" closeOnBackdrop={false} closeOnEscape={false} role="alertdialog">
      <div className="modal-header">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Tu sesión está por expirar</h2>
      </div>
      <div className="modal-body space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Por seguridad, la sesión se cerrará automáticamente. Si deseas seguir trabajando, confirma ahora.
        </p>
        <div className="text-center text-4xl font-bold tabular-nums text-amber-600 dark:text-amber-400" aria-live="polite">
          {secondsLeft}
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn-primary btn-md" onClick={() => { void onContinue(); }} autoFocus>
          Continuar trabajando
        </button>
      </div>
    </Dialog>
  );
}
