import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SecretsPaginationProps {
  currentPage: number;
  totalPages: number;
  totalSecrets: number;
  onPageChange: (page: number) => void;
}

export default function SecretsPagination({
  currentPage,
  totalPages,
  totalSecrets,
  onPageChange,
}: SecretsPaginationProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-900/60">
      <span className="text-xs text-slate-400">
        Página {currentPage} de {totalPages} · {totalSecrets} secretos
      </span>
      <div className="flex items-center space-x-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors dark:text-slate-500 dark:hover:text-indigo-400 dark:hover:bg-indigo-500/10"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white min-w-[2rem] text-center">
          {currentPage}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors dark:text-slate-500 dark:hover:text-indigo-400 dark:hover:bg-indigo-500/10"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
