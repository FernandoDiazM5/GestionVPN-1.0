import { useState } from 'react';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import { SCRIPT_TIMEOUT, TOAST_COPY_DURATION } from '../constants';

export function useScriptGeneration() {
  const [generatedScript, setGeneratedScript] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scriptError, setScriptError] = useState('');

  const handleGenerateScript = async (data: {
    nodeName: string;
    pppUser: string;
    pppPassword: string;
    lanSubnet: string;
    serverPublicIP: string;
  }) => {
    if (!data.pppUser || !data.pppPassword || !data.lanSubnet || !data.serverPublicIP || !data.nodeName) {
      return;
    }

    setIsGenerating(true);
    setGeneratedScript('');
    setScriptError('');

    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/node/script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeName: data.nodeName,
          pppUser: data.pppUser,
          pppPassword: data.pppPassword,
          lanSubnet: data.lanSubnet,
          serverPublicIP: data.serverPublicIP,
        }),
      }, SCRIPT_TIMEOUT);

      const responseData = await res.json();
      if (!res.ok || !responseData.success) {
        throw new Error(responseData.message || 'Error generando script');
      }
      setGeneratedScript(responseData.script);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setScriptError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), TOAST_COPY_DURATION);
  };

  return {
    generatedScript,
    isGenerating,
    copied,
    scriptError,
    handleGenerateScript,
    handleCopy,
  };
}
