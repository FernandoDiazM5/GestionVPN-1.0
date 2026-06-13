interface SSTPInputsProps {
  pppUser: string;
  pppPassword: string;
  onUserChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}

export function SSTPInputs({ pppUser, pppPassword, onUserChange, onPasswordChange }: SSTPInputsProps) {
  return (
    <>
      <div>
        <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Usuario PPP</label>
        <input
          type="text"
          value={pppUser}
          onChange={e => onUserChange(e.target.value)}
          placeholder="TorreEtapa12"
          className="input-field w-full"
        />
      </div>
      <div>
        <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Contraseña PPP</label>
        <input
          type="password"
          value={pppPassword}
          onChange={e => onPasswordChange(e.target.value)}
          placeholder="••••••••"
          className="input-field w-full"
        />
      </div>
    </>
  );
}
