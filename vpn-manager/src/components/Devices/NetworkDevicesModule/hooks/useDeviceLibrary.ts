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
import { deviceDb } from '../../../../store/deviceDb';
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

export function useDeviceLibrary({
  nodesLength, setScanResults, setSshStatus, setAddingDevice,
}: UseDeviceLibraryInput) {
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    });
  }, []);

  // Recarga si se eliminó un nodo (puede haber cascadeado dispositivos)
  const nodesLengthRef = useRef(nodesLength);
  useEffect(() => {
    const prev = nodesLengthRef.current;
    nodesLengthRef.current = nodesLength;
    if (prev > nodesLength) {
      deviceDb.load().then(devices => {
        setSavedDevices(devices);
        setSavedIds(new Set(devices.map(d => d.id)));
      });
    }
  }, [nodesLength]);

  const handleAddDevice = useCallback(async (device: SavedDevice) => {
    // Computamos `merged` SINCRÓNICAMENTE desde el ref para tenerlo disponible
    // antes del `await` siguiente. El functional setState (más abajo) recalcula
    // el merge con el `prev` que React le pasa: si hubo un save concurrente
    // entre la lectura del ref y el commit, el segundo merge re-aplica los
    // nuevos campos sobre la versión actual — idempotente porque
    // saveSingle es un upsert por id en el backend.
    const prevList = savedDevicesRef.current;
    const existing = prevList.find(d => d.id === device.id);
    const wasExisting = !!existing;
    const merged: SavedDevice = existing
      ? { ...existing, ...device, addedAt: existing.addedAt }
      : device;

    setSavedDevices(prev => {
      const e = prev.find(d => d.id === device.id);
      const m = e ? { ...e, ...device, addedAt: e.addedAt } : device;
      return e
        ? prev.map(d => d.id === device.id ? m : d)
        : [...prev, m];
    });
    setSavedIds(prev => {
      if (prev.has(device.id)) return prev;
      const next = new Set(prev);
      next.add(device.id);
      return next;
    });
    await deviceDb.saveSingle(merged);
    setAddingDevice(null);

    // Si tiene creds SSH pero no stats, intentamos enriquecer en background
    if (merged.sshUser && merged.sshPass && !merged.cachedStats) {
      showToast('Guardado. Conectando SSH para obtener datos…');
      try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/api/device/antenna`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceIP: merged.ip, deviceUser: merged.sshUser,
            devicePass: merged.sshPass, devicePort: merged.sshPort ?? 22,
          }),
        }, 20_000);
        const d = await res.json();
        if (d.success && d.stats) {
          const s = d.stats;
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
          setSavedDevices(prev => prev.map(d => d.id === enriched.id ? enriched : d));
          await deviceDb.saveSingle(enriched);

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
        } else {
          showToast('Guardado. SSH sin respuesta aún');
        }
      } catch {
        showToast('Guardado. No se pudo conectar por SSH');
      }
    } else {
      showToast(wasExisting
        ? 'Dispositivo actualizado'
        : merged.cachedStats ? 'Dispositivo guardado (con estadísticas)' : 'Dispositivo guardado');
    }
  }, [setAddingDevice, setScanResults, setSshStatus, showToast]);

  const handleRemoveDevice = useCallback(async (id: string) => {
    setSavedDevices(prev => prev.filter(d => d.id !== id));
    setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    await deviceDb.removeSingle(id);
  }, []);

  const handleUpdateDevice = useCallback(async (updated: SavedDevice) => {
    setSavedDevices(prev => prev.map(d => d.id === updated.id ? updated : d));
    await deviceDb.saveSingle(updated);
  }, []);

  // Guardado rápido (SSH ya validado durante el scan). Si la IP cae fuera del
  // segmento del nodo, abre el modal de creación para que el operador confirme.
  const handleDirectSave = useCallback(async (dev: ScannedDevice, node: NodeInfo) => {
    if (node.segmento_lan && !ipInCidr(dev.ip, node.segmento_lan)) {
      setAddingDevice(dev);
      return;
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
      lanMac: s?.lanMac,
      security: s?.security,
      channelWidth: s?.channelWidth,
      networkMode: s?.networkMode,
      chains: s?.chains,
      apMac: s?.apMac,
      cachedStats: s,
      addedAt: Date.now(),
      lastSeen: Date.now(),
    };
    await handleAddDevice(saved);
  }, [handleAddDevice, setAddingDevice]);

  return {
    savedDevices,
    savedIds,
    toast,
    handleAddDevice,
    handleRemoveDevice,
    handleUpdateDevice,
    handleDirectSave,
    showToast,
  };
}
