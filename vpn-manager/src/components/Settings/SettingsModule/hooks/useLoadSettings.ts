import { useState, useEffect } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { AppSettings } from '../types';
import { SETTINGS_MESSAGES } from '../constants';

export function useLoadSettings() {
  const [settings, setSettings] = useState<AppSettings>({ MT_IP: '', MT_USER: '', MT_PASS: '', server_public_ip: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/settings/get`);
      const data = await response.json();
      if (data.success && data.settings) {
        setSettings({
          MT_IP: data.settings.MT_IP || '',
          MT_USER: data.settings.MT_USER || '',
          MT_PASS: data.settings.MT_PASS || '',
          server_public_ip: data.settings.server_public_ip || '',
        });
      } else {
        setErrorMsg(SETTINGS_MESSAGES.LOAD_ERROR);
      }
    } catch (error) {
      setErrorMsg(SETTINGS_MESSAGES.NETWORK_ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    settings,
    setSettings,
    isLoading,
    errorMsg,
    loadSettings,
  };
}
