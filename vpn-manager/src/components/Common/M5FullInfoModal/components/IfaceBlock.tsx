import type { AntennaStats } from '../../../../types/devices';
import M5Row from './M5Row';
import { ifaceStyles } from '../utils/styles';
import { formatMbps, formatBool, formatMeter } from '../utils/formatters';

type IfaceDetail = NonNullable<AntennaStats['ifaceDetails']>[number];

interface IfaceBlockProps {
  ifc: IfaceDetail;
}

export default function IfaceBlock({ ifc }: IfaceBlockProps) {
  return (
    <div className={ifaceStyles.container}>
      <div className={ifaceStyles.header}>
        <p className={ifaceStyles.ifname}>{ifc.ifname}</p>
        {ifc.hwaddr && <p className={ifaceStyles.hwaddr}>{ifc.hwaddr}</p>}
        {ifc.ipaddr && <p className={ifaceStyles.ipaddr}>{ifc.ipaddr}</p>}
      </div>
      <div className={ifaceStyles.grid}>
        {ifc.mtu != null && <M5Row label="mtu" value={String(ifc.mtu)} />}
        {ifc.enabled != null && <M5Row label="enabled" value={formatBool(ifc.enabled, 'Sí', 'No')} />}
        {ifc.plugged != null && <M5Row label="plugged" value={formatBool(ifc.plugged, 'Cable conectado', 'Sin cable')} />}
        {ifc.speed != null && <M5Row label="speed" value={formatMbps(ifc.speed)} />}
        {ifc.duplex != null && <M5Row label="duplex" value={formatBool(ifc.duplex, 'Full', 'Half')} />}
        {ifc.dhcpc != null && <M5Row label="dhcpc" value={formatBool(ifc.dhcpc, 'Activo', 'No')} />}
        {ifc.dhcpd != null && <M5Row label="dhcpd" value={formatBool(ifc.dhcpd, 'Activo', 'No')} />}
        {ifc.snr != null && <M5Row label="snr" value={`${ifc.snr} dB`} />}
        {ifc.cableLen != null && <M5Row label="cable_len" value={formatMeter(ifc.cableLen)} />}
        {ifc.txBytesIfc != null && <M5Row label="tx_bytes" value={`${(ifc.txBytesIfc / 1024 / 1024).toFixed(1)} MB`} />}
        {ifc.rxBytesIfc != null && <M5Row label="rx_bytes" value={`${(ifc.rxBytesIfc / 1024 / 1024).toFixed(1)} MB`} />}
        {ifc.txErrors != null && <M5Row label="tx_errors" value={String(ifc.txErrors)} />}
        {ifc.rxErrors != null && <M5Row label="rx_errors" value={String(ifc.rxErrors)} />}
      </div>
    </div>
  );
}
