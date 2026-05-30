import type { UserInfo } from '../types';
import { TABLE_HEADERS } from '../constants';
import { UserListLoading } from './UserListLoading';
import { UserListEmpty } from './UserListEmpty';
import { UserListRow } from './UserListRow';

interface UserListTableProps {
  users: UserInfo[];
  isLoading: boolean;
  currentUsername?: string;
  onEdit: (user: UserInfo) => void;
  onDelete: (user: UserInfo) => void;
  isActioning: boolean;
}

export function UserListTable({
  users,
  isLoading,
  currentUsername,
  onEdit,
  onDelete,
  isActioning,
}: UserListTableProps) {
  return (
    <div className="p-0 overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100 uppercase text-[10px] font-extrabold text-slate-500 tracking-wider">
            <th className="px-6 py-3">{TABLE_HEADERS.USERNAME}</th>
            <th className="px-6 py-3">{TABLE_HEADERS.ROLE}</th>
            <th className="px-6 py-3">{TABLE_HEADERS.CREATED_AT}</th>
            <th className="px-6 py-3 text-right">{TABLE_HEADERS.ACTIONS}</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <UserListLoading />
          ) : users.length === 0 ? (
            <UserListEmpty />
          ) : (
            users.map(u => (
              <UserListRow
                key={u.id}
                user={u}
                currentUsername={currentUsername}
                onEdit={onEdit}
                onDelete={onDelete}
                isActioning={isActioning}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
