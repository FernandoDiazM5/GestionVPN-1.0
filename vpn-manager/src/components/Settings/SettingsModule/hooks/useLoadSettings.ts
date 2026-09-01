import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { AppSettings } from '../types';
import { SETTINGS_MESSAGES } from '../constants';

export function useLoadSettings() {
  const [settings, setSettings] = useState<AppSettings>({ MT_IP: '', MT_USER: '', MT_PASS: '', management_supernet: '10.12.248.0/22', server_public_ip: '', sstp_port: '', scan_mode: 'vps', error_report_email: '', core_wan_interface: '', core_internal_ip: '', core_local_networks: '', core_vps_public_key: '', core_backup_enabled: false, core_backup_time: '02:00', core_backup_timezone: 'America/Lima', core_backup_password: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/settings/get`);
      const data = await response.json();
      if (data.success && data.settings) {
        setSettings({
          MT_IP: data.settings.MT_IP || '',
          MT_USER: data.settings.MT_USER || '',
          MT_PASS: data.settings.MT_PASS || '',
          management_supernet: data.settings.management_supernet || (data.settings.core_provisioned_at ? '' : '10.12.248.0/22'),
          core_provisioned_at: data.settings.core_provisioned_at || '',
          server_public_ip: data.settings.server_public_ip || '',
          sstp_port: data.settings.sstp_port || '',
          scan_mode: 'vps',
          error_report_email: data.settings.error_report_email || '',
          core_wan_interface: data.settings.core_wan_interface || '',
          core_internal_ip: data.settings.core_internal_ip || '',
          core_local_networks: data.settings.core_local_networks || '',
          core_vps_public_key: data.settings.core_vps_public_key || '',
          core_backup_enabled: data.settings.core_backup_enabled === 'true',
          core_backup_time: data.settings.core_backup_time || '02:00',
          core_backup_timezone: data.settings.core_backup_timezone || 'America/Lima',
          core_backup_password: data.settings.core_backup_password || '',
        });
      } else {
        setErrorMsg(SETTINGS_MESSAGES.LOAD_ERROR);
      }
    } catch (error) {
      setErrorMsg(SETTINGS_MESSAGES.NETWORK_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  return {
    settings,
    setSettings,
    isLoading,
    errorMsg,
    loadSettings,
  };
}
