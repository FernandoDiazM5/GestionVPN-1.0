import { useState, useEffect } from 'react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';

export function useServerSettings() {
  const [globalServerIP, setGlobalServerIP] = useState(() =>
    localStorage.getItem('server_public_ip') || ''
  );
  const [editingGlobalIP, setEditingGlobalIP] = useState(false);
  const [serverPublicKey, setServerPublicKey] = useState('');
  const [serverListenPort, setServerListenPort] = useState('');
  const [serverEndpointIP, setServerEndpointIP] = useState(() =>
    localStorage.getItem('wg_endpoint_ip') || ''
  );

  // Cargar IP del servidor SSTP desde la base de datos al iniciar
  useEffect(() => {
    apiFetch(`${API_BASE_URL}/api/settings/get`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.settings?.server_public_ip) {
          const ip = d.settings.server_public_ip;
          setGlobalServerIP(ip);
          localStorage.setItem('server_public_ip', ip);
        }
      })
      .catch(() => {});
  }, []);

  return {
    globalServerIP,
    setGlobalServerIP,
    editingGlobalIP,
    setEditingGlobalIP,
    serverPublicKey,
    setServerPublicKey,
    serverListenPort,
    setServerListenPort,
    serverEndpointIP,
    setServerEndpointIP,
  };
}
