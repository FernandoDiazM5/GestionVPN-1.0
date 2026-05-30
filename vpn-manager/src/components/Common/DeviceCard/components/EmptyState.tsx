import { Waves } from 'lucide-react';

export default function EmptyState() {
  return (
    <div className="px-4 pb-6 pt-2 flex flex-col items-center text-center space-y-2">
      <Waves className="w-8 h-8 text-slate-300 dark:text-slate-700 mt-2" />
      <p className="text-slate-500 text-xs">Presiona "Obtener Telemetría" para conectar via SSH</p>
    </div>
  );
}
