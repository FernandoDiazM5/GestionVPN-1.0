import { useState } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { AppSettings } from '../types';
import { SETTINGS_MESSAGES } from '../constants';

export function useSaveSettings() {
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const saveSetting = async (key: string, value: string) => {
    const resp = await apiFetch(`${API_BASE_URL}/api/settings/save`, {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.message || SETTINGS_MESSAGES.SAVE_ERROR);
  };

  const handleSave = async (settings: AppSettings) => {
    setIsSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const writes = [
        saveSetting('MT_IP', settings.MT_IP || ''),
        saveSetting('MT_USER', settings.MT_USER || ''),
        saveSetting('MT_PASS', settings.MT_PASS || ''),
        saveSetting('server_public_ip', settings.server_public_ip || ''),
        saveSetting('sstp_port', settings.sstp_port || ''),
        saveSetting('core_wan_interface', settings.core_wan_interface || ''),
        saveSetting('core_internal_ip', settings.core_internal_ip || ''),
        saveSetting('core_local_networks', settings.core_local_networks || ''),
        saveSetting('core_vps_public_key', settings.core_vps_public_key || ''),
        saveSetting('core_backup_enabled', String(settings.core_backup_enabled ?? false)),
        saveSetting('core_backup_time', settings.core_backup_time || '02:00'),
        saveSetting('core_backup_timezone', settings.core_backup_timezone || 'America/Lima'),
        saveSetting('core_backup_password', settings.core_backup_password || ''),
      ];
      if (settings.management_supernet) writes.push(saveSetting('management_supernet', settings.management_supernet));
      await Promise.all(writes);
      setSuccessMsg(SETTINGS_MESSAGES.SAVE_SUCCESS);
      return true;
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : SETTINGS_MESSAGES.SAVE_ERROR);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    successMsg,
    errorMsg,
    handleSave,
  };
}
