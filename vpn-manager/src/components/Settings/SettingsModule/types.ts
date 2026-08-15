export type ScanMode = 'local' | 'vps';

export interface AppSettings {
  /** Bloque privado /22 elegido una sola vez antes de preparar el Core. */
  management_supernet?: string;
  core_provisioned_at?: string;
  MT_IP?: string;
  MT_USER?: string;
  MT_PASS?: string;
  /** IP pública WAN del MikroTik core. Global del sistema: la define el
   *  Administrador aquí y se reutiliza (solo-lectura) al crear nodos WireGuard. */
  server_public_ip?: string;
  /** Puerto del listener SSTP del Core (default 443). Se embebe en el script
   *  sstp-client del CPE como `connect-to=<ip>:<puerto>` al crear nodos SSTP. */
  sstp_port?: string;
  /** Modo global de escaneo de red. 'vps' (default) usa el pool de scan-IPs por
   *  workspace (multi-tenant). 'local' usa una sola IP (local_scan_ip) cuando el
   *  backend corre en el mismo equipo del moderador. */
  scan_mode?: ScanMode;
  /** IP WG de gestión de ESTA máquina — origen del escaneo en modo 'local'. */
  local_scan_ip?: string;
  /** Destinatario de errores inesperados del frontend. Las credenciales SMTP
   *  permanecen exclusivamente en el backend. */
  error_report_email?: string;
  core_wan_interface?: string;
  core_vps_public_key?: string;
  core_backup_enabled?: boolean;
  core_backup_time?: string;
  core_backup_timezone?: string;
  core_backup_password?: string;
}

export interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  isSaving: boolean;
  successMsg: string;
  errorMsg: string;
}
