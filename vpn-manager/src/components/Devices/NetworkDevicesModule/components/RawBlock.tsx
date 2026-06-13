import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function RawBlock({ title, content, icon }: { title: string; content: string | null | undefined; icon?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!content || !content.trim()) return null;
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden dark:border-slate-700">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left dark:bg-slate-800/60 dark:hover:bg-slate-800">
        <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
          {icon}{title}
        </span>
        <div className="flex items-center gap-2">
          {!open && <span className="text-[9px] text-slate-400">ver</span>}
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="relative">
          <button onClick={() => navigator.clipboard?.writeText(content)}
            className="absolute right-2 top-2 text-[9px] font-bold text-indigo-500 hover:text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200 z-10 dark:bg-slate-900 dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:text-indigo-300">
            Copiar
          </button>
          <pre className="p-3 text-[9px] font-mono text-slate-600 bg-slate-50 overflow-x-auto max-h-72 leading-relaxed whitespace-pre-wrap break-all dark:bg-slate-900 dark:text-slate-300">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
