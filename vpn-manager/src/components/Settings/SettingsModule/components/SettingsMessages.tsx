import { Shield } from 'lucide-react';

interface SettingsMessagesProps {
  successMsg: string;
  errorMsg: string;
}

export function SettingsMessages({ successMsg, errorMsg }: SettingsMessagesProps) {
  return (
    <>
      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 font-medium text-sm flex gap-2 items-center">
          <Shield className="w-4 h-4 shrink-0" /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 font-medium text-sm">
          {errorMsg}
        </div>
      )}
    </>
  );
}
