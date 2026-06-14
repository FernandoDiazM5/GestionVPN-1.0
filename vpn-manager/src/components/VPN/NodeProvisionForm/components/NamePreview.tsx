interface NamePreviewProps {
  ifaceName: string;
  vrfName: string;
}

export function NamePreview({ ifaceName, vrfName }: NamePreviewProps) {
  if (!ifaceName || !vrfName) return null;

  return (
    <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 dark:bg-slate-800/60">
      <div>
        <span className="text-3xs font-bold text-slate-400 uppercase tracking-widest">Interfaz SSTP</span>
        <p className="font-mono text-xs font-bold text-indigo-600 mt-0.5">{ifaceName}</p>
      </div>
      <div>
        <span className="text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">VRF</span>
        <p className="font-mono text-xs font-bold text-violet-600 mt-0.5">{vrfName}</p>
      </div>
    </div>
  );
}
