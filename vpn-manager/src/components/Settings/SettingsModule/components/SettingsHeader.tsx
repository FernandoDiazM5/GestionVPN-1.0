import { Settings } from 'lucide-react';
import { CARD_HEADER } from '../constants';

export function SettingsHeader() {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-5 dark:border-slate-800 sm:px-6">
      <div className="bg-indigo-50 p-2 rounded-lg dark:bg-indigo-500/15">
        <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{CARD_HEADER.TITLE}</h2>
        <p className="mt-1 text-sm font-medium leading-5 text-slate-500">{CARD_HEADER.SUBTITLE}</p>
      </div>
    </div>
  );
}
