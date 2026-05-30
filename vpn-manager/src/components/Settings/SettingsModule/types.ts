export interface AppSettings {
  MT_IP?: string;
  MT_USER?: string;
  MT_PASS?: string;
}

export interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  isSaving: boolean;
  successMsg: string;
  errorMsg: string;
}
