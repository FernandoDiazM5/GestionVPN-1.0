import { useState } from 'react';
import { X, Cpu, Wifi, Radio, AlertCircle, Check } from 'lucide-react';
import type { AddDeviceModalProps } from '../types';
import type { SavedDevice } from '../../../../types/devices';
import { ipInCidr } from '../constants';

export function AddDeviceModal({ device, node, existing, onSave, onClose }: AddDeviceModalProps) {
  const [sshUser, setSshUser] = useState(existing?.sshUser ?? device.sshUser ?? 'ubnt');
  const [sshPass, setSshPass] = useState(existing?.sshPass ?? device.sshPass ?? '');
  const [sshPort, setSshPort] = useState(existing?.sshPort ?? device.sshPort ?? 22);
  const [routerPort, setRouterPort] = useState(existing?.routerPort ?? 8075);
  const prefilledFromScan = !existing && !!device.sshPass;

  const deviceId = device.mac ? device.mac.replace(/:/g, '') : device.ip.replace(/\./g, '');

  const handleSave = () => {
    const saved: SavedDevice = {
      id: deviceId,
      mac: device.mac,
      ip: device.ip,
      name: device.name,
      model: device.model,
      firmware: device.firmware,
      role: (device.role === 'ap' || (device.role as string) === 'master') ? 'ap' : device.role === 'sta' ? 'sta' : 'unknown',
      parentAp: device.parentAp,
      essid: device.essid,
      frequency: device.frequency,
      nodeId: node.id,
      nodeName: node.nombre_nodo,
      sshUser: sshUser || undefined,
      sshPass: sshPass || undefined,
      sshPort: sshPort !== 22 ? sshPort : undefined,
      routerPort: routerPort !== 8075 ? routerPort : undefined,
      addedAt: Date.now(),
    };
    onSave(saved);
  };

  const isEdit = !!existing;

  return (
    <div className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel modal-panel-sm p-6 space-y-5 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100">{isEdit ? 'Editar dispositivo' : 'Guardar dispositivo'}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{device.name} · {device.model} · {device.ip}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SSH */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
            <Cpu className="w-3 h-3" /><span>SSH — Antena Ubiquiti</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Usuario</label>
              <input value={sshUser} onChange={e => setSshUser(e.target.value)} className="input-field w-full text-xs" placeholder="ubnt" />
            </div>
            <div>
              <label className="text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Puerto SSH</label>
              <input type="number" value={sshPort} onChange={e => setSshPort(+e.target.value)} className="input-field w-full text-xs" />
            </div>
          </div>
          <div>
            <label className="text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Clave SSH
              {prefilledFromScan && (
                <span className="ml-2 normal-case font-normal text-emerald-600">✓ obtenida del escaneo</span>
              )}
            </label>
            <input
              type="password"
              value={sshPass}
              onChange={e => setSshPass(e.target.value)}
              className={`input-field w-full text-xs ${prefilledFromScan ? 'bg-emerald-50 border-emerald-200' : ''}`}
              placeholder="contraseña SSH"
            />
          </div>
        </div>

        {/* Puerto WebUI router */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
            <Wifi className="w-3 h-3" /><span>Router del cliente</span>
          </p>
          <div>
            <label className="text-2xs sm:text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Puerto WebUI <span className="normal-case font-normal text-slate-400 dark:text-slate-500">(acceso en {device.ip}:puerto)</span>
            </label>
            <input type="number" value={routerPort} onChange={e => setRouterPort(+e.target.value)} className="input-field w-full text-xs" />
          </div>
        </div>

        {/* Nodo */}
        <div className="bg-slate-50 rounded-xl p-3 flex items-center space-x-2 dark:bg-slate-800/60">
          <Radio className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <div>
            <p className="text-xs text-slate-500">Nodo asociado</p>
            <p className="text-xs font-bold text-slate-700">
              {node.nombre_nodo}
              {node.segmento_lan && <span className="font-mono font-normal text-slate-500 dark:text-slate-400 ml-1">({node.segmento_lan})</span>}
            </p>
          </div>
        </div>

        {/* Advertencia de subred incorrecta */}
        {node.segmento_lan && !ipInCidr(device.ip, node.segmento_lan) && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 dark:bg-amber-500/10 dark:border-amber-500/30">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700">IP fuera del nodo seleccionado</p>
              <p className="text-2xs text-amber-600 mt-0.5">
                <span className="font-mono">{device.ip}</span> no pertenece a <span className="font-mono">{node.segmento_lan}</span>.<br />
                Verifica que el nodo sea correcto antes de guardar.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all active:scale-[0.98]">
            <Check className="w-4 h-4" />
            <span>{isEdit ? 'Actualizar' : 'Guardar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
