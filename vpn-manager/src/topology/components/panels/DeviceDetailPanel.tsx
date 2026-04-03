import { useEffect, useState } from 'react';
import { X, Network, Radio, Wifi, Signal, Activity } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { topologyDb } from '../../db/db';
import { useTopoUiStore } from '../../store/topoUiStore';
import type { Device } from '../../db/tables';

function getDeviceIcon(device: Device) {
  switch (device.type) {
    case 'vpn_node':
      return <Network size={18} className="text-indigo-600" />;
    case 'ap':
      return <Wifi size={18} className="text-emerald-600" />;
    case 'ptp':
      return <Radio size={18} className="text-blue-500" />;
    default:
      return <Radio size={18} className="text-sky-500" />;
  }
}

function statusBadge(status: Device['status']) {
  switch (status) {
    case 'online':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Online
        </span>
      );
    case 'offline':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-500 border border-red-200 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Offline
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-200 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
          Desconocido
        </span>
      );
  }
}

export default function DeviceDetailPanel() {
  const { selectedDeviceId, setSelectedDeviceId } = useTopoUiStore();
  const [visible, setVisible] = useState(false);

  const device = useLiveQuery(
    () => (selectedDeviceId ? topologyDb.devices.get(selectedDeviceId) : undefined),
    [selectedDeviceId]
  );

  useEffect(() => {
    if (device) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [device]);

  if (!device) return null;

  const isVpn = device.type === 'vpn_node';
  const isCpe = device.role === 'cpe';
  const isAp = device.role === 'ap';

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg transition-transform duration-200 z-20 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-50 rounded-lg">{getDeviceIcon(device)}</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">{device.name}</span>
                {statusBadge(device.status)}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-slate-500">{device.model}</span>
                <span className="text-xs text-slate-400">{device.brand}</span>
                {device.ipAddress && (
                  <span className="text-xs font-mono text-slate-400">{device.ipAddress}</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setSelectedDeviceId(null)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Extra details row */}
        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-100 flex-wrap">
          <div className="text-xs">
            <span className="text-slate-400">Tipo:</span>{' '}
            <span className="text-slate-600 font-medium">
              {isVpn ? 'Nodo VPN' : isAp ? 'Access Point' : isCpe ? 'CPE' : device.type}
            </span>
          </div>

          {/* VPN node specific */}
          {isVpn && device.vpnService && (
            <div className="text-xs">
              <span className="text-slate-400">Protocolo:</span>{' '}
              <span className="text-slate-600 font-medium">
                {device.vpnService === 'wireguard' ? 'WireGuard' : 'SSTP'}
              </span>
            </div>
          )}
          {isVpn && device.vpnIp && (
            <div className="text-xs">
              <span className="text-slate-400">IP Tunel:</span>{' '}
              <span className="text-slate-600 font-mono">{device.vpnIp}</span>
            </div>
          )}
          {isVpn && device.lanSegment && (
            <div className="text-xs">
              <span className="text-slate-400">LAN:</span>{' '}
              <span className="text-slate-600 font-mono">{device.lanSegment}</span>
            </div>
          )}

          {/* AP specific */}
          {isAp && device.cpeCount != null && device.cpeCount > 0 && (
            <div className="text-xs flex items-center gap-1">
              <Activity size={10} className="text-slate-400" />
              <span className="text-slate-400">CPEs:</span>{' '}
              <span className="text-slate-600 font-medium">{device.cpeCount}</span>
            </div>
          )}

          {/* CPE specific - RF metrics */}
          {isCpe && device.signal != null && (
            <div className="text-xs flex items-center gap-1">
              <Signal size={10} className="text-slate-400" />
              <span className="text-slate-400">Signal:</span>{' '}
              <span className={`font-medium ${
                device.signal > -65 ? 'text-emerald-600' :
                device.signal > -75 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {device.signal} dBm
              </span>
            </div>
          )}
          {isCpe && device.ccq != null && (
            <div className="text-xs">
              <span className="text-slate-400">CCQ:</span>{' '}
              <span className="text-slate-600 font-medium">{device.ccq}%</span>
            </div>
          )}
          {isCpe && device.txRate != null && (
            <div className="text-xs">
              <span className="text-slate-400">TX/RX:</span>{' '}
              <span className="text-slate-600 font-medium">
                {device.txRate}/{device.rxRate ?? 0} Mbps
              </span>
            </div>
          )}

          {/* MAC for all */}
          {device.macAddress && (
            <div className="text-xs">
              <span className="text-slate-400">MAC:</span>{' '}
              <span className="text-slate-600 font-mono">{device.macAddress}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
