import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface SyncStatusMessageProps {
  syncStatus: 'idle' | 'loading' | 'success' | 'error';
  errorDetail: string;
}

export function SyncStatusMessage({ syncStatus, errorDetail }: SyncStatusMessageProps) {
  if (syncStatus === 'idle') {
    return null;
  }

  return (
    <div className="mb-6">
      {syncStatus === 'loading' && (
        <div className="flex items-center space-x-3 px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100">
          <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-indigo-700">Autenticando...</p>
          </div>
        </div>
      )}
      {syncStatus === 'success' && (
        <div className="flex items-center space-x-3 px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-sm font-semibold text-emerald-700">¡Conexión exitosa! Entrando...</p>
        </div>
      )}
      {syncStatus === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start space-x-3 px-4 py-3 bg-red-50 rounded-xl border border-red-100">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700">Error de conexión</p>
              <p className="text-xs text-red-500 mt-0.5">{errorDetail}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
