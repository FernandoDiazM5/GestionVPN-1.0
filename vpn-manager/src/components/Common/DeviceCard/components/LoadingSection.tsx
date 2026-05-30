import { Loader2 } from 'lucide-react';

interface LoadingSectionProps {
  isLoading: boolean;
}

export default function LoadingSection({ isLoading }: LoadingSectionProps) {
  if (!isLoading) return null;

  return (
    <div className="absolute inset-0 z-10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm flex items-center justify-center transition-all duration-300">
      <div className="bg-white dark:bg-slate-800 px-5 py-3 rounded-2xl flex items-center space-x-3 shadow-2xl border border-slate-200 dark:border-slate-700">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400" />
        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Consultando equipo...</span>
      </div>
    </div>
  );
}
