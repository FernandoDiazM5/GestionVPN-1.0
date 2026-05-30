import { Users, UserPlus } from 'lucide-react';
import { HEADERS, BUTTON_LABELS } from '../constants';

interface UserListHeaderProps {
  onInvite: () => void;
}

export function UserListHeader({ onInvite }: UserListHeaderProps) {
  return (
    <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-50 p-2 rounded-lg">
          <Users className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">{HEADERS.LIST_TITLE}</h2>
          <p className="text-sm text-slate-500 font-medium">{HEADERS.LIST_SUBTITLE}</p>
        </div>
      </div>
      <button onClick={onInvite} className="btn-primary text-xs py-2 px-3">
        <UserPlus className="w-3.5 h-3.5" />
        <span>{BUTTON_LABELS.INVITE}</span>
      </button>
    </div>
  );
}
