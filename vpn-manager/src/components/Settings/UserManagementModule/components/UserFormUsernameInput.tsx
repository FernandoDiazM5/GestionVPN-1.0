import { LABELS } from '../constants';

interface UserFormUsernameInputProps {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}

export function UserFormUsernameInput({
  value,
  onChange,
  autoFocus,
}: UserFormUsernameInputProps) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        {LABELS.USERNAME}
      </label>
      <input
        autoFocus={autoFocus}
        type="text"
        required
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-field h-11"
        placeholder="juan_operador"
      />
    </div>
  );
}
