import { Search } from 'lucide-react';

export default function EmptyState() {
  return (
    <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
      <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center dark:bg-indigo-500/10">
        <Search className="w-7 h-7 text-indigo-400" />
      </div>
      <p className="text-slate-500 font-medium">Sin datos aún</p>
      <p className="text-slate-500 dark:text-slate-400 text-sm">
        Haz clic en "Escanear Router" para obtener los secretos PPP
      </p>
    </div>
  );
}
