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
  /** El despliegue opera exclusivamente desde el VPS. */
  scan_mode?: 'vps';
  /** Destinatario de errores inesperados del frontend. Las credenciales SMTP
   *  permanecen exclusivamente en el backend. */
  error_report_email?: string;
  core_wan_interface?: string;
  /** IP privada del MikroTik cuando existe un router/NAT del proveedor delante. */
  core_internal_ip?: string;
  /** Redes CIDR que conservarán acceso local al Core después del cierre público. */
  core_local_networks?: string;
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
