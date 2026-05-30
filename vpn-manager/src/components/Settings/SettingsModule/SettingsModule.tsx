import { useState } from 'react';
import { useLoadSettings, useSaveSettings } from './hooks';
import {
  SettingsTabMenu,
  SettingsHeader,
  SettingsForm,
  SettingsMessages,
  SettingsLoadingState,
} from './components';
import UserManagementModule from '../UserManagementModule';

export default function SettingsModule() {
  const [activeTab, setActiveTab] = useState<'core' | 'users'>('core');
  const loadState = useLoadSettings();
  const saveState = useSaveSettings();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveState.handleSave(loadState.settings);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <SettingsTabMenu activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'users' && <UserManagementModule />}

      {activeTab === 'core' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <SettingsHeader />

          <div className="p-6">
            {loadState.isLoading ? (
              <SettingsLoadingState />
            ) : (
              <>
                <SettingsMessages
                  successMsg={saveState.successMsg}
                  errorMsg={loadState.errorMsg || saveState.errorMsg}
                />

                <SettingsForm
                  settings={loadState.settings}
                  onSettingsChange={loadState.setSettings}
                  onSubmit={handleSave}
                  isSaving={saveState.isSaving}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
