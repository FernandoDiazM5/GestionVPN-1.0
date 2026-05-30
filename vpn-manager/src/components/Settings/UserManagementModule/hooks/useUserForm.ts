import { useState } from 'react';
import type { UserInfo, FormState } from '../types';

export function useUserForm() {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [formId, setFormId] = useState<number | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'operator' | 'viewer'>('viewer');

  const openForm = (user?: UserInfo) => {
    if (user) {
      setFormId(user.id);
      setFormUsername(user.username);
      setFormRole(user.role);
      setFormPassword('');
    } else {
      setFormId(null);
      setFormUsername('');
      setFormRole('viewer');
      setFormPassword('');
    }
    setView('form');
  };

  const closeForm = () => {
    setView('list');
    setFormId(null);
    setFormUsername('');
    setFormPassword('');
    setFormRole('viewer');
  };

  const resetForm = () => {
    setFormId(null);
    setFormUsername('');
    setFormPassword('');
    setFormRole('viewer');
  };

  return {
    view,
    setView,
    formId,
    formUsername,
    setFormUsername,
    formPassword,
    setFormPassword,
    formRole,
    setFormRole,
    openForm,
    closeForm,
    resetForm,
  };
}
