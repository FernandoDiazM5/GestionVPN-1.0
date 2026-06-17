export interface AppSettings {
  MT_IP?: string;
  MT_USER?: string;
  MT_PASS?: string;
  /** IP pública WAN del MikroTik core. Global del sistema: la define el
   *  Administrador aquí y se reutiliza (solo-lectura) al crear nodos WireGuard. */
  server_public_ip?: string;
}

export interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  isSaving: boolean;
  successMsg: string;
  errorMsg: string;
}
