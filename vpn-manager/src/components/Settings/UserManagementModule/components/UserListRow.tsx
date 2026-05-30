import { Trash2 } from 'lucide-react';
import type { UserInfo } from '../types';
import { BUTTON_LABELS, ROLE_STYLES } from '../constants';

interface UserListRowProps {
  user: UserInfo;
  currentUsername?: string;
  onEdit: (user: UserInfo) => void;
  onDelete: (user: UserInfo) => void;
  isActioning: boolean;
}

export function UserListRow({
  user,
  currentUsername,
  onEdit,
  onDelete,
  isActioning,
}: UserListRowProps) {
  const roleStyle = ROLE_STYLES[user.role];

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/50">
      <td className="px-6 py-3 font-bold text-slate-800 text-sm flex items-center gap-2">
        {user.username === currentUsername && (
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Eres tú" />
        )}
        {user.username}
      </td>
      <td className="px-6 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${roleStyle.bg} ${roleStyle.text}`}
        >
          {user.role}
        </span>
      </td>
      <td className="px-6 py-3 text-xs text-slate-500 font-medium whitespace-nowrap">
        {new Date(user.created_at).toLocaleDateString()}
      </td>
      <td className="px-6 py-3 text-right space-x-2 whitespace-nowrap">
        <button
          onClick={() => onEdit(user)}
          disabled={isActioning}
          className="p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 rounded-lg transition-colors font-semibold text-xs inline-flex items-center"
        >
          {BUTTON_LABELS.EDIT}
        </button>
        <button
          onClick={() => onDelete(user)}
          disabled={isActioning}
          className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
