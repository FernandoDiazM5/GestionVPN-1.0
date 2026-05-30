import { AlertCircle } from 'lucide-react';

interface ScannerErrorProps {
  message: string;
}

export default function ScannerError({ message }: ScannerErrorProps) {
  return (
    <div className="card p-4 flex items-start space-x-3 border-red-200 bg-red-50">
      <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
      <p className="text-sm text-red-600 font-medium">{message}</p>
    </div>
  );
}
