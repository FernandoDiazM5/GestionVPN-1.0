import { Shield } from 'lucide-react';

interface UserListMessagesProps {
  successMsg: string;
}

export function UserListMessages({ successMsg }: UserListMessagesProps) {
  if (!successMsg) return null;

  return (
    <div className="m-4 p-3 bg-emerald-50 text-emerald-700 text-sm font-bold flex gap-2 rounded-lg">
      <Shield className="w-4 h-4" />
      {successMsg}
    </div>
  );
}
