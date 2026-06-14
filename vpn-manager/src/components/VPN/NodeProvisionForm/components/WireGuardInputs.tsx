interface WireGuardInputsProps {
  cpePublicKey: string;
  onCpePublicKeyChange: (value: string) => void;
}

export function WireGuardInputs({ cpePublicKey, onCpePublicKeyChange }: WireGuardInputsProps) {
  return (
    <div className="sm:col-span-2">
      <label className="text-xs font-semibold text-slate-600">Clave Pública WireGuard del CPE</label>
      <textarea
        value={cpePublicKey}
        onChange={e => onCpePublicKeyChange(e.target.value)}
        placeholder="Pega aquí la public key del MikroTik remoto..."
        rows={2}
        className="w-full mt-1 px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg resize-none focus:border-violet-400 outline-none"
      />
      <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">Obtener en el router torre: /interface/wireguard/print</p>
    </div>
  );
}
