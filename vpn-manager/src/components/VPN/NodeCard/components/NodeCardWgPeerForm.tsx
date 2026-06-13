interface NodeCardWgPeerFormProps {
  showWgPeerForm: boolean;
  rowIndex: number;
  isPending: boolean;
  isThisNodeActive: boolean;
  wgPeerKey: string;
  isSettingPeer: boolean;
  onSetWgPeerKey: (value: string) => void;
  onHandleSetWgPeer: () => void;
  onClosePeerForm: () => void;
}

export function NodeCardWgPeerForm({
  showWgPeerForm,
  rowIndex,
  isPending,
  isThisNodeActive,
  wgPeerKey,
  isSettingPeer,
  onSetWgPeerKey,
  onHandleSetWgPeer,
  onClosePeerForm,
}: NodeCardWgPeerFormProps) {
  if (!showWgPeerForm) return null;

  const rowBg = isThisNodeActive
    ? 'bg-emerald-50/60 dark:bg-emerald-500/10'
    : isPending
      ? 'bg-indigo-50/60 dark:bg-indigo-500/10'
      : rowIndex % 2 === 0
        ? 'bg-white dark:bg-slate-900'
        : 'bg-slate-50/40 dark:bg-slate-800/40';

  return (
    <tr className={rowBg}>
      <td colSpan={7} className="px-4 pb-3 pt-0">
        <div className="ml-10 bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
          <p className="text-2xs font-bold text-violet-700 uppercase tracking-wider">Clave Pública del CPE</p>
          <p className="text-2xs text-violet-500">Obtener con: <span className="font-mono">/interface wireguard print</span></p>
          <textarea
            value={wgPeerKey}
            onChange={e => onSetWgPeerKey(e.target.value)}
            placeholder="Pegar aquí la public key del router torre..."
            className="w-full font-mono text-xs resize-none rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-slate-700 focus:outline-none focus:border-violet-400 dark:bg-slate-800 dark:border-violet-500/40 dark:text-slate-100"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={onHandleSetWgPeer}
              disabled={!wgPeerKey.trim() || isSettingPeer}
              className="btn-accent btn-sm flex-1"
            >
              {isSettingPeer ? 'Configurando...' : 'Configurar Peer'}
            </button>
            <button
              onClick={onClosePeerForm}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
