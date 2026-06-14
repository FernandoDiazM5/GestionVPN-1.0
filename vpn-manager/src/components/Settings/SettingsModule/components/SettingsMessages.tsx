import { Shield } from 'lucide-react';

interface SettingsMessagesProps {
  successMsg: string;
  errorMsg: string;
}

export function SettingsMessages({ successMsg, errorMsg }: SettingsMessagesProps) {
  return (
    <>
      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 font-medium text-sm flex gap-2 items-center dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30">
          <Shield className="w-4 h-4 shrink-0" /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 font-medium text-sm dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30">
          {errorMsg}
        </div>
      )}
    </>
  );
}
