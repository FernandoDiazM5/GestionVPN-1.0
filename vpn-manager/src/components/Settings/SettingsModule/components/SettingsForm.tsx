import { Server, Shield, Key, Save, Loader2 } from 'lucide-react';
import type { AppSettings } from '../types';
import { SETTINGS_LABELS, SETTINGS_PLACEHOLDERS, SETTINGS_HINTS } from '../constants';

interface SettingsFormProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  isSaving: boolean;
}

export function SettingsForm({
  settings,
  onSettingsChange,
  onSubmit,
  isSaving,
}: SettingsFormProps) {
  const handleInputChange = (key: keyof AppSettings, value: string) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            {SETTINGS_LABELS.MT_IP}
          </label>
          <div className="relative">
            <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              required
              value={settings.MT_IP}
              onChange={(e) => handleInputChange('MT_IP', e.target.value)}
              className="input-field pl-10 h-11"
              placeholder={SETTINGS_PLACEHOLDERS.MT_IP}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            {SETTINGS_LABELS.MT_USER}
          </label>
          <div className="relative">
            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              required
              value={settings.MT_USER}
              onChange={(e) => handleInputChange('MT_USER', e.target.value)}
              className="input-field pl-10 h-11"
              placeholder={SETTINGS_PLACEHOLDERS.MT_USER}
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            {SETTINGS_LABELS.MT_PASS}
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              required
              value={settings.MT_PASS}
              onChange={(e) => handleInputChange('MT_PASS', e.target.value)}
              className="input-field pl-10 h-11"
              placeholder={SETTINGS_PLACEHOLDERS.MT_PASS}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2 font-medium">{SETTINGS_HINTS.MT_PASS}</p>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-slate-100">
        <button type="submit" disabled={isSaving} className="btn-primary px-6 py-2.5">
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Guardando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 shrink-0" /> Guardar Cambios
            </>
          )}
        </button>
      </div>
    </form>
  );
}
