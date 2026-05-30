import { LABELS } from '../constants';

interface UserFormPasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  isEdit: boolean;
}

export function UserFormPasswordInput({
  value,
  onChange,
  isEdit,
}: UserFormPasswordInputProps) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        {LABELS.PASSWORD}
        {isEdit && ` ${LABELS.PASSWORD_OPTIONAL}`}
      </label>
      <input
        type="password"
        required={!isEdit}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-field h-11"
        placeholder="••••••••"
        minLength={6}
      />
    </div>
  );
}
