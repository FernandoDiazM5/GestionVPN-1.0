import { Settings } from 'lucide-react';
import { CARD_HEADER } from '../constants';

export function SettingsHeader() {
  return (
    <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
      <div className="bg-indigo-50 p-2 rounded-lg">
        <Settings className="w-5 h-5 text-indigo-600" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{CARD_HEADER.TITLE}</h2>
        <p className="text-sm text-slate-500 font-medium">{CARD_HEADER.SUBTITLE}</p>
      </div>
    </div>
  );
}
