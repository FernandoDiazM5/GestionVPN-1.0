import { useState } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { UserInfo } from '../types';
import { MESSAGES } from '../constants';

interface UseUserActionsProps {
  currentUsername?: string;
}

export function useUserActions({ currentUsername }: UseUserActionsProps = {}) {
  const [isActioning, setIsActioning] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleDelete = async (user: UserInfo, allUsers: UserInfo[]): Promise<boolean> => {
    if (user.role === 'admin' && allUsers.filter(u => u.role === 'admin').length === 1) {
      alert(MESSAGES.DELETE_ADMIN_ONLY);
      return false;
    }
    if (user.username === currentUsername) {
      alert(MESSAGES.DELETE_CURRENT_USER);
      return false;
    }
    if (!confirm(`${MESSAGES.DELETE_CONFIRM} ${user.username}?`)) return false;

    setIsActioning(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/users/delete`, {
        method: 'POST',
        body: JSON.stringify({ id: user.id }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        setErrorMsg('');
        return true;
      } else {
        alert(data.message);
        return false;
      }
    } catch (e: any) {
      alert(e.message);
      return false;
    } finally {
      setIsActioning(false);
    }
  };

  const handleSave = async (formData: {
    id: number | null;
    username: string;
    password: string;
    role: 'admin' | 'operator' | 'viewer';
  }): Promise<boolean> => {
    setIsActioning(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const endpoint = formData.id
        ? `${API_BASE_URL}/api/users/edit`
        : `${API_BASE_URL}/api/users/add`;
      const payload: any = {
        username: formData.username,
        role: formData.role,
      };
      if (formData.id) payload.id = formData.id;
      if (formData.password) payload.password = formData.password;

      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg(data.message);
        setErrorMsg('');
        return true;
      } else {
        setErrorMsg(data.message || MESSAGES.VALIDATION_ERROR);
        return false;
      }
    } catch (e: any) {
      setErrorMsg(e.message || MESSAGES.NETWORK_ERROR);
      return false;
    } finally {
      setIsActioning(false);
    }
  };

  return {
    isActioning,
    successMsg,
    errorMsg,
    setSuccessMsg,
    setErrorMsg,
    handleDelete,
    handleSave,
  };
}
