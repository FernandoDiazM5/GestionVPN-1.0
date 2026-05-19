import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onCancel}
      />
      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="bg-rose-100 dark:bg-rose-950/60 p-2.5 rounded-2xl shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base leading-tight">
            {title}
          </h3>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
          {message}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="py-2.5 px-4 rounded-2xl font-semibold text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="py-2.5 px-4 rounded-2xl font-bold text-sm bg-rose-500 hover:bg-rose-400 text-white shadow-md shadow-rose-500/20 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
