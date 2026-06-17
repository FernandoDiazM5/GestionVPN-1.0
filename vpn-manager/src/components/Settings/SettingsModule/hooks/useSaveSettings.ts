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
      await saveSetting('MT_IP', settings.MT_IP || '');
      await saveSetting('MT_USER', settings.MT_USER || '');
      await saveSetting('MT_PASS', settings.MT_PASS || '');
      await saveSetting('server_public_ip', settings.server_public_ip || '');
      setSuccessMsg(SETTINGS_MESSAGES.SAVE_SUCCESS);
    } catch (e: any) {
      setErrorMsg(e.message || SETTINGS_MESSAGES.SAVE_ERROR);
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
