import { Loader2 } from 'lucide-react';
import { EMPTY_STATES } from '../constants';

export function UserListLoading() {
  return (
    <tr>
      <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        {EMPTY_STATES.LOADING}
      </td>
    </tr>
  );
}
