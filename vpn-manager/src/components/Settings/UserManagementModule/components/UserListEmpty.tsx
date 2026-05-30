import { EMPTY_STATES } from '../constants';

export function UserListEmpty() {
  return (
    <tr>
      <td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-sm font-medium">
        {EMPTY_STATES.NO_USERS}
      </td>
    </tr>
  );
}
