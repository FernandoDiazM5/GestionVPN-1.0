import { Loader2 } from 'lucide-react';

export function SettingsLoadingState() {
  return (
    <div className="flex justify-center items-center h-48">
      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );
}
