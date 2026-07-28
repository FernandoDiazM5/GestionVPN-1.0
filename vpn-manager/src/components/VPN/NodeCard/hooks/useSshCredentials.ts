import { useRef, useState } from 'react';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';

interface SshCred {
  user: string;
  pass: string;
}

export function useSshCredentials(node: NodeInfo) {
  const [showSshForm, setShowSshForm] = useState(false);
  const [sshCredsArr, setSshCredsArr] = useState<SshCred[]>([{ user: '', pass: '' }]);
  const [sshLoading, setSshLoading] = useState(false);
  const [sshSaved, setSshSaved] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const initialCredsRef = useRef(JSON.stringify([{ user: '', pass: '' }]));

  const openSshForm = async () => {
    setShowSshForm(true);
    setShowPasswords(false);
    setSshSaved(false);
    let nextCreds: SshCred[] = [{ user: '', pass: '' }];
    try {
      const r = await fetchWithTimeout(`${API_BASE_URL}/api/node/ssh-creds/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user }),
      }, 5_000);
      const d = await r.json();
      if (d.success && Array.isArray(d.creds) && d.creds.length > 0) nextCreds = d.creds;
    } catch { /* sin creds previas */ }
    setSshCredsArr(nextCreds);
    initialCredsRef.current = JSON.stringify(nextCreds);
  };

  const saveSshCreds = async () => {
    const valid = sshCredsArr.filter(c => c.user.trim());
    setSshLoading(true);
    try {
      await fetchWithTimeout(`${API_BASE_URL}/api/node/ssh-creds/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user, creds: valid }),
      }, 5_000);
      initialCredsRef.current = JSON.stringify(sshCredsArr);
      setSshSaved(true);
      setTimeout(() => setSshSaved(false), 2000);
    } catch { /* ignorar */ }
    setSshLoading(false);
  };

  const updateCred = (i: number, field: 'user' | 'pass', value: string) => {
    const next = [...sshCredsArr];
    next[i] = { ...next[i], [field]: value };
    setSshCredsArr(next);
  };

  const removeCred = (i: number) => setSshCredsArr(sshCredsArr.filter((_, idx) => idx !== i));
  const closeSshForm = () => {
    if (
      JSON.stringify(sshCredsArr) !== initialCredsRef.current
      && !window.confirm('Hay cambios sin guardar. ¿Deseas cerrar esta ventana?')
    ) return;
    setShowSshForm(false);
    setShowPasswords(false);
  };

  return {
    showSshForm,
    sshCredsArr,
    setSshCredsArr,
    sshLoading,
    sshSaved,
    showPasswords,
    setShowPasswords,
    openSshForm,
    closeSshForm,
    saveSshCreds,
    updateCred,
    removeCred,
  };
}
