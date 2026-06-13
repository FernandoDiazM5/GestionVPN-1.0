interface ProtocolSelectorProps {
  protocol: 'sstp' | 'wireguard';
  onProtocolChange: (protocol: 'sstp' | 'wireguard') => void;
}

export function ProtocolSelector({ protocol, onProtocolChange }: ProtocolSelectorProps) {
  return (
    <div>
      <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Protocolo</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onProtocolChange('sstp')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
            protocol === 'sstp'
              ? 'bg-sky-50 border-sky-400 text-sky-700 dark:bg-sky-500/10 dark:border-sky-500/50 dark:text-sky-400'
              : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500 dark:hover:border-slate-600'
          }`}
        >
          SSTP
        </button>
        <button
          type="button"
          onClick={() => onProtocolChange('wireguard')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
            protocol === 'wireguard'
              ? 'bg-violet-50 border-violet-400 text-violet-700 dark:bg-violet-500/10 dark:border-violet-500/50 dark:text-violet-400'
              : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500 dark:hover:border-slate-600'
          }`}
        >
          WireGuard
        </button>
      </div>
    </div>
  );
}
