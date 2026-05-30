import { useState, useEffect } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { UserInfo } from '../types';
import { MESSAGES } from '../constants';

export function useLoadUsers() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/users/list`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      } else {
        setErrorMsg(data.message);
      }
    } catch (err) {
      setErrorMsg(MESSAGES.LOAD_ERROR);
    }
    setIsLoading(false);
  };

  return {
    users,
    setUsers,
    isLoading,
    errorMsg,
    loadUsers,
  };
}
