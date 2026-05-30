import { Server, Users } from 'lucide-react';
import { TAB_LABELS } from '../constants';

interface SettingsTabMenuProps {
  activeTab: 'core' | 'users';
  onTabChange: (tab: 'core' | 'users') => void;
}

export function SettingsTabMenu({ activeTab, onTabChange }: SettingsTabMenuProps) {
  return (
    <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200">
      <button
        onClick={() => onTabChange('core')}
        className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
          activeTab === 'core'
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-slate-500 hover:bg-slate-50'
        }`}
      >
        <Server className="w-4 h-4" /> {TAB_LABELS.core}
      </button>
      <button
        onClick={() => onTabChange('users')}
        className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
          activeTab === 'users'
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-slate-500 hover:bg-slate-50'
        }`}
      >
        <Users className="w-4 h-4" /> {TAB_LABELS.users}
      </button>
    </div>
  );
}
