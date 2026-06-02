import { RefreshCw, Search } from 'lucide-react';

interface ScannerHeaderProps {
  isScanning: boolean;
  onScan: () => void;
}

export default function ScannerHeader({ isScanning, onScan }: ScannerHeaderProps) {
  return (
    <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
          <Search className="w-5 h-5 text-indigo-500" />
          <span>Escáner PPP Secrets</span>
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Extrae los secretos configurados desde el router
        </p>
      </div>
      <button
        onClick={onScan}
        disabled={isScanning}
        className="btn-primary px-6 py-3 flex items-center space-x-2 shrink-0"
      >
        <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
        <span>{isScanning ? 'Escaneando...' : 'Escanear Router'}</span>
      </button>
    </div>
  );
}
