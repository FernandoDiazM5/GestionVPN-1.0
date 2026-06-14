import { AlertCircle } from 'lucide-react';

interface ScannerErrorProps {
  message: string;
}

export default function ScannerError({ message }: ScannerErrorProps) {
  return (
    <div className="card p-4 flex items-start space-x-3 border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
      <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
      <p className="text-sm text-rose-600 dark:text-rose-300 font-medium">{message}</p>
    </div>
  );
}
