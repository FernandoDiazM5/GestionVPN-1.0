import { Copy, Check } from 'lucide-react';

interface ScriptOutputProps {
  script: string;
  onCopy: () => void;
  copied: boolean;
}

export function ScriptOutput({ script, onCopy, copied }: ScriptOutputProps) {
  if (!script) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-600">📋 Script para el MikroTik remoto</span>
        <button
          onClick={onCopy}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-600 transition-colors dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
        </button>
      </div>
      <pre className="bg-slate-900 text-emerald-400 rounded-xl p-4 text-2xs leading-relaxed overflow-x-auto max-h-[320px] overflow-y-auto font-mono whitespace-pre">
        {script}
      </pre>
    </div>
  );
}
