// ============================================================
//  useDeviceLibrary — biblioteca local de SavedDevice + toast
//
//  Encapsula:
//   - Carga inicial desde IndexedDB (deviceDb)
//   - savedIds (Set para lookup O(1) en la tabla)
//   - handleAddDevice / handleRemoveDevice / handleUpdateDevice
//   - handleDirectSave (guardado rápido con creds SSH ya validadas)
//   - toast no bloqueante con auto-dismiss a 4s
//
//  El hook NO toca scanResults; el orquestador pasa setScanResults
//  para que CRUDs específicos puedan reflejarse en la tabla en vivo.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { deviceDb, type DevicePersistenceError } from '../../../../store/deviceDb';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import type { ScannedDevice, SavedDevice } from '../../../../types/devices';
import type { NodeInfo } from '../../../../types/api';
import type { SshAuthStatus } from '../types';
import { ipInCidr } from '../constants';
import { API_BASE_URL } from '../../../../config';

interface UseDeviceLibraryInput {
  nodesLength: number;
  setScanResults: React.Dispatch<React.SetStateAction<ScannedDevice[]>>;
  setSshStatus: React.Dispatch<React.SetStateAction<Record<string, SshAuthStatus>>>;
  setAddingDevice: (d: ScannedDevice | null) => void;
}

function persistenceErrorMessage(error: unknown): string {
  const apiError = error as Partial<DevicePersistenceError>;
  if (apiError.message) return apiError.message;
  return 'No se recibió confirmación del servidor';
}

export function useDeviceLibrary({
  nodesLength, setScanResults, setSshStatus, setAddingDevice,
}: UseDeviceLibraryInput) {
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingIdsRef = useRef<Set<string>>(new Set());

  // Ref sincronizado con `savedDevices` para lookup síncrono dentro de
  // handlers async. Sin este ref, el patrón `setSavedDevices(prev => ...)`
  // del fix §37-B1 dejaba `merged` como undefined en la siguiente línea
  // (React no garantiza ejecución sincrónica del functional updater — se
  // procesa en el próximo flush, después del próximo `await`). El bug se
  // manifestaba como crash al guardar: `Cannot read properties of undefined
  // (reading 'cachedStats')` en deviceDb.saveSingle.
  const savedDevicesRef = useRef<SavedDevice[]>([]);
  useEffect(() => { savedDevicesRef.current = savedDevices; }, [savedDevices]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  }, []);

  // Carga inicial desde IndexedDB
  useEffect(() => {
    deviceDb.load().then(devices => {
      setSavedDevices(devices);
      setSavedIds(new Set(devices.map(d => d.id)));
    }).catch(error => {
      showToast(`No se pudieron cargar los dispositivos: ${persistenceErrorMessage(error)}`);
    });
  }, [showToast]);

  // Recarga si se eliminó un nodo (puede haber cascadeado dispositivos)
  const nodesLengthRef = useRef(nodesLength);
  useEffect(() => {
    const prev = nodesLengthRef.current;
    nodesLengthRef.current = nodesLength;
    if (prev > nodesLength) {
      deviceDb.load().then(devices => {
        setSavedDevices(devices);
        setSavedIds(new Set(devices.map(d => d.id)));
      }).catch(error => {
        showToast(`No se pudieron recargar los dispositivos: ${persistenceErrorMessage(error)}`);
      });
    }
  }, [nodesLength, showToast]);

  const handleAddDevice = useCallback(async (device: SavedDevice): Promise<boolean> => {
    if (savingIdsRef.current.has(device.id)) return false;
    savingIdsRef.current.add(device.id);
    setSavingIds(prev => new Set(prev).add(device.id));

    try {
      const prevList = savedDevicesRef.current;
      const existing = prevList.find(d => d.id === device.id);
      const wasExisting = !!existing;
      const merged: SavedDevice = existing
        ? { ...existing, ...device, addedAt: existing.addedAt }
        : device;

      // Persistir primero. El estado React sólo cambia si el backend confirma.
      await deviceDb.saveSingle(merged);
      setSavedDevices(prev => {
        const current = prev.find(d => d.id === device.id);
        const confirmed = current
          ? { ...current, ...device, addedAt: current.addedAt }
          : device;
        return current
          ? prev.map(d => d.id === device.id ? confirmed : d)
          : [...prev, confirmed];
      });
      setSavedIds(prev => {
        if (prev.has(device.id)) return prev;
        const next = new Set(prev);
        next.add(device.id);
        return next;
      });
      setAddingDevice(null);

      // El enriquecimiento no bloquea la confirmación del guardado inicial.
      if (merged.sshUser && merged.sshPass && !merged.cachedStats) {
        showToast('Guardado. Conectando SSH para obtener datos…');
        void (async () => {
          try {
            const res = await fetchWithTimeout(`${API_BASE_URL}/api/device/antenna`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deviceIP: merged.ip, deviceUser: merged.sshUser,
                devicePass: merged.sshPass, devicePort: merged.sshPort ?? 22,
              }),
            }, 20_000);
            const data = await res.json();
            if (!res.ok || !data.success || !data.stats) {
              showToast('Guardado. SSH sin respuesta aún');
              return;
            }

            const s = data.stats;
            const enriched: SavedDevice = {
              ...merged, lastSeen: Date.now(),
              name: s.deviceName || merged.name, model: s.deviceModel || merged.model,
              firmware: s.firmwareVersion || merged.firmware, mac: s.wlanMac || merged.mac,
              essid: s.essid ?? merged.essid, frequency: s.frequency ?? merged.frequency,
              deviceName: s.deviceName ?? merged.deviceName, lanMac: s.lanMac ?? merged.lanMac,
              security: s.security ?? merged.security, channelWidth: s.channelWidth ?? merged.channelWidth,
              networkMode: s.networkMode ?? merged.networkMode, chains: s.chains ?? merged.chains,
              apMac: s.apMac ?? merged.apMac, cachedStats: s,
            };
            await deviceDb.saveSingle(enriched);
            setSavedDevices(prev => prev.map(d => d.id === enriched.id ? enriched : d));

            setScanResults(prev => {
              const next = [...prev];
              const idx = next.findIndex(r => r.ip === merged.ip);
              if (idx !== -1) {
                next[idx] = {
                  ...next[idx],
                  sshUser: merged.sshUser,
                  sshPass: merged.sshPass,
                  sshPort: merged.sshPort,
                  cachedStats: s,
                  name: s.deviceName || next[idx].name,
                  model: s.deviceModel || next[idx].model,
                  firmware: s.firmwareVersion || next[idx].firmware,
                  mac: s.wlanMac || next[idx].mac,
                  essid: s.essid ?? next[idx].essid,
                  frequency: s.frequency ?? next[idx].frequency,
                  role: (s.mode === 'ap' || s.mode === 'master') ? 'ap' : s.mode === 'sta' ? 'sta' : next[idx].role,
                };
              }
              return next;
            });
            setSshStatus(prev => ({ ...prev, [merged.ip]: 'success' }));
            showToast('Dispositivo guardado con datos completos');
          } catch (error) {
            showToast(`Dispositivo guardado, pero no se pudieron actualizar sus datos: ${persistenceErrorMessage(error)}`);
          }
        })();
      } else {
        showToast(wasExisting
          ? 'Dispositivo actualizado'
          : merged.cachedStats ? 'Dispositivo guardado (con estadísticas)' : 'Dispositivo guardado');
      }
      return true;
    } catch (error) {
      showToast(`No se pudo guardar el dispositivo: ${persistenceErrorMessage(error)}`);
      return false;
    } finally {
      savingIdsRef.current.delete(device.id);
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(device.id);
        return next;
      });
    }
  }, [setAddingDevice, setScanResults, setSshStatus, showToast]);

  const handleRemoveDevice = useCallback(async (id: string) => {
    try {
      await deviceDb.removeSingle(id);
      setSavedDevices(prev => prev.filter(d => d.id !== id));
      setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (error) {
      showToast(`No se pudo eliminar el dispositivo: ${persistenceErrorMessage(error)}`);
    }
  }, [showToast]);

  const handleUpdateDevice = useCallback(async (updated: SavedDevice): Promise<boolean> => {
    try {
      await deviceDb.saveSingle(updated);
      setSavedDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
      return true;
    } catch (error) {
      showToast(`No se pudo actualizar el dispositivo: ${persistenceErrorMessage(error)}`);
      return false;
    }
  }, [showToast]);

  // Guardado rápido (SSH ya validado durante el scan). Si la IP cae fuera del
  // segmento del nodo, abre el modal de creación para que el operador confirme.
  const handleDirectSave = useCallback(async (dev: ScannedDevice, node: NodeInfo) => {
    if (node.segmento_lan && !ipInCidr(dev.ip, node.segmento_lan)) {
      setAddingDevice(dev);
      return false;
    }
    const deviceId = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
    const s = dev.cachedStats;
    const rawMode = s?.mode || dev.role;
    const roleNorm: 'ap' | 'sta' | 'unknown' =
      rawMode === 'ap' || rawMode === 'master' ? 'ap' : rawMode === 'sta' ? 'sta' : 'unknown';
    const saved: SavedDevice = {
      id: deviceId,
      mac: s?.wlanMac || dev.mac,
      ip: dev.ip,
      name: s?.deviceName || dev.name,
      model: s?.deviceModel || dev.model,
      firmware: s?.firmwareVersion || dev.firmware,
      role: roleNorm,
      parentAp: dev.parentAp,
      essid: s?.essid ?? dev.essid,
      frequency: s?.frequency ?? dev.frequency,
      nodeId: node.id,
      nodeName: node.nombre_nodo,
      sshUser: dev.sshUser,
      sshPass: dev.sshPass,
      sshPort: dev.sshPort !== 22 ? dev.sshPort : undefined,
      deviceName: s?.deviceName,
      lanMac: s?.lanMac ?? undefined,
      security: s?.security ?? undefined,
      channelWidth: s?.channelWidth,
      networkMode: s?.networkMode ?? undefined,
      chains: s?.chains ?? undefined,
      apMac: s?.apMac ?? undefined,
      cachedStats: s,
      addedAt: Date.now(),
      lastSeen: Date.now(),
    };
    return handleAddDevice(saved);
  }, [handleAddDevice, setAddingDevice]);

  return {
    savedDevices,
    savedIds,
    savingIds,
    toast,
    handleAddDevice,
    handleRemoveDevice,
    handleUpdateDevice,
    handleDirectSave,
    showToast,
  };
}
