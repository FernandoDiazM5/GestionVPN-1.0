import { LABELS, ROLE_OPTIONS } from '../constants';

interface UserFormRoleSelectorProps {
  value: 'admin' | 'operator' | 'viewer';
  onChange: (value: 'admin' | 'operator' | 'viewer') => void;
}

export function UserFormRoleSelector({ value, onChange }: UserFormRoleSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        {LABELS.ROLE}
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {ROLE_OPTIONS.map(role => (
          <label
            key={role.id}
            className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
              value === role.id
                ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                : 'bg-white border-slate-200 hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <input
                type="radio"
                className="hidden"
                name="role"
                checked={value === role.id}
                onChange={() => onChange(role.id as 'admin' | 'operator' | 'viewer')}
              />
              <span className="font-bold text-sm text-slate-800">{role.label}</span>
            </div>
            <span className="text-[11px] font-medium text-slate-500">{role.desc}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
